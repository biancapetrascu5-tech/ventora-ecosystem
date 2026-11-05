import { calendarDate, getBillingTerms } from '@ventora/commercial';
import {
  BillingDisputeOpenedV1,
  BillingInvoiceIssuedV1,
  BillingPaymentFailedV1,
  CommercialSetupRequestChangedV1,
  CommercialTrialEndingV1,
} from '@ventora/contracts';
import {
  sendFounderDisputeAlert,
  type NotificationParams,
  type SqlClient,
} from '@ventora/notifications';
import type { OutboxSqlClient } from '@ventora/db-kit';
import { notifyBillingInTx, organizationNameInTx } from '@ventora/organizations';
import { brandLabel } from './account';
import { invoiceAppName } from './invoices';

/*
 * Lot 3.5 — the F3 consumer of the billing notifications (Lot 4.5, S115): a refused payment is
 * told to the owner through notifyBillingInTx, with neutral values (D4-28: names as text, what is
 * said in words as an i18n key, the day as ISO, the amount in minor units + currency).
 *
 * The kinds 3.5 produces:
 *   - payment.pack: a pack bought from the Hub was refused (nothing activated);
 *   - payment.renewal: the subscription's first attempt was refused, Stripe tries again on a day;
 *   - payment.retry: a later attempt was refused, and Stripe still tries once more.
 * Not here: the last refused attempt (payment.lastRetry, with the 14 days of grace, D3-12) and
 * read-only / restored come with Lot 3.8; the invoices with Lot 3.6; the setup notifications with
 * the requests flow (3.8). An application bought on „Direct” has no S115 text for a refusal: the
 * dialog shows the bank's answer and nothing is sent.
 *
 * Runs in the dispatcher's transaction, in the business's context, as billing_rw (Lot 4.1);
 * delivered twice → one notification (the event id is the idempotency key).
 */

type Envelope = { eventId: string; organizationId: string; payload: unknown };

export const billingPaymentFailedConsumer = {
  name: 'notifications.billing-payment-failed',
  handles: [{ type: BillingPaymentFailedV1.type, version: BillingPaymentFailedV1.version }],
  async handle(envelope: Envelope, tx: SqlClient): Promise<void> {
    const p = BillingPaymentFailedV1.parse(envelope.payload);
    const organizationId = envelope.organizationId;
    const business = (await organizationNameInTx(tx, organizationId)) ?? '';
    const amount = { type: 'money' as const, amountMinor: p.amountMinor, currency: p.currency };
    const day = (iso: string) => ({ type: 'date' as const, date: calendarDate(new Date(iso)) });
    let kind: 'payment.pack' | 'payment.renewal' | 'payment.retry';
    let params: NotificationParams;

    if (p.kind === 'purchase') {
      const { rows } = await tx.query(
        `SELECT kind, item_name FROM billing.purchase WHERE id = $1::uuid`,
        [p.purchaseId],
      );
      const purchase = rows[0] as { kind: string; item_name: string } | undefined;
      if (!purchase || purchase.kind !== 'addon') return;
      kind = 'payment.pack';
      params = {
        business,
        amount,
        item: { type: 'key', key: 'billing.have.pack', params: { name: purchase.item_name } },
      };
    } else {
      // the last attempt (no next one) is Lot 3.8's, with the grace period (D3-12)
      if (!p.nextAttemptAt) return;
      if (p.attempt <= 1) {
        const { rows } = await tx.query(
          `SELECT brand, last4 FROM billing.payment_method_ref WHERE is_default AND detached_at IS NULL`,
        );
        const card = rows[0] as { brand: string; last4: string } | undefined;
        kind = 'payment.renewal';
        params = {
          business,
          amount,
          brand: card ? brandLabel(card.brand) : '—',
          last4: card?.last4 ?? '—',
          retryDate: day(p.nextAttemptAt),
        };
      } else {
        kind = 'payment.retry';
        params = { business, amount, retryDate: day(p.nextAttemptAt) };
      }
    }
    await notifyBillingInTx(tx, {
      organizationId,
      kind,
      idempotencyKey: envelope.eventId,
      params,
    });
  },
};

