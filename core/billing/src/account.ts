import type { PoolClient } from 'pg';
import { AuditActions, appendAuditEventInTx, type AuditSqlExecutor } from '@ventora/audit';
import { Forbidden, InvalidInput } from '@ventora/errors';
import { withBillingRead, withBillingWrite } from './db';
import { getStripeGateway, type CardDetails } from './stripe';

/*
 * Lot 3.5 — the business's Stripe customer and its saved card (SetupIntent, then Stripe Elements
 * in the dialog, §8.6). Only the brand, the last 4 digits, the expiry and the Stripe id are kept.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What core/billing needs from authorize() (TenantContext has this shape). */
export interface BillingContext {
  organizationId: string;
  userId: string;
  actor: 'user' | 'system' | 'support';
}

/**
 * The person paying: a Hub user, never a support session (the Ventora team does not pay for a
 * business). Who may buy is decided by authorize() with `billing.purchase` (D3-8: the owner).
 */
export function assertBuyer(ctx: BillingContext): void {
  if (!UUID_RE.test(ctx?.organizationId ?? '')) throw new InvalidInput('organizationId');
  if (!UUID_RE.test(ctx.userId ?? '')) throw new InvalidInput('userId');
  if (ctx.actor !== 'user') throw new Forbidden();
}

const BRANDS: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  diners: 'Diners Club',
  jcb: 'JCB',
  unionpay: 'UnionPay',
  cartes_bancaires: 'Cartes Bancaires',
};

/** The card's brand as people read it („Visa”, „Mastercard”); Stripe's id otherwise. */
export function brandLabel(brand: string): string {
  return BRANDS[brand] ?? brand;
}

