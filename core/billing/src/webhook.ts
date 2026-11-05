import type { PoolClient } from 'pg';
import { openDunning, resolveDunningPaid } from '@ventora/commercial';
import { AuditActions, appendAuditEventInTx, type AuditSqlExecutor } from '@ventora/audit';
import { BillingDisputeOpenedV1 } from '@ventora/contracts';
import { writeOutboxEvent } from '@ventora/db-kit';
import { recordCardInTx } from './account';
import { withBillingModule, withBillingWrite } from './db';
import { refundInTx } from './invoices';
import { activateIfPaid, applyPaymentIntentInTx } from './purchases';
import {
  currencyOf,
  getStripeGateway,
  verifyStripeSignature,
  type PaymentIntentState,
  type StripeEventEnvelope,
} from './stripe';
import {
  invoiceInTx,
  mirrorInTx,
  reconcileSubscription,
  subscriptionFromEvent,
} from './subscriptions';

/*
 * Lot 3.5 — the Stripe webhook (apps/platform/app/api/webhooks/stripe/route.ts):
 *
 *   1. the signature is checked against STRIPE_WEBHOOK_SECRET: a wrong one → 400, no effect;
 *   2. the business is the one whose Stripe customer it is (billing_customer), never what the
 *      event's metadata says;
 *   3. `event.id` is written in billing.stripe_event in the same transaction as the event's
 *      effect: the same event twice → one effect; an effect that fails rolls the row back, so
 *      Stripe's retry processes it again;
 *   4. what has to happen after the commit (the activation of a paid purchase in the commercial
 *      model, the Stripe subscription after a card is saved) is idempotent and runs again on a
 *      duplicate, so a failure there is retried by Stripe too.
 *
 * Events in the wrong order do not take a state back: the purchases only move forward, the
 * subscription's mirror ignores an event older than the last one applied.
 */

export class WebhookSignatureError extends Error {
  constructor() {
    super('Invalid Stripe signature');
    this.name = 'WebhookSignatureError';
  }
}

export interface WebhookOutcome {
  status: 'processed' | 'duplicate' | 'ignored';
  eventId: string;
  type: string;
  organizationId: string | null;
  /** A chargeback was opened: the route reports it to Sentry for the Ventora team. */
  disputeOpened?: boolean;
}

/** Signature, then processing. Throws WebhookSignatureError for a body Stripe did not sign. */
export async function handleStripeWebhook(
  rawBody: string,
  signature: string | null,
): Promise<WebhookOutcome> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('[billing] STRIPE_WEBHOOK_SECRET is not set');
  let event: StripeEventEnvelope;
  try {
    event = verifyStripeSignature(rawBody, signature ?? '', secret);
  } catch {
    throw new WebhookSignatureError();
  }
  return processStripeEvent(event);
}

const str = (v: unknown): string | null => {
  if (!v) return null;
  if (typeof v === 'string') return v;
  return (v as { id?: string }).id ?? null;
};

/** The business a Stripe event belongs to, from its customer. */
async function organizationOf(event: StripeEventEnvelope): Promise<string | null> {
  let customer = str(event.object.customer);
  if (!customer && event.type.startsWith('charge.dispute.')) {
    // a dispute names the payment, not the customer
    const pi = str(event.object.payment_intent);
    if (pi) customer = (await getStripeGateway().retrievePaymentIntent(pi)).customerId;
  }
  if (!customer) return null;
  const { rows } = await withBillingModule((client) =>
    client.query<{ organization_id: string | null }>(
      `SELECT billing.organization_of_customer($1) AS organization_id`,
      [customer],
    ),
  );
  return rows[0]?.organization_id ?? null;
}

/** A PaymentIntent from an event object (no client secret: only the dialog has it). */
function paymentIntentFromEvent(o: Record<string, unknown>): PaymentIntentState {
  const error = o.last_payment_error as
    { code?: string; decline_code?: string; message?: string } | null | undefined;
  return {
    id: String(o.id),
    status: o.status as PaymentIntentState['status'],
    clientSecret: null,
    amountMinor: Number(o.amount),
    currency: currencyOf(String(o.currency)),
    customerId: str(o.customer),
    chargeId: str(o.latest_charge),
    failureCode: error ? (error.decline_code ?? error.code ?? 'payment_failed') : null,
    failureMessage: error?.message ?? null,
    metadata: { ...((o.metadata as Record<string, string> | undefined) ?? {}) },
  };
}

