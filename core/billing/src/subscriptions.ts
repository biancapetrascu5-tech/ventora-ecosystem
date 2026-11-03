import type { PoolClient } from 'pg';
import { AuditActions, appendAuditEventInTx, type AuditSqlExecutor } from '@ventora/audit';
import {
  billingPeriod,
  calendarDate,
  getBillingTerms,
  startOfDay,
  type BillingDiscount,
  type BillingTerms,
} from '@ventora/commercial';
import { BillingPaymentFailedV1, BillingPaymentSucceededV1 } from '@ventora/contracts';
import { writeOutboxEvent } from '@ventora/db-kit';
import { createHash } from 'node:crypto';
import { readAccountInTx } from './account';
import { withBillingModule, withBillingRead, withBillingWrite } from './db';
import { activateIfPaid, insertPayment } from './purchases';
import {
  currencyOf,
  getStripeGateway,
  type SubscriptionItemSpec,
  type SubscriptionState,
} from './stripe';

/*
 * Lot 3.5 — the subscription in Stripe Billing (D3-4 a): Stripe charges it, retries a refused
 * card and asks for 3-D Secure; Ventora mirrors the state from the webhooks. The commercial model
 * stays the truth: the Stripe subscription is built from it (reconcileSubscription), never edited
 * by hand —
 *
 *   - the bundle in effect, the applications added (D3-9) and the monthly packs bought (D3-7),
 *     each a line tied to its commercial row (`ventora_ref` on the item);
 *   - prices created from code, per currency and interval (lookup_key: the same price is found
 *     again, a new amount is a new price);
 *   - the discounts as coupons (D3-21): on the subscription or on one line; „o singură dată” =
 *     `once`, N months = `repeating`, permanent = `forever`; ended in Ventora → removed in Stripe;
 *   - billed on the subscription's own day (D3-3, `billing_cycle_anchor`), the first time for
 *     the days up to it;
 *   - a line ended in Ventora leaves Stripe without a refund (D3-10); a line bought from the Hub
 *     was paid for its first days at the purchase, the others start prorated.
 *
 * It runs when a card is saved (the webhook), after a purchase, and in the platform job
 * (`billing.stripe-reconcile`), which also catches what Founder changed.
 */

type Terms = BillingTerms;

const ref = {
  bundle: 'bundle',
  application: (lineId: string) => `application:${lineId}`,
  pack: (grantId: string) => `pack:${grantId}`,
};

const VENTORA_REF = /^(bundle|application:[0-9a-f-]{36}|pack:[0-9a-f-]{36})$/;

function couponSpec(d: BillingDiscount) {
  return {
    id: `vnt_disc_${d.id}`,
    name:
      d.kind === 'percent'
        ? `Reducere ${d.percentOff}%`
        : `Reducere ${(d.amountOffMinor! / 100).toFixed(2)} ${d.currency}`,
    percentOff: d.kind === 'percent' ? d.percentOff : null,
    amountOffMinor: d.kind === 'amount' ? d.amountOffMinor : null,
    currency: d.currency,
    duration: d.duration,
    durationMonths: d.durationMonths,
  };
}

interface Desired {
  items: Array<SubscriptionItemSpec & { prepaid: boolean }>;
  couponIds: string[];
}