/*
 * Lot 3.6 — „Factura {number} e emisă” (S115 invoice.card / invoice.pack): after the invoice of a
 * card payment is issued, the owner is told in the app and by e-mail, through notifyBillingInTx.
 * A pack bought from the Hub → invoice.pack; the subscription or an application → invoice.card,
 * with the saved card. A storno sends nothing (S115 has no text for it). Delivered twice → one
 * notification (the event id is the idempotency key); `emailed_at` marks the invoice.
 */
export const billingInvoiceIssuedConsumer = {
  name: 'notifications.billing-invoice-issued',
  handles: [{ type: BillingInvoiceIssuedV1.type, version: BillingInvoiceIssuedV1.version }],
  async handle(envelope: Envelope, tx: SqlClient): Promise<void> {
    const p = BillingInvoiceIssuedV1.parse(envelope.payload);
    if (p.kind !== 'invoice' || !p.paymentId) return;
    const organizationId = envelope.organizationId;
    const { rows } = await tx.query(
      `SELECT i.series, i.number, i.amount_minor::text AS amount_minor, i.currency,
              p.kind AS payment_kind, u.kind AS purchase_kind, u.item_name, u.application_id
         FROM billing.invoice i
         JOIN billing.payment p ON p.id = i.payment_id
         LEFT JOIN billing.purchase u ON u.id = p.purchase_id
        WHERE i.id = $1::uuid AND i.status = 'issued'`,
      [p.invoiceId],
    );
    const inv = rows[0] as
      | {
          series: string;
          number: string;
          amount_minor: string;
          currency: 'RON' | 'EUR';
          payment_kind: 'purchase' | 'subscription';
          purchase_kind: 'addon' | 'application' | null;
          item_name: string | null;
          application_id: string | null;
        }
      | undefined;
    if (!inv) return;
    const business = (await organizationNameInTx(tx, organizationId)) ?? '';
    const number = `${inv.series}-${inv.number}`;
    const amount = {
      type: 'money' as const,
      amountMinor: Number(inv.amount_minor),
      currency: inv.currency,
    };
    let kind: 'invoice.pack' | 'invoice.card';
    let params: NotificationParams;
    if (inv.purchase_kind === 'addon') {
      kind = 'invoice.pack';
      params = {
        business,
        number,
        amount,
        item: { type: 'key', key: 'billing.have.pack', params: { name: inv.item_name ?? '' } },
      };
    } else {
      const { rows: cards } = await tx.query(
        `SELECT brand, last4 FROM billing.payment_method_ref WHERE is_default AND detached_at IS NULL`,
      );
      const card = cards[0] as { brand: string; last4: string } | undefined;
      let what: NotificationParams[string];
      if (inv.purchase_kind === 'application' && inv.application_id) {
        what = {
          type: 'key',
          key: 'billing.have.app',
          params: { app: invoiceAppName(inv.application_id) },
        };
      } else {
        const terms = await getBillingTerms(organizationId);
        what = {
          type: 'key',
          key: 'billing.have.bundle',
          params: { name: terms?.bundle?.planName?.trim() || 'Ventora Systems' },
        };
      }
      kind = 'invoice.card';
      params = {
        business,
        number,
        amount,
        what,
        brand: card ? brandLabel(card.brand) : '—',
        last4: card?.last4 ?? '—',
      };
    }
    await notifyBillingInTx(tx, { organizationId, kind, idempotencyKey: envelope.eventId, params });
    await tx.query(
      `UPDATE billing.invoice SET emailed_at = COALESCE(emailed_at, now()), updated_at = now()
        WHERE id = $1::uuid`,
      [p.invoiceId],
    );
  },
};

/*
 * Lot 3.6 — the dispute alert (decision on the 3.5 report): `billing.dispute.opened` → an e-mail
 * to FOUNDER_ALERTS_EMAIL with the business, the amount, the reason and the deadline to answer in
 * Stripe. Not set, or not delivered → the consumer fails and is retried (then a dead letter in
 * Founder). The e-mail leaves before the dispatcher's commit: a commit that fails after it may
 * send the alert twice (an internal alert; accepted, see the 3.6 report).
 */