export async function processStripeEvent(event: StripeEventEnvelope): Promise<WebhookOutcome> {
  const organizationId = await organizationOf(event);
  const base = { eventId: event.id, type: event.type, organizationId };
  const created = new Date(event.created * 1000);
  if (!organizationId) {
    // not a Ventora business (another use of the account): recorded once, nothing else
    await withBillingModule((client) =>
      client.query(
        `INSERT INTO billing.stripe_event (event_id, type, organization_id, stripe_created_at)
         VALUES ($1, $2, NULL, $3) ON CONFLICT (event_id) DO NOTHING`,
        [event.id, event.type, created],
      ),
    );
    return { status: 'ignored', ...base };
  }

  let disputeOpened = false;
  const duplicate = await withBillingWrite(organizationId, async (client, exec) => {
    const { rows } = await client.query(
      `INSERT INTO billing.stripe_event (event_id, type, organization_id, stripe_created_at)
       VALUES ($1, $2, $3, $4) ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
      [event.id, event.type, organizationId, created],
    );
    if (!rows[0]) return true;
    disputeOpened = await effectInTx(client, exec, organizationId, event, created);
    return false;
  });

  // idempotent, also on a duplicate: an earlier delivery may have committed and then failed here
  await afterCommit(organizationId, event);
  return {
    status: duplicate ? 'duplicate' : 'processed',
    ...base,
    ...(disputeOpened ? { disputeOpened } : {}),
  };
}

async function effectInTx(
  client: PoolClient,
  exec: AuditSqlExecutor,
  organizationId: string,
  event: StripeEventEnvelope,
  created: Date,
): Promise<boolean> {
  const o = event.object;
  switch (event.type) {
    case 'payment_intent.succeeded':
    case 'payment_intent.processing':
    case 'payment_intent.requires_action':
    case 'payment_intent.payment_failed':
    case 'payment_intent.canceled':
      await applyPaymentIntentInTx(client, exec, organizationId, paymentIntentFromEvent(o));
      return false;
    case 'setup_intent.succeeded':
      await recordCardInTx(client, exec, {
        organizationId,
        setupIntentId: String(o.id),
        actorUserId: null,
      });
      return false;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
      await mirrorInTx(client, subscriptionFromEvent(o), created);
      return false;
    case 'invoice.paid':
    case 'invoice.payment_failed':
      await invoiceInTx(client, organizationId, event.type, o);
      return false;
    case 'charge.refunded':
      // Lot 3.6 (D3-10): a full refund made by Founder in Stripe → the storno of the invoice
      await refundInTx(client, exec, organizationId, o);
      return false;
    case 'charge.dispute.created':
      await disputeInTx(client, exec, organizationId, o, true);
      return true;
    case 'charge.dispute.updated':
    case 'charge.dispute.closed':
      await disputeInTx(client, exec, organizationId, o, false);
      return false;
    default:
      return false;
  }
}

async function afterCommit(organizationId: string, event: StripeEventEnvelope): Promise<void> {
  if (event.type.startsWith('payment_intent.')) {
    const purchaseId = (event.object.metadata as Record<string, string> | undefined)?.purchase_id;
    // a line bought (monthly pack, application) joins the Stripe subscription right away
    const activation = purchaseId ? await activateIfPaid(organizationId, purchaseId) : null;
    if (activation?.activated && activation.recurring) {
      await reconcileSubscription(organizationId);
    }
  } else if (event.type === 'setup_intent.succeeded') {
    // a card saved: the subscription is charged with it from now on (D3-4)
    await reconcileSubscription(organizationId);
  } else if (event.type === 'invoice.payment_failed' || event.type === 'invoice.paid') {
    await dunningAfterInvoice(organizationId, event);
  }
}

/**
 * Lot 3.8 (D3-12, N5): Stripe gave up on an invoice (`next_payment_attempt` null after the last
 * retry; the account is set to leave the subscription past-due) → the non-payment case, from the
 * event's time; 14 days of grace. A paid invoice closes the case of that invoice (and a `trial`
 * case: the business pays now). Both idempotent.
 */
async function dunningAfterInvoice(
  organizationId: string,
  event: StripeEventEnvelope,
): Promise<void> {
  const o = event.object;
  const invoiceId = String(o.id);
  if (event.type === 'invoice.paid') {
    if (Number(o.amount_paid) > 0) await resolveDunningPaid(organizationId, invoiceId);
    return;
  }
  if (o.next_payment_attempt || !Number(o.amount_due)) return;
  await openDunning({
    organizationId,
    cause: 'card',
    sourceRef: invoiceId,
    amountMinor: Number(o.amount_due),
    currency: String(o.currency).toUpperCase() === 'EUR' ? 'EUR' : 'RON',
    overdueSince: new Date(event.created * 1000),
  });
}

/**
 * A chargeback: recorded with its state, audited; the decision stays manual at Founder (§3.5).
 * The opening also goes out as an event (and to Sentry, from the route).
 */
async function disputeInTx(
  client: PoolClient,
  exec: AuditSqlExecutor,
  organizationId: string,
  d: Record<string, unknown>,
  opened: boolean,
): Promise<void> {
  const id = String(d.id);
  const amountMinor = Number(d.amount);
  const currency = currencyOf(String(d.currency));
  const reason = String(d.reason ?? 'general').slice(0, 64);
  const status = String(d.status ?? 'needs_response').slice(0, 32);
  // Lot 3.6: the deadline to answer in Stripe (Founder · Prezentare, „Răspunde în Stripe”)
  const dueBy = Number((d.evidence_details as { due_by?: number } | null | undefined)?.due_by);
  const evidenceDueBy = Number.isFinite(dueBy) && dueBy > 0 ? new Date(dueBy * 1000) : null;
  await client.query(
    `INSERT INTO billing.dispute
       (stripe_dispute_id, organization_id, stripe_charge_id, amount_minor, currency, reason, status,
        evidence_due_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (stripe_dispute_id) DO UPDATE
       SET status = EXCLUDED.status,
           evidence_due_by = COALESCE(EXCLUDED.evidence_due_by, billing.dispute.evidence_due_by),
           updated_at = now()`,
    [
      id,
      organizationId,
      str(d.charge) ?? 'unknown',
      amountMinor,
      currency,
      reason,
      status,
      evidenceDueBy,
    ],
  );
  if (!opened) return;
  await appendAuditEventInTx(exec, {
    category: 'commercial',
    action: AuditActions.billingDisputeOpened,
    outcome: 'success',
    actorType: 'system',
    organizationId,
    targetType: 'dispute',
    targetId: id,
    metadata: { amountMinor, currency, reason },
  });
  await writeOutboxEvent(client, 'billing', BillingDisputeOpenedV1, {
    organizationId,
    sourceApp: BillingDisputeOpenedV1.sourceApp,
    resourceId: id,
    payload: { disputeId: id, amountMinor, currency, reason },
  });
}