/** What the Stripe subscription should have now, from the commercial terms. */
async function desiredOf(client: PoolClient, terms: Terms): Promise<Desired> {
  const gateway = getStripeGateway();
  const sub = terms.subscription;
  const currency = sub.currency;
  const coupons = new Map<string, string[]>();
  const subCoupons: string[] = [];
  for (const d of terms.discounts) {
    const id = await gateway.ensureCoupon(couponSpec(d));
    if (d.scope === 'subscription') subCoupons.push(id);
    else {
      const key = d.scope === 'application' ? ref.application(d.lineId!) : ref.pack(d.lineId!);
      coupons.set(key, [...(coupons.get(key) ?? []), id]);
    }
  }
  const items: Desired['items'] = [];
  if (terms.bundle) {
    const priceId = await gateway.ensurePrice({
      lookupKey: `vnt_bundle_${terms.bundle.versionId}_${currency}_${sub.interval}_${terms.bundle.priceMinor}`,
      productKey: `bundle_${terms.bundle.versionId}`,
      productName: terms.bundle.planName || 'Bundle',
      currency,
      unitAmountMinor: terms.bundle.priceMinor,
      interval: sub.interval,
    });
    items.push({
      ref: ref.bundle,
      priceId,
      quantity: 1,
      couponIds: coupons.get(ref.bundle) ?? [],
      prepaid: false,
    });
  }
  for (const a of terms.applications) {
    if (a.interval !== sub.interval) continue; // one interval per Stripe subscription
    const priceId = await gateway.ensurePrice({
      lookupKey: `vnt_app_${a.applicationId}_${currency}_${a.interval}_${a.amountMinor}`,
      productKey: `app_${a.applicationId}`,
      productName: a.applicationId,
      currency,
      unitAmountMinor: a.amountMinor,
      interval: a.interval,
    });
    const r = ref.application(a.lineId);
    items.push({
      ref: r,
      priceId,
      quantity: 1,
      couponIds: coupons.get(r) ?? [],
      prepaid: a.purchased,
    });
  }
  if (sub.interval === 'month' && terms.packs.length) {
    const { rows } = await client.query<{
      id: string;
      item_name: string;
      price_minor: string;
      packs: number;
    }>(
      `SELECT id, item_name, price_minor, packs FROM billing.purchase WHERE id = ANY($1::uuid[])`,
      [terms.packs.map((p) => p.purchaseId)],
    );
    const bought = new Map(rows.map((r) => [r.id, r]));
    for (const p of terms.packs) {
      const purchase = bought.get(p.purchaseId);
      if (!purchase) continue;
      const unit = Math.round(Number(purchase.price_minor) / purchase.packs);
      const priceId = await gateway.ensurePrice({
        lookupKey: `vnt_pack_${p.addonId}_${currency}_month_${unit}`,
        productKey: `pack_${p.addonId}`,
        productName: purchase.item_name,
        currency,
        unitAmountMinor: unit,
        interval: 'month',
      });
      const r = ref.pack(p.grantId);
      items.push({
        ref: r,
        priceId,
        quantity: p.packs,
        couponIds: coupons.get(r) ?? [],
        prepaid: true,
      });
    }
  }
  return { items, couponIds: subCoupons.sort() };
}