export const billingDisputeAlertConsumer = {
  name: 'billing.dispute-alert',
  handles: [{ type: BillingDisputeOpenedV1.type, version: BillingDisputeOpenedV1.version }],
  async handle(envelope: Envelope, tx: SqlClient): Promise<void> {
    const p = BillingDisputeOpenedV1.parse(envelope.payload);
    const { rows } = await tx.query(
      `SELECT evidence_due_by FROM billing.dispute WHERE stripe_dispute_id = $1`,
      [p.disputeId],
    );
    const dueBy =
      (rows[0] as { evidence_due_by: Date | null } | undefined)?.evidence_due_by ?? null;
    const business = (await organizationNameInTx(tx, envelope.organizationId)) ?? '';
    await sendFounderDisputeAlert({
      business,
      amountMinor: p.amountMinor,
      currency: p.currency,
      reason: p.reason,
      evidenceDueBy: dueBy,
      disputeId: p.disputeId,
      livemode: [process.env.STRIPE_SECRET_KEY, process.env.STRIPE_PUBLISHABLE_KEY].some((k) =>
        (k ?? '').includes('_live_'),
      ),
    });
  },
};

/*
 * Lot 3.8 — the owner's notifications of the life cycle (S115 templates, through
 * notifyBillingInTx): „Perioada de probă pentru {app} se încheie pe {date}” (commercial.trial.ending,
 * the job, 3 days before), „Cererea pentru {app} e acceptată” (the team confirmed: pay the
 * implementation) and „{app} e pornită” (live). These events come from core/commercial's outbox:
 * the consumer's transaction is commercial_rw's, which reads the price and the request.
 */
export const commercialTrialEndingConsumer = {
  name: 'notifications.commercial-trial-ending',
  handles: [{ type: CommercialTrialEndingV1.type, version: CommercialTrialEndingV1.version }],
  async handle(
    envelope: { eventId: string; organizationId: string; payload: unknown },
    tx: OutboxSqlClient,
  ): Promise<void> {
    const p = CommercialTrialEndingV1.parse(envelope.payload);
    if (p.kind !== 'application' || !p.applicationId) return;
    const organizationId = envelope.organizationId;
    const { rows } = await tx.query(
      `SELECT p.amount_minor::text AS amount_minor, p.currency
         FROM commercial.application_price p
         JOIN commercial.subscription s ON s.currency = p.currency AND s.canceled_at IS NULL
        WHERE p.application_id = $1 AND p.kind = 'month'
        ORDER BY s.started_on DESC LIMIT 1`,
      [p.applicationId],
    );
    const price = rows[0] as { amount_minor: string; currency: 'RON' | 'EUR' } | undefined;
    await notifyBillingInTx(tx, {
      organizationId,
      kind: 'trial.ending',
      idempotencyKey: envelope.eventId,
      params: {
        business: (await organizationNameInTx(tx, organizationId)) ?? '',
        app: invoiceAppName(p.applicationId),
        date: { type: 'date', date: calendarDate(new Date(p.endsAt)) },
        ...(price
          ? {
              price: {
                type: 'money',
                amountMinor: Number(price.amount_minor),
                currency: price.currency,
              },
            }
          : {}),
      },
    });
  },
};

export const commercialSetupNoticeConsumer = {
  name: 'notifications.commercial-setup',
  handles: [
    {
      type: CommercialSetupRequestChangedV1.type,
      version: CommercialSetupRequestChangedV1.version,
    },
  ],
  async handle(
    envelope: { eventId: string; organizationId: string; payload: unknown },
    tx: OutboxSqlClient,
  ): Promise<void> {
    const p = CommercialSetupRequestChangedV1.parse(envelope.payload);
    if (p.status !== 'confirmed' && p.status !== 'live') return;
    const organizationId = envelope.organizationId;
    const { rows } = await tx.query(
      `SELECT setup_minor::text AS setup_minor, maintenance_minor::text AS maintenance_minor, currency
         FROM commercial.setup_request WHERE id = $1::uuid`,
      [p.setupRequestId],
    );
    const r = rows[0] as
      | { setup_minor: string | null; maintenance_minor: string | null; currency: 'RON' | 'EUR' }
      | undefined;
    if (!r) return;
    const money = (v: string | null) => ({
      type: 'money' as const,
      amountMinor: Number(v ?? 0),
      currency: r.currency,
    });
    await notifyBillingInTx(tx, {
      organizationId,
      kind: p.status === 'confirmed' ? 'setup.accepted' : 'setup.started',
      idempotencyKey: envelope.eventId,
      params: {
        business: (await organizationNameInTx(tx, organizationId)) ?? '',
        app: invoiceAppName(p.applicationId),
        setup: money(r.setup_minor),
        price: money(r.maintenance_minor),
      },
    });
  },
};
