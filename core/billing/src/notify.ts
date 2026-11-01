import { calendarDate } from '@ventora/commercial';
import { BillingPaymentFailedV1 } from '@ventora/contracts';
import type { NotificationParams, SqlClient } from '@ventora/notifications';
import { notifyBillingInTx, organizationNameInTx } from '@ventora/organizations';
import { brandLabel } from './account';

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