/** D3-3: billed on the subscription's day; the first invoice covers the days up to it. */
export function anchorFor(
  sub: Terms['subscription'],
  now = new Date(),
): { billingCycleAnchor: Date | null; trialEnd: Date | null } {
  const today = calendarDate(now);
  if (sub.startedOn > today) {
    // not started yet: nothing is charged before its first day
    return { billingCycleAnchor: null, trialEnd: startOfDay(sub.startedOn) };
  }
  if (sub.status === 'trialing' && sub.trialEndsAt && new Date(sub.trialEndsAt) > now) {
    return { billingCycleAnchor: null, trialEnd: new Date(sub.trialEndsAt) };
  }
  const period = billingPeriod(sub, today);
  return {
    billingCycleAnchor: period.start === today ? null : startOfDay(period.end),
    trialEnd: null,
  };
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export type ReconcileOutcome = 'created' | 'updated' | 'unchanged' | 'cancel_scheduled' | 'skipped';

/**
 * The organization's Stripe subscription made to match the commercial model. Activates first
 * the purchases that are paid but not active yet. Idempotent: run again, it changes nothing.
 */
export async function reconcileSubscription(organizationId: string): Promise<ReconcileOutcome> {
  const paid = await withBillingRead(organizationId, (client) =>
    client.query<{ id: string }>(`SELECT id FROM billing.purchase WHERE status = 'paid'`),
  );
  for (const p of paid.rows) await activateIfPaid(organizationId, p.id);

  const terms = await getBillingTerms(organizationId);
  return withBillingWrite(organizationId, async (client, exec) => {
    const account = await readAccountInTx(client);
    const bs = await client.query<{
      subscription_id: string;
      stripe_subscription_id: string | null;
      cancel_at_period_end: boolean;
    }>(
      `SELECT subscription_id, stripe_subscription_id, cancel_at_period_end
         FROM billing.billing_subscription FOR UPDATE`,
    );
    const linked = bs.rows[0];
    if (account.manualPayment || !account.customerId || !account.card) return 'skipped';
    const gateway = getStripeGateway();

    if (!terms) {
      // the subscription was canceled in Ventora: Stripe stops at the end of the paid period (D3-10)
      if (linked?.stripe_subscription_id && !linked.cancel_at_period_end) {
        const sub = await gateway.updateSubscription(linked.stripe_subscription_id, {
          add: [],
          remove: [],
          change: [],
          prorateAdded: false,
          cancelAtPeriodEnd: true,
        });
        await mirrorInTx(client, sub, null);
        return 'cancel_scheduled';
      }
      return 'unchanged';
    }

    const desired = await desiredOf(client, terms);
    if (!linked?.stripe_subscription_id || linked.subscription_id !== terms.subscription.id) {
      if (!desired.items.length) return 'unchanged';
      const { billingCycleAnchor, trialEnd } = anchorFor(terms.subscription);
      const spec = {
        items: desired.items.map(({ prepaid: _p, ...i }) => i),
        couponIds: desired.couponIds,
        billingCycleAnchor,
        trialEnd,
      };
      const digest = createHash('sha256').update(JSON.stringify(spec)).digest('hex').slice(0, 16);
      const sub = await gateway.createSubscription({
        customerId: account.customerId,
        paymentMethodId: account.card.paymentMethodId,
        ...spec,
        metadata: {
          organization_id: organizationId,
          subscription_id: terms.subscription.id,
        },
        idempotencyKey: `subscription-${terms.subscription.id}-${digest}`,
      });
      await client.query(
        `INSERT INTO billing.billing_subscription
           (organization_id, subscription_id, stripe_subscription_id, status, current_period_end,
            cancel_at_period_end)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (organization_id) DO UPDATE
           SET subscription_id = EXCLUDED.subscription_id,
               stripe_subscription_id = EXCLUDED.stripe_subscription_id,
               status = EXCLUDED.status, current_period_end = EXCLUDED.current_period_end,
               cancel_at_period_end = EXCLUDED.cancel_at_period_end, last_event_at = NULL,
               updated_at = now()`,
        [
          organizationId,
          terms.subscription.id,
          sub.id,
          sub.status,
          sub.currentPeriodEnd,
          sub.cancelAtPeriodEnd,
        ],
      );
      await audit(exec, organizationId, sub, terms);
      return 'created';
    }

    const sub = await gateway.retrieveSubscription(linked.stripe_subscription_id);
    if (['canceled', 'incomplete_expired'].includes(sub.status)) return 'skipped';
    const current = new Map(
      sub.items.filter((i) => i.ref && VENTORA_REF.test(i.ref)).map((i) => [i.ref!, i]),
    );
    const wanted = new Map(desired.items.map((i) => [i.ref, i]));
    const add = desired.items.filter((i) => !current.has(i.ref));
    const remove = [...current.values()].filter((i) => !wanted.has(i.ref!)).map((i) => i.id);
    const change = [...current.values()]
      .filter((i) => wanted.has(i.ref!))
      .map((i) => ({ item: i, want: wanted.get(i.ref!)! }))
      .filter(
        ({ item, want }) =>
          item.priceId !== want.priceId ||
          item.quantity !== want.quantity ||
          !same(item.couponIds, [...want.couponIds].sort()),
      )
      .map(({ item, want }) => ({
        itemId: item.id,
        priceId: want.priceId,
        quantity: want.quantity,
        couponIds: want.couponIds,
      }));
    const coupons = same(sub.couponIds, desired.couponIds) ? undefined : desired.couponIds;
    if (!add.length && !remove.length && !change.length && !coupons && !sub.cancelAtPeriodEnd) {
      return 'unchanged';
    }
    // lines paid at the purchase start without proration; the others are prorated (D3-7)
    const strip = ({ prepaid: _p, ...i }: Desired['items'][number]) => i;
    const prepaid = add.filter((i) => i.prepaid).map(strip);
    const prorate = add.filter((i) => !i.prepaid).map(strip);
    let updated: SubscriptionState = sub;
    updated = await gateway.updateSubscription(sub.id, {
      add: prepaid,
      remove,
      change,
      couponIds: coupons,
      prorateAdded: false,
      ...(sub.cancelAtPeriodEnd ? { cancelAtPeriodEnd: false } : {}),
    });
    if (prorate.length) {
      updated = await gateway.updateSubscription(sub.id, {
        add: prorate,
        remove: [],
        change: [],
        prorateAdded: true,
      });
    }
    await mirrorInTx(client, updated, null);
    return 'updated';
  });
}

async function audit(
  exec: AuditSqlExecutor,
  organizationId: string,
  sub: SubscriptionState,
  terms: Terms,
): Promise<void> {
  await appendAuditEventInTx(exec, {
    category: 'commercial',
    action: AuditActions.billingSubscriptionCreated,
    outcome: 'success',
    actorType: 'system',
    organizationId,
    targetType: 'billing_subscription',
    targetId: organizationId,
    metadata: {
      subscriptionId: terms.subscription.id,
      stripeSubscriptionId: sub.id,
      status: sub.status,
      interval: terms.subscription.interval,
      currency: terms.subscription.currency,
      lines: sub.items.length,
    },
  });
}

/**
 * The Stripe subscription's state in Ventora. `eventAt` (the Stripe event's time): an older event
 * than the last one applied changes nothing — events in the wrong order do not take it back.
 */
export async function mirrorInTx(
  client: PoolClient,
  sub: Pick<SubscriptionState, 'id' | 'status' | 'currentPeriodEnd' | 'cancelAtPeriodEnd'>,
  eventAt: Date | null,
): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE billing.billing_subscription
        SET status = $2, current_period_end = COALESCE($3, current_period_end),
            cancel_at_period_end = $4, last_event_at = COALESCE($5, last_event_at), updated_at = now()
      WHERE stripe_subscription_id = $1
        AND ($5::timestamptz IS NULL OR last_event_at IS NULL OR last_event_at <= $5)`,
    [sub.id, sub.status, sub.currentPeriodEnd, sub.cancelAtPeriodEnd, eventAt],
  );
  return (rowCount ?? 0) > 0;
}

/** A Stripe subscription object from an event, as mirrorInTx needs it. */
export function subscriptionFromEvent(object: Record<string, unknown>) {
  const items =
    (object.items as { data?: Array<{ current_period_end?: number }> } | undefined)?.data ?? [];
  const ends = items
    .map((i) => i.current_period_end)
    .filter((x): x is number => typeof x === 'number');
  const legacy = object.current_period_end as number | undefined;
  return {
    id: String(object.id),
    status: String(object.status),
    currentPeriodEnd: ends.length
      ? new Date(Math.max(...ends) * 1000)
      : legacy
        ? new Date(legacy * 1000)
        : null,
    cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
  };
}

/**
 * An invoice of the subscription paid or refused (Stripe Billing): one payment row per attempt,
 * the event for the invoice (3.6) or for the owner's notification (S115, through the outbox).
 * A free invoice (the trial's) records nothing.
 */
export async function invoiceInTx(
  client: PoolClient,
  organizationId: string,
  type: 'invoice.paid' | 'invoice.payment_failed',
  invoice: Record<string, unknown>,
): Promise<void> {
  const id = String(invoice.id);
  const currency = currencyOf(String(invoice.currency));
  const paid = type === 'invoice.paid';
  const amountMinor = Number(paid ? invoice.amount_paid : invoice.amount_due);
  if (!amountMinor) return;
  const attempt = Math.max(1, Number(invoice.attempt_count) || 1);
  const next = invoice.next_payment_attempt
    ? new Date(Number(invoice.next_payment_attempt) * 1000)
    : null;
  const paymentId = await insertPayment(client, {
    organizationId,
    purchaseId: null,
    kind: 'subscription',
    idempotencyKey: paid ? `invoice:${id}:paid` : `invoice:${id}:failed:${attempt}`,
    paymentIntentId: null,
    invoiceId: id,
    attempt,
    status: paid ? 'succeeded' : 'failed',
    amountMinor,
    currency,
    failureCode: paid ? null : 'invoice_payment_failed',
    nextAttemptAt: paid ? null : next,
  });
  if (!paymentId) return;
  const base = {
    paymentId,
    kind: 'subscription' as const,
    purchaseId: null,
    invoiceId: id,
    amountMinor,
    currency,
  };
  if (paid) {
    await writeOutboxEvent(client, 'billing', BillingPaymentSucceededV1, {
      organizationId,
      sourceApp: BillingPaymentSucceededV1.sourceApp,
      resourceId: id,
      payload: base,
    });
  } else {
    await writeOutboxEvent(client, 'billing', BillingPaymentFailedV1, {
      organizationId,
      sourceApp: BillingPaymentFailedV1.sourceApp,
      resourceId: id,
      payload: { ...base, attempt, nextAttemptAt: next ? next.toISOString() : null },
    });
  }
}

/**
 * The platform job (`billing.stripe-reconcile`): each business with a card, or with a paid purchase
 * not active yet, in its own context. One that fails does not stop the others; the job reports.
 */
export async function runStripeReconcileJob(opts: { limit?: number } = {}): Promise<{
  checked: number;
  outcomes: Record<ReconcileOutcome, number>;
  failed: Array<{ organizationId: string; error: unknown }>;
}> {
  const { rows } = await withBillingModule((client) =>
    client.query<{ organization_id: string }>(
      `SELECT organization_id FROM billing.organizations_to_reconcile($1)`,
      [opts.limit ?? 500],
    ),
  );
  const outcomes: Record<ReconcileOutcome, number> = {
    created: 0,
    updated: 0,
    unchanged: 0,
    cancel_scheduled: 0,
    skipped: 0,
  };
  const failed: Array<{ organizationId: string; error: unknown }> = [];
  for (const { organization_id } of rows) {
    try {
      outcomes[await reconcileSubscription(organization_id)]++;
    } catch (error) {
      failed.push({ organizationId: organization_id, error });
    }
  }
  return { checked: rows.length, outcomes, failed };
}
