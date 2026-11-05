import type { PoolClient } from 'pg';
import { AuditActions, appendAuditEventInTx, type AuditSqlExecutor } from '@ventora/audit';
import {
  activatePurchasedAddon,
  activatePurchasedApplication,
  billingPeriod,
  markSetupPaid,
  calendarDate,
  getBillingTerms,
  getPurchaseQuote,
  type PurchaseItem,
  type PurchaseQuote,
} from '@ventora/commercial';
import { BillingPaymentFailedV1, BillingPaymentSucceededV1 } from '@ventora/contracts';
import { uuidv7, writeOutboxEvent } from '@ventora/db-kit';
import { Conflict, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { assertBuyer, brandLabel, readAccountInTx, type BillingContext } from './account';
import { withBillingRead, withBillingWrite } from './db';
import { reportBillingError } from './report';
import { reconcileSubscription } from './subscriptions';
import { getStripeGateway, type PaymentIntentState, type StripeCurrency } from './stripe';

/*
 * Lot 3.5 — a purchase from the Hub, paid with the saved card (ARCHITECTURE §8.6, D-COM-6):
 *
 *   - a pack for the current month (D3-7): price × packs + setup, once;
 *   - a monthly pack (D3-7) or an application à la carte on „Direct” (D3-24, D3-9): the days left
 *     of the current billing period (prorated) + the setup, now; the line then renews with the
 *     Stripe subscription;
 *
 * The price is read on the server (getPurchaseQuote), never taken from the client. The payment
 * is a PaymentIntent on session with the saved card: 3-D Secure comes back as `requires_action`
 * and is confirmed in the dialog (Stripe.js). Whoever reports the outcome first — the dialog or
 * the webhook — applies it; the activation happens once (`purchase_id` unique in commercial),
 * and a later, older event never takes the state back (paid / succeeded are final).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Not bought directly: the item is „la cerere” (D3-7, D3-24), or the business pays by transfer
 * (D3-11). The Hub shows „Cere activare” instead.
 */
export class PurchaseRefused extends Conflict {
  constructor(readonly reason: 'on_request' | 'manual_payment') {
    super(
      reason === 'on_request'
        ? 'On request: the business asks the Ventora team'
        : 'Manual payment: the business asks the Ventora team',
    );
    this.name = 'PurchaseRefused';
  }
}

export type PurchaseStatus =
  'pending' | 'requires_action' | 'processing' | 'paid' | 'succeeded' | 'failed' | 'canceled';

export interface PurchaseResult {
  purchaseId: string;
  status: PurchaseStatus;
  amountMinor: number;
  currency: StripeCurrency;
  /** Only with `requires_action`: Stripe.js confirms 3-D Secure in the dialog with it. */
  clientSecret?: string;
  /** With `failed`: the bank's reason, as Stripe gives it („Banca spune: …”). */
  failure?: { code: string; message: string | null };
}

export interface PurchasePreview {
  quote: PurchaseQuote;
  /** What is charged now: the price (or the days left of it) + the setup. */
  amountDueMinor: number;
  /** For a line of the subscription: what it costs from the next billing date on. */
  recurringMinor: number | null;
  card: { brand: string; last4: string } | null;
}

/**
 * What a direct purchase costs now and with which card (for the dialog's review step). Refused
 * like the purchase: on request, manual payment, no card, a monthly pack on a yearly
 * subscription, a line without a Stripe subscription.
 */
export async function previewPurchase(
  ctx: BillingContext,
  item: PurchaseItem,
  /**
   * Lot 3.7: the price without a saved card (`card: null`), for the dialog that saves the card
   * in Stripe Elements before paying (an application on „Direct”). The purchase itself still
   * needs the saved card.
   */
  options: { withoutCard?: boolean } = {},
): Promise<PurchasePreview> {
  assertBuyer(ctx);
  const quote = await getPurchaseQuote(ctx.organizationId, item);
  const account = await withBillingRead(ctx.organizationId, readAccountInTx);
  const amountDueMinor = amountDue(quote, account, new Date(), !options.withoutCard);
  return {
    quote,
    amountDueMinor,
    recurringMinor: quote.recurring ? quote.priceMinor : null,
    card: account.card
      ? { brand: brandLabel(account.card.brand), last4: account.card.last4 }
      : null,
  };
}

type Account = Awaited<ReturnType<typeof readAccountInTx>>;

/** The checks shared by the preview and the purchase, then the amount charged now. */
function amountDue(
  quote: PurchaseQuote,
  account: Account,
  now = new Date(),
  requireCard = true,
): number {
  if (quote.purchaseMode !== 'direct') throw new PurchaseRefused('on_request');
  // D3-7 / §8.6: a business on manual payment sees „Cere activare”
  if (account.manualPayment) throw new PurchaseRefused('manual_payment');
  if (requireCard && !account.card) throw new InvalidInput('card', 'No saved card');
  if (!quote.recurring) return quote.priceMinor + quote.setupMinor;
  if (quote.kind === 'addon' && quote.interval !== 'month') {
    // Stripe bills one interval per subscription (Lot 3.2 report): a monthly pack on a yearly
    // subscription stays a request
    throw new InvalidInput('interval', 'A monthly pack needs a monthly subscription');
  }
  const status = account.subscriptionStatus;
  // Lot 3.7: without a saved card there is no Stripe subscription yet; saving the card in the
  // dialog creates it (D3-4), then the purchase checks it — the preview only prices the days left
  if (!requireCard && !account.card) return prorated(quote, now) + quote.setupMinor;
  if (!account.stripeSubscriptionId || !['active', 'trialing'].includes(status ?? '')) {
    throw new InvalidInput('subscription', 'The subscription is not paid with the card');
  }
  // in the trial, Stripe charges the whole line when the trial ends
  if (status === 'trialing') return quote.setupMinor;
  return prorated(quote, now) + quote.setupMinor;
}

/** The days left of the current billing period, at the line's price (D3-7), rounded to the unit. */
export function prorated(
  quote: Pick<PurchaseQuote, 'priceMinor' | 'interval' | 'startedOn'>,
  now = new Date(),
): number {
  const today = calendarDate(now);
  const period = billingPeriod({ startedOn: quote.startedOn, interval: quote.interval }, today);
  const day = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  const total = (day(period.end) - day(period.start)) / 86_400_000;
  const left = (day(period.end) - day(today)) / 86_400_000;
  return Math.round((quote.priceMinor * left) / total);
}

/**
 * The purchase: the quote, the purchase row, then the PaymentIntent with the saved card. The
 * result says what the dialog shows: done, 3-D Secure, processing, or the bank's refusal.
 */
export async function purchase(ctx: BillingContext, item: PurchaseItem): Promise<PurchaseResult> {
  assertBuyer(ctx);
  const organizationId = ctx.organizationId;
  const quote = await getPurchaseQuote(organizationId, item);
  const purchaseId = uuidv7();
  const { account, amount } = await withBillingWrite(organizationId, async (client) => {
    const account = await readAccountInTx(client);
    const amount = amountDue(quote, account);
    await client.query(
      `INSERT INTO billing.purchase
         (id, organization_id, kind, addon_id, application_id, item_name, packs, currency,
          price_minor, setup_minor, recurring, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        purchaseId,
        organizationId,
        quote.kind,
        quote.kind === 'addon' ? quote.itemId : null,
        quote.kind === 'application' ? quote.itemId : null,
        quote.name.slice(0, 128),
        quote.packs,
        quote.currency,
        quote.priceMinor,
        quote.setupMinor,
        quote.recurring,
        ctx.userId,
      ],
    );
    return { account, amount };
  });

  if (amount === 0) {
    // nothing to charge (a free pack, a line during the trial without setup): activate now
    await withBillingWrite(organizationId, (client, exec) =>
      markPaidInTx(client, exec, organizationId, purchaseId, null),
    );
    return finish(organizationId, purchaseId, amount, quote.currency);
  }

  const pi = await getStripeGateway().createPaymentIntent({
    customerId: account.customerId!,
    paymentMethodId: account.card!.paymentMethodId,
    amountMinor: amount,
    currency: quote.currency,
    description:
      quote.kind === 'addon'
        ? `Ventora Systems · ${quote.name}${quote.packs > 1 ? ` × ${quote.packs}` : ''}`
        : `Ventora Systems · ${quote.name}`,
    metadata: { organization_id: organizationId, purchase_id: purchaseId },
    idempotencyKey: `purchase-${purchaseId}`,
  });
  await withBillingWrite(organizationId, (client, exec) =>
    applyPaymentIntentInTx(client, exec, organizationId, pi),
  );
  return finish(organizationId, purchaseId, amount, quote.currency, pi);
}

/**
 * After 3-D Secure in the dialog: the PaymentIntent as Stripe has it now, applied like the
 * webhook would (whichever comes first).
 */
export async function confirmPurchase(
  ctx: BillingContext,
  purchaseId: string,
): Promise<PurchaseResult> {
  assertBuyer(ctx);
  if (!UUID_RE.test(purchaseId ?? '')) throw new InvalidInput('purchaseId');
  const row = await withBillingRead(ctx.organizationId, (client) =>
    readPurchase(client, purchaseId),
  );
  if (!row) throw new ResourceNotFound('Purchase not found');
  if (!row.stripe_payment_intent_id) {
    return finish(ctx.organizationId, purchaseId, 0, row.currency);
  }
  const pi = await getStripeGateway().retrievePaymentIntent(row.stripe_payment_intent_id);
  await withBillingWrite(ctx.organizationId, (client, exec) =>
    applyPaymentIntentInTx(client, exec, ctx.organizationId, pi),
  );
  return finish(ctx.organizationId, purchaseId, pi.amountMinor, row.currency, pi);
}

type PurchaseRow = {
  id: string;
  /** Lot 3.8: `setup` — the implementation of a request (S121), paid once. */
  kind: 'addon' | 'application' | 'setup';
  setup_request_id: string | null;
  addon_id: string | null;
  application_id: string | null;
  packs: number;
  currency: StripeCurrency;
  price_minor: string;
  setup_minor: string;
  recurring: boolean;
  status: PurchaseStatus;
  stripe_payment_intent_id: string | null;
  failure_code: string | null;
  failure_message: string | null;
  created_by_user_id: string;
};

async function readPurchase(
  client: PoolClient,
  purchaseId: string,
  forUpdate = false,
): Promise<PurchaseRow | null> {
  const { rows } = await client.query<PurchaseRow>(
    `SELECT id, kind, addon_id, application_id, setup_request_id, packs, currency, price_minor, setup_minor,
            recurring, status, stripe_payment_intent_id, failure_code, failure_message,
            created_by_user_id
       FROM billing.purchase WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
    [purchaseId],
  );
  return rows[0] ?? null;
}

/** The purchase after its payment step: activate a paid one (once), then what the dialog shows. */
async function finish(
  organizationId: string,
  purchaseId: string,
  amountMinor: number,
  currency: StripeCurrency,
  pi?: PaymentIntentState,
): Promise<PurchaseResult> {
  const activation = await activateIfPaid(organizationId, purchaseId);
  const row = await withBillingRead(organizationId, (client) => readPurchase(client, purchaseId));
  if (activation.activated && activation.recurring) {
    // the line renews with the Stripe subscription from the next billing date (paid until then);
    // if Stripe fails now, the platform job adds it later
    await reconcileSubscription(organizationId).catch((err) =>
      reportBillingError('purchase.stripe-line', err, { organizationId, purchaseId }),
    );
  }
  const status = row!.status;
  return {
    purchaseId,
    status,
    amountMinor,
    currency,
    ...(status === 'requires_action' && pi?.clientSecret ? { clientSecret: pi.clientSecret } : {}),
    ...(status === 'failed'
      ? { failure: { code: row!.failure_code ?? 'payment_failed', message: row!.failure_message } }
      : {}),
  };
}

const IN_PROGRESS: readonly PurchaseStatus[] = ['pending', 'requires_action', 'processing'];

/**
 * A PaymentIntent's state applied to its purchase, in the caller's transaction (the dialog, or
 * the webhook with its stripe_event row). Monotonic: `paid` / `succeeded` / `failed` are not
 * left for an earlier state, whatever order Stripe's events arrive in; a payment that went
 * through after a refusal of the same PaymentIntent still counts.
 */
export async function applyPaymentIntentInTx(
  client: PoolClient,
  exec: AuditSqlExecutor,
  organizationId: string,
  pi: PaymentIntentState,
): Promise<{ purchaseId: string; status: PurchaseStatus } | null> {
  const purchaseId = pi.metadata.purchase_id;
  if (!purchaseId || !UUID_RE.test(purchaseId)) return null;
  const row = await readPurchase(client, purchaseId, true);
  if (!row) return null;
  if (!row.stripe_payment_intent_id) {
    await client.query(
      `UPDATE billing.purchase SET stripe_payment_intent_id = $2, updated_at = now() WHERE id = $1`,
      [purchaseId, pi.id],
    );
  } else if (row.stripe_payment_intent_id !== pi.id) {
    return { purchaseId, status: row.status };
  }
  let status = row.status;
  switch (pi.status) {
    case 'succeeded':
      if (status !== 'paid' && status !== 'succeeded') {
        await markPaidInTx(client, exec, organizationId, purchaseId, pi);
        status = 'paid';
      }
      break;
    case 'processing':
      if (status === 'pending' || status === 'requires_action') status = await set('processing');
      break;
    case 'requires_action':
    case 'requires_confirmation':
      if (status === 'pending') status = await set('requires_action');
      break;
    case 'requires_payment_method':
    case 'canceled':
      if (IN_PROGRESS.includes(status)) {
        await markFailedInTx(client, exec, organizationId, row, pi);
        status = 'failed';
      }
      break;
    default:
      break;
  }
  return { purchaseId, status };

  async function set(next: PurchaseStatus): Promise<PurchaseStatus> {
    await client.query(
      `UPDATE billing.purchase SET status = $2, updated_at = now() WHERE id = $1`,
      [purchaseId, next],
    );
    return next;
  }
}

/** The payment went through: one payment row per charge, the event for the invoice (3.6). */
async function markPaidInTx(
  client: PoolClient,
  _exec: AuditSqlExecutor,
  organizationId: string,
  purchaseId: string,
  pi: PaymentIntentState | null,
): Promise<void> {
  await client.query(
    `UPDATE billing.purchase SET status = 'paid', failure_code = NULL, failure_message = NULL,
            updated_at = now()
      WHERE id = $1 AND status NOT IN ('paid', 'succeeded')`,
    [purchaseId],
  );
  if (!pi) return;
  const paymentId = await insertPayment(client, {
    organizationId,
    purchaseId,
    kind: 'purchase',
    idempotencyKey: pi.chargeId ?? `pi:${pi.id}:succeeded`,
    paymentIntentId: pi.id,
    invoiceId: null,
    attempt: 1,
    status: 'succeeded',
    amountMinor: pi.amountMinor,
    currency: pi.currency,
    failureCode: null,
    nextAttemptAt: null,
  });
  if (paymentId) {
    await writeOutboxEvent(client, 'billing', BillingPaymentSucceededV1, {
      organizationId,
      sourceApp: BillingPaymentSucceededV1.sourceApp,
      resourceId: purchaseId,
      payload: {
        paymentId,
        kind: 'purchase',
        purchaseId,
        invoiceId: null,
        amountMinor: pi.amountMinor,
        currency: pi.currency,
      },
    });
  }
}

/** The bank refused: nothing is activated; the owner is told (payment.pack, through the outbox). */
async function markFailedInTx(
  client: PoolClient,
  exec: AuditSqlExecutor,
  organizationId: string,
  row: PurchaseRow,
  pi: PaymentIntentState,
): Promise<void> {
  const code = pi.failureCode ?? (pi.status === 'canceled' ? 'canceled' : 'payment_failed');
  await client.query(
    `UPDATE billing.purchase SET status = 'failed', failure_code = $2, failure_message = $3,
            updated_at = now()
      WHERE id = $1`,
    [row.id, code.slice(0, 64), pi.failureMessage?.slice(0, 500) ?? null],
  );
  const paymentId = await insertPayment(client, {
    organizationId,
    purchaseId: row.id,
    kind: 'purchase',
    idempotencyKey: pi.chargeId ?? `pi:${pi.id}:failed`,
    paymentIntentId: pi.id,
    invoiceId: null,
    attempt: 1,
    status: 'failed',
    amountMinor: pi.amountMinor,
    currency: pi.currency,
    failureCode: code.slice(0, 64),
    nextAttemptAt: null,
  });
  await appendAuditEventInTx(exec, {
    category: 'commercial',
    action: AuditActions.billingPurchaseFailed,
    outcome: 'failure',
    actorType: 'user',
    actorId: row.created_by_user_id,
    organizationId,
    targetType: 'purchase',
    targetId: row.id,
    metadata: {
      kind: row.kind,
      failureCode: code,
      amountMinor: pi.amountMinor,
      currency: pi.currency,
    },
  });
  if (paymentId) {
    await writeOutboxEvent(client, 'billing', BillingPaymentFailedV1, {
      organizationId,
      sourceApp: BillingPaymentFailedV1.sourceApp,
      resourceId: row.id,
      payload: {
        paymentId,
        kind: 'purchase',
        purchaseId: row.id,
        invoiceId: null,
        amountMinor: pi.amountMinor,
        currency: pi.currency,
        attempt: 1,
        nextAttemptAt: null,
      },
    });
  }
}

export interface PaymentRowInput {
  organizationId: string;
  purchaseId: string | null;
  kind: 'purchase' | 'subscription';
  idempotencyKey: string;
  paymentIntentId: string | null;
  invoiceId: string | null;
  attempt: number;
  status: 'succeeded' | 'failed';
  amountMinor: number;
  currency: StripeCurrency;
  failureCode: string | null;
  nextAttemptAt: Date | null;
}

/** One row per attempt; null when it was already written (another source reported it). */
export async function insertPayment(
  client: PoolClient,
  p: PaymentRowInput,
): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO billing.payment
       (organization_id, purchase_id, kind, idempotency_key, stripe_payment_intent_id,
        stripe_invoice_id, attempt, status, amount_minor, currency, failure_code, next_attempt_at,
        occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [
      p.organizationId,
      p.purchaseId,
      p.kind,
      p.idempotencyKey,
      p.paymentIntentId,
      p.invoiceId,
      p.attempt,
      p.status,
      p.amountMinor,
      p.currency,
      p.failureCode,
      p.nextAttemptAt,
    ],
  );
  return rows[0]?.id ?? null;
}

/**
 * A paid purchase becomes active in the commercial model (once), then `succeeded` with its audit
 * row. Safe to call again: the commercial side is unique on the purchase, and only one caller
 * moves it from `paid`.
 */
export async function activateIfPaid(
  organizationId: string,
  purchaseId: string,
): Promise<{ activated: boolean; recurring: boolean }> {
  const row = await withBillingRead(organizationId, (client) => readPurchase(client, purchaseId));
  if (!row || row.status !== 'paid') return { activated: false, recurring: false };
  if (row.kind === 'setup') {
    // the request goes `paid` (once; a request no longer `confirmed` stays as it is)
    await markSetupPaid({
      organizationId,
      setupRequestId: row.setup_request_id!,
      paymentRef: purchaseId,
      amountMinor: Number(row.setup_minor),
    });
  }
  const ref =
    row.kind === 'setup'
      ? row.setup_request_id!
      : row.kind === 'addon'
        ? (
            await activatePurchasedAddon({
              organizationId,
              purchaseId,
              addonId: row.addon_id!,
              packs: row.packs,
            })
          ).grantId
        : (
            await activatePurchasedApplication({
              organizationId,
              purchaseId,
              applicationId: row.application_id!,
              currency: row.currency,
              interval: await intervalOf(organizationId),
              amountMinor: Number(row.price_minor),
            })
          ).lineId;
  return withBillingWrite(organizationId, async (client, exec) => {
    const { rowCount } = await client.query(
      `UPDATE billing.purchase SET status = 'succeeded', activated_at = now(), commercial_ref = $2,
              updated_at = now()
        WHERE id = $1 AND status = 'paid'`,
      [purchaseId, ref],
    );
    if (!rowCount) return { activated: false, recurring: row.recurring };
    await appendAuditEventInTx(exec, {
      category: 'commercial',
      action: AuditActions.billingPurchaseSucceeded,
      outcome: 'success',
      actorType: 'user',
      actorId: row.created_by_user_id,
      organizationId,
      targetType: 'purchase',
      targetId: purchaseId,
      metadata: {
        kind: row.kind,
        addonId: row.addon_id,
        applicationId: row.application_id,
        packs: row.packs,
        priceMinor: Number(row.price_minor),
        setupMinor: Number(row.setup_minor),
        currency: row.currency,
        commercialRef: ref,
      },
    });
    return { activated: true, recurring: row.recurring };
  });
}

async function intervalOf(organizationId: string) {
  const terms = await getBillingTerms(organizationId);
  if (!terms) throw new InvalidInput('organizationId', 'The business has no subscription');
  return terms.subscription.interval;
}