export interface SavedCard {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export interface BillingAccount {
  customerId: string | null;
  card: (SavedCard & { paymentMethodId: string }) | null;
  /** D3-11: a business on manual payment (transfer) asks instead of buying (Lot 3.8 sets it). */
  manualPayment: boolean;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
}

/** The account in the transaction's organization (RLS). */
export async function readAccountInTx(client: PoolClient): Promise<BillingAccount> {
  const customer = await client.query<{ stripe_customer_id: string }>(
    `SELECT stripe_customer_id FROM billing.billing_customer`,
  );
  const card = await client.query<{
    stripe_payment_method_id: string;
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
  }>(
    `SELECT stripe_payment_method_id, brand, last4, exp_month, exp_year
       FROM billing.payment_method_ref WHERE is_default AND detached_at IS NULL`,
  );
  const sub = await client.query<{
    payment_method: string;
    stripe_subscription_id: string | null;
    status: string | null;
  }>(`SELECT payment_method, stripe_subscription_id, status FROM billing.billing_subscription`);
  const c = card.rows[0];
  return {
    customerId: customer.rows[0]?.stripe_customer_id ?? null,
    card: c
      ? {
          paymentMethodId: c.stripe_payment_method_id,
          brand: c.brand,
          last4: c.last4,
          expMonth: c.exp_month,
          expYear: c.exp_year,
        }
      : null,
    manualPayment: sub.rows[0]?.payment_method === 'manual',
    stripeSubscriptionId: sub.rows[0]?.stripe_subscription_id ?? null,
    subscriptionStatus: sub.rows[0]?.status ?? null,
  };
}

/** For the Hub: the saved card (brand, last 4, expiry) and whether the business pays by transfer. */
export async function getBillingAccount(
  ctx: BillingContext,
): Promise<{ card: SavedCard | null; manualPayment: boolean }> {
  if (!UUID_RE.test(ctx?.organizationId ?? '')) throw new InvalidInput('organizationId');
  const account = await withBillingRead(ctx.organizationId, readAccountInTx);
  const c = account.card;
  return {
    card: c
      ? { brand: brandLabel(c.brand), last4: c.last4, expMonth: c.expMonth, expYear: c.expYear }
      : null,
    manualPayment: account.manualPayment,
  };
}

/** The business's Stripe customer, created once (idempotent on the organization). */
async function ensureCustomerInTx(client: PoolClient, organizationId: string): Promise<string> {
  const existing = await client.query<{ stripe_customer_id: string }>(
    `SELECT stripe_customer_id FROM billing.billing_customer FOR UPDATE`,
  );
  if (existing.rows[0]) return existing.rows[0].stripe_customer_id;
  const customer = await getStripeGateway().createCustomer({
    organizationId,
    name: null,
    idempotencyKey: `customer-${organizationId}`,
  });
  await client.query(
    `INSERT INTO billing.billing_customer (organization_id, stripe_customer_id) VALUES ($1, $2)
     ON CONFLICT (organization_id) DO NOTHING`,
    [organizationId, customer.id],
  );
  return customer.id;
}

/**
 * „Salvează cardul” (StripeSlot): a SetupIntent for later payments; the card is typed into
 * Stripe Elements with the client secret and never reaches Ventora. The card is recorded when
 * Stripe confirms it (the webhook, or `confirmCardSetup` from the dialog).
 */
export async function startCardSetup(
  ctx: BillingContext,
): Promise<{ setupIntentId: string; clientSecret: string }> {
  assertBuyer(ctx);
  return withBillingWrite(ctx.organizationId, async (client) => {
    const customerId = await ensureCustomerInTx(client, ctx.organizationId);
    const si = await getStripeGateway().createSetupIntent({
      customerId,
      organizationId: ctx.organizationId,
    });
    if (!si.clientSecret) throw new Error('[billing] the SetupIntent has no client secret');
    return { setupIntentId: si.id, clientSecret: si.clientSecret };
  });
}

/**
 * The card a SetupIntent saved becomes the business's default card (for the purchases and the
 * subscription), once: the same card again changes nothing. Only the SetupIntents of this
 * business's customer count.
 */
export async function recordCardInTx(
  client: PoolClient,
  exec: AuditSqlExecutor,
  input: { organizationId: string; setupIntentId: string; actorUserId: string | null },
): Promise<{ recorded: boolean; card: SavedCard | null }> {
  const gateway = getStripeGateway();
  const si = await gateway.retrieveSetupIntent(input.setupIntentId);
  const account = await readAccountInTx(client);
  if (si.status !== 'succeeded' || !si.paymentMethodId) return { recorded: false, card: null };
  if (!account.customerId || si.customerId !== account.customerId) {
    throw new Forbidden();
  }
  const details: CardDetails = await gateway.retrieveCard(si.paymentMethodId);
  const card = {
    brand: details.brand,
    last4: details.last4,
    expMonth: details.expMonth,
    expYear: details.expYear,
  };
  if (account.card?.paymentMethodId === details.paymentMethodId) {
    return { recorded: false, card };
  }
  await gateway.setDefaultPaymentMethod(account.customerId, details.paymentMethodId);
  await client.query(
    `UPDATE billing.payment_method_ref SET is_default = false WHERE is_default AND detached_at IS NULL`,
  );
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO billing.payment_method_ref
       (organization_id, stripe_payment_method_id, brand, last4, exp_month, exp_year, is_default)
     VALUES ($1, $2, $3, $4, $5, $6, true)
     ON CONFLICT (stripe_payment_method_id) DO UPDATE SET is_default = true, detached_at = NULL
     RETURNING id`,
    [
      input.organizationId,
      details.paymentMethodId,
      card.brand,
      card.last4,
      card.expMonth,
      card.expYear,
    ],
  );
  await appendAuditEventInTx(exec, {
    category: 'commercial',
    action: AuditActions.billingCardSaved,
    outcome: 'success',
    actorType: input.actorUserId ? 'user' : 'system',
    actorId: input.actorUserId,
    organizationId: input.organizationId,
    targetType: 'payment_method',
    targetId: rows[0]!.id,
    metadata: { brand: card.brand, last4: card.last4 },
  });
  return { recorded: true, card };
}
