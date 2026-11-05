import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { closeAuditPools } from '@ventora/audit';
import {
  billingPeriod,
  calendarDate,
  closeCommercialPools,
  getEffectiveEntitlements,
} from '@ventora/commercial';
import { Conflict, Forbidden, InvalidInput } from '@ventora/errors';
import { ConsumerRegistry, dispatchOutbox } from '@ventora/integrations';
import {
  billingPaymentFailedConsumer,
  closeBillingPools,
  confirmCardSetup,
  confirmPurchase,
  getBillingAccount,
  handleStripeWebhook,
  previewPurchase,
  purchase,
  reconcileSubscription,
  runStripeReconcileJob,
  setStripeGatewayForTests,
  signStripePayload,
  startCardSetup,
  WebhookSignatureError,
} from '../index';
import { eventFor, FakeStripe } from './fake-stripe';

// Lot 3.5 — core/billing on the runtime roles (app_runtime → billing_rw / commercial_rw), with a
// fake Stripe (CI has no keys; stripe-live.integration.test.ts runs the real one locally). „Gata
// când” (FAZA-3 §3.5): the webhook's signature, idempotence and order; a payment that went
// through raises the limit once, from the dialog and the webhook; a refused card activates
// nothing; 3-D Secure confirmed in the dialog; no card data in Ventora. Plus the purchases of
// D3-24 (setup on „Direct”), the Stripe subscription (D3-4) and its coupons (D3-21), the owner's
// notifications (Lot 4.5 consumers), the isolation between businesses (T1/T2).

// a webhook secret made up for the tests (they sign their own events); no Stripe account
const SECRET = 'whsec_test_lot35_billing'; // gitleaks:allow
const adminPool = new Pool({ connectionString: process.env.DIRECT_URL, max: 2 });
const appPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
let admin: PoolClient;
const q = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;
const newUuid = () => crypto.randomUUID();
const founderId = newUuid();
const fake = new FakeStripe();

async function send(type: string, object: Record<string, unknown>, created?: number) {
  const body = eventFor(type, object, created);
  return handleStripeWebhook(body, signStripePayload(body, SECRET));
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

let versionId: string;

async function bundle(): Promise<string> {
  const [p] = await q(
    `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'Salon', $2) RETURNING id`,
    [`l35-${newUuid().slice(0, 8)}`, founderId],
  );
  const [v] = await q(
    `INSERT INTO commercial.plan_version (plan_id, version_number, created_by_founder_id)
     VALUES ($1, 1, $2) RETURNING id`,
    [p!.id, founderId],
  );
  await q(
    `INSERT INTO commercial.plan_version_price (plan_version_id, currency, kind, amount_minor)
     VALUES ($1, 'RON', 'month', 34900), ($1, 'RON', 'year', 349000)`,
    [v!.id],
  );
  await q(`INSERT INTO commercial.plan_version_application VALUES ($1, 'booking')`, [v!.id]);
  await q(
    `INSERT INTO commercial.plan_version_quota (plan_version_id, quota_key, limit_value)
     VALUES ($1, 'platform.members', 10), ($1, 'messaging.sms', 1000)`,
    [v!.id],
  );
  await q(
    `UPDATE commercial.plan_version SET published_at = now(), published_by_founder_id = $2 WHERE id = $1`,
    [v!.id, founderId],
  );
  return v!.id;
}

/** A business with its owner, in RON, on the bundle since `startedDaysAgo`. */
async function business(
  opts: { startedDaysAgo?: number; interval?: 'month' | 'year'; name?: string } = {},
) {
  const organizationId = newUuid();
  const ownerId = newUuid();
  const name = opts.name ?? `Salon ${organizationId.slice(0, 4)}`;
  await q(
    `INSERT INTO organizations.organization (id, slug, name, created_via, updated_at)
     VALUES ($1, $2, $3, 'founder', now())`,
    [organizationId, `l35-${organizationId.slice(0, 12)}`, name],
  );
  await q(
    `INSERT INTO organizations.membership (organization_id, user_id, role, status, updated_at)
     VALUES ($1, $2, 'owner', 'active', now())`,
    [organizationId, ownerId],
  );
  await q(
    `INSERT INTO commercial.billing_account (organization_id, currency, set_by_founder_id)
     VALUES ($1, 'RON', $2)`,
    [organizationId, founderId],
  );
  const started = daysAgo(opts.startedDaysAgo ?? 10);
  await q(
    `INSERT INTO commercial.subscription
       (organization_id, plan_version_id, interval, currency, started_on, anchor_day, status,
        created_by_founder_id)
     VALUES ($1, $2, $3, 'RON', $4::date, EXTRACT(DAY FROM $4::date), 'active', $5)`,
    [organizationId, versionId, opts.interval ?? 'month', started, founderId],
  );
  return {
    organizationId,
    ownerId,
    name,
    ctx: { organizationId, userId: ownerId, actor: 'user' as const },
  };
}

type Biz = Awaited<ReturnType<typeof business>>;

async function addon(opts: {
  validity: 'current_month' | 'monthly';
  mode?: 'direct' | 'on_request';
  price?: number;
  setup?: number;
  name?: string;
}) {
  const [a] = await q(
    `INSERT INTO commercial.addon (code, name, quota_key, quantity, validity, purchase_mode, created_by_founder_id)
     VALUES ($1, $2, 'messaging.sms', 500, $3, $4, $5) RETURNING id`,
    [
      `l35-${newUuid().slice(0, 8)}`,
      opts.name ?? '500 SMS',
      opts.validity,
      opts.mode ?? 'direct',
      founderId,
    ],
  );
  await q(
    `INSERT INTO commercial.addon_price (addon_id, currency, amount_minor, setup_minor)
     VALUES ($1, 'RON', $2, $3)`,
    [a!.id, opts.price ?? 4900, opts.setup ?? 0],
  );
  return a!.id as string;
}

/** The card typed into Stripe Elements, confirmed; Stripe tells the webhook. */
async function saveCard(b: Biz, pm: Parameters<FakeStripe['confirmSetup']>[1] = 'pm_card_visa') {
  const { setupIntentId } = await startCardSetup(b.ctx);
  const si = fake.confirmSetup(setupIntentId, pm);
  return send('setup_intent.succeeded', {
    id: si.id,
    object: 'setup_intent',
    status: 'succeeded',
    customer: si.customerId,
    payment_method: pm,
    metadata: si.metadata,
  });
}

const sms = async (org: string) => (await getEffectiveEntitlements(org)).quotas['messaging.sms'];
const count = async (sql: string, params: unknown[]) => Number((await q(sql, params))[0]!.n);

async function dispatchNotifications() {
  return dispatchOutbox({
    pool: appPool,
    source: { schema: 'billing', moduleRole: 'billing_rw' },
    registry: new ConsumerRegistry().register(billingPaymentFailedConsumer),
  });
}

beforeAll(async () => {
  admin = await adminPool.connect();
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  setStripeGatewayForTests(fake);
  versionId = await bundle();
  await q(`UPDATE commercial.application SET activation_mode = 'direct' WHERE id = 'crm'`);
  await q(
    `INSERT INTO commercial.application_price (application_id, currency, kind, amount_minor)
     VALUES ('crm', 'RON', 'month', 6900), ('crm', 'RON', 'setup', 30000)
     ON CONFLICT (application_id, currency, kind) DO UPDATE SET amount_minor = EXCLUDED.amount_minor`,
  );
});

afterAll(async () => {
  setStripeGatewayForTests(null);
  admin.release();
  await adminPool.end();
  await appPool.end();
  await closeBillingPools();
  await closeCommercialPools();
  await closeAuditPools();
});

// ── The card ───────────────────────────────────────────────────────────────────────────────

describe('Lot 3.5 — the saved card and the Stripe subscription (D3-4)', () => {
  it('a card saved: only brand, last 4 and expiry in Ventora; the subscription in Stripe Billing on the anchor day', async () => {
    const b = await business({ startedDaysAgo: 10 });
    const outcome = await saveCard(b);
    expect(outcome).toMatchObject({ status: 'processed', organizationId: b.organizationId });
    expect(await getBillingAccount(b.ctx)).toEqual({
      card: { brand: 'Visa', last4: '4242', expMonth: 12, expYear: 2034 },
      manualPayment: false,
    });
    const [audit] = await q(
      `SELECT actor_type, metadata FROM audit.audit_log WHERE action = 'billing.card_saved' AND organization_id = $1`,
      [b.organizationId],
    );
    expect(audit).toMatchObject({
      actor_type: 'system',
      metadata: { brand: 'visa', last4: '4242' },
    });

    // the subscription: the bundle's line at its price, billed from the anchor day (D3-3)
    const [bs] = await q(
      `SELECT stripe_subscription_id, status, payment_method FROM billing.billing_subscription WHERE organization_id = $1`,
      [b.organizationId],
    );
    expect(bs).toMatchObject({ status: 'active', payment_method: 'card' });
    const sub = fake.subscriptions.get(bs!.stripe_subscription_id)!;
    expect(sub.items.map((i) => i.ref)).toEqual(['bundle']);
    expect(fake.prices.get(sub.items[0]!.priceId)).toMatchObject({
      unitAmountMinor: 34900,
      currency: 'RON',
      interval: 'month',
    });
    const started = daysAgo(10);
    const period = billingPeriod(
      { startedOn: started, interval: 'month' },
      calendarDate(new Date()),
    );
    expect(sub.anchor).not.toBeNull();
    expect(calendarDate(sub.anchor!)).toBe(period.end);
    // run again: nothing changes
    expect(await reconcileSubscription(b.organizationId)).toBe('unchanged');
  });

  it('the same SetupIntent from the dialog and the webhook: one card, one audit row', async () => {
    const b = await business();
    const { setupIntentId } = await startCardSetup(b.ctx);
    fake.confirmSetup(setupIntentId, 'pm_card_visa');
    expect((await confirmCardSetup(b.ctx, setupIntentId)).card).toMatchObject({ last4: '4242' });
    const si = await fake.retrieveSetupIntent(setupIntentId);
    await send('setup_intent.succeeded', {
      id: si.id,
      object: 'setup_intent',
      status: 'succeeded',
      customer: si.customerId,
      payment_method: 'pm_card_visa',
    });
    expect(
      await count(
        `SELECT count(*) AS n FROM billing.payment_method_ref WHERE organization_id = $1`,
        [b.organizationId],
      ),
    ).toBe(1);
    expect(
      await count(
        `SELECT count(*) AS n FROM audit.audit_log WHERE action = 'billing.card_saved' AND organization_id = $1`,
        [b.organizationId],
      ),
    ).toBe(1);
  });
});

// ── The webhook ────────────────────────────────────────────────────────────────────────────

describe('Lot 3.5 — the webhook (FAZA-3 §3.5 „Gata când”)', () => {
  it('a wrong signature → refused, no effect', async () => {
    const before = await count(`SELECT count(*) AS n FROM billing.stripe_event`, []);
    const body = eventFor('payment_intent.succeeded', { id: 'pi_x', customer: 'cus_x' });
    await expect(handleStripeWebhook(body, 't=1,v1=deadbeef')).rejects.toBeInstanceOf(
      WebhookSignatureError,
    );
    await expect(
      handleStripeWebhook(body, signStripePayload(body, 'whsec_another_secret')),
    ).rejects.toBeInstanceOf(WebhookSignatureError);
    await expect(handleStripeWebhook(body, null)).rejects.toBeInstanceOf(WebhookSignatureError);
    expect(await count(`SELECT count(*) AS n FROM billing.stripe_event`, [])).toBe(before);
  });

  it('a customer that is no Ventora business: recorded once, nothing else', async () => {
    const body = eventFor('invoice.paid', {
      id: 'in_x',
      customer: 'cus_nobody',
      amount_paid: 100,
      currency: 'ron',
    });
    const sig = signStripePayload(body, SECRET);
    expect((await handleStripeWebhook(body, sig)).status).toBe('ignored');
    expect((await handleStripeWebhook(body, sig)).status).toBe('ignored');
    const id = JSON.parse(body).id;
    expect(
      await count(`SELECT count(*) AS n FROM billing.stripe_event WHERE event_id = $1`, [id]),
    ).toBe(1);
  });
});

// ── Purchases ──────────────────────────────────────────────────────────────────────────────

describe('Lot 3.5 — a pack bought with the saved card', () => {
  it('paid → the limit grows once, though the success comes from the dialog and then the webhook, twice', async () => {
    const b = await business();
    await saveCard(b);
    const addonId = await addon({ validity: 'current_month', price: 4900 });
    const before = await sms(b.organizationId);
    const preview = await previewPurchase(b.ctx, { kind: 'addon', addonId, packs: 2 });
    expect(preview).toMatchObject({
      amountDueMinor: 9800,
      recurringMinor: null,
      card: { brand: 'Visa', last4: '4242' },
    });

    const res = await purchase(b.ctx, { kind: 'addon', addonId, packs: 2 });
    expect(res).toMatchObject({ status: 'succeeded', amountMinor: 9800, currency: 'RON' });
    expect(await sms(b.organizationId)).toBe((before ?? 0) + 1000);

    const [row] = await q(`SELECT stripe_payment_intent_id FROM billing.purchase WHERE id = $1`, [
      res.purchaseId,
    ]);
    const pi = row!.stripe_payment_intent_id as string;
    const body = eventFor('payment_intent.succeeded', fake.piObject(pi));
    const sig = signStripePayload(body, SECRET);
    expect((await handleStripeWebhook(body, sig)).status).toBe('processed');
    expect((await handleStripeWebhook(body, sig)).status).toBe('duplicate');

    expect(await sms(b.organizationId)).toBe((before ?? 0) + 1000);
    expect(
      await count(`SELECT count(*) AS n FROM commercial.addon_grant WHERE purchase_id = $1`, [
        res.purchaseId,
      ]),
    ).toBe(1);
    expect(
      await count(`SELECT count(*) AS n FROM billing.payment WHERE purchase_id = $1`, [
        res.purchaseId,
      ]),
    ).toBe(1);
    const [grant] = await q(
      `SELECT source, recurring, created_by_founder_id FROM commercial.addon_grant WHERE purchase_id = $1`,
      [res.purchaseId],
    );
    expect(grant).toEqual({ source: 'purchase', recurring: false, created_by_founder_id: null });
    // the event for the invoice (3.6), once
    expect(
      await count(
        `SELECT count(*) AS n FROM billing.outbox_events WHERE type = 'billing.payment.succeeded' AND resource_id = $1`,
        [res.purchaseId],
      ),
    ).toBe(1);
    const [audit] = await q(
      `SELECT actor_type, actor_id, outcome, metadata FROM audit.audit_log WHERE action = 'billing.purchase_succeeded' AND target_id = $1`,
      [res.purchaseId],
    );
    expect(audit).toMatchObject({ actor_type: 'user', actor_id: b.ownerId, outcome: 'success' });
    expect(audit!.metadata).toMatchObject({
      kind: 'addon',
      packs: 2,
      priceMinor: 9800,
      currency: 'RON',
    });
  });

  it('refused by the bank → nothing activated; the owner is told (payment.pack, S115)', async () => {
    const b = await business({ name: 'Salon Refuz' });
    await saveCard(b, 'pm_card_chargeCustomerFail');
    const addonId = await addon({ validity: 'current_month', name: '500 SMS în plus' });
    const before = await sms(b.organizationId);
    const res = await purchase(b.ctx, { kind: 'addon', addonId });
    expect(res).toMatchObject({
      status: 'failed',
      failure: { code: 'card_declined', message: 'Your card was declined.' },
    });
    expect(await sms(b.organizationId)).toBe(before);
    expect(
      await count(`SELECT count(*) AS n FROM commercial.addon_grant WHERE purchase_id = $1`, [
        res.purchaseId,
      ]),
    ).toBe(0);
    const [audit] = await q(
      `SELECT outcome, metadata FROM audit.audit_log WHERE action = 'billing.purchase_failed' AND target_id = $1`,
      [res.purchaseId],
    );
    expect(audit).toMatchObject({ outcome: 'failure', metadata: { failureCode: 'card_declined' } });

    // the webhook says the same later: nothing more
    const [row] = await q(`SELECT stripe_payment_intent_id FROM billing.purchase WHERE id = $1`, [
      res.purchaseId,
    ]);
    await send('payment_intent.payment_failed', fake.piObject(row!.stripe_payment_intent_id));
    expect(
      await count(`SELECT count(*) AS n FROM billing.payment WHERE purchase_id = $1`, [
        res.purchaseId,
      ]),
    ).toBe(1);

    const report = await dispatchNotifications();
    expect(report.dead).toBe(0);
    const notes = await q(
      `SELECT type, recipient_user_id, params FROM notifications.notification WHERE organization_id = $1`,
      [b.organizationId],
    );
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ type: 'billing.payment.pack', recipient_user_id: b.ownerId });
    expect(notes[0]!.params).toMatchObject({
      business: 'Salon Refuz',
      amount: { type: 'money', amountMinor: 4900, currency: 'RON' },
      item: { type: 'key', key: 'billing.have.pack', params: { name: '500 SMS în plus' } },
    });
  });

  it('3-D Secure: confirmed in the dialog, then active; the webhook after it changes nothing', async () => {
    const b = await business();
    await saveCard(b, 'pm_card_threeDSecure2Required');
    const addonId = await addon({ validity: 'current_month' });
    const before = await sms(b.organizationId);
    const res = await purchase(b.ctx, { kind: 'addon', addonId });
    expect(res.status).toBe('requires_action');
    expect(res.clientSecret).toMatch(/_secret_/);
    expect(await sms(b.organizationId)).toBe(before);

    const [row] = await q(`SELECT stripe_payment_intent_id FROM billing.purchase WHERE id = $1`, [
      res.purchaseId,
    ]);
    fake.settle(row!.stripe_payment_intent_id, 'succeeded'); // Stripe.js in the dialog
    expect((await confirmPurchase(b.ctx, res.purchaseId)).status).toBe('succeeded');
    expect(await sms(b.organizationId)).toBe((before ?? 0) + 500);
    await send('payment_intent.succeeded', fake.piObject(row!.stripe_payment_intent_id));
    expect(await sms(b.organizationId)).toBe((before ?? 0) + 500);
  });

  it('the events in the wrong order: the success stays (an older „requires_action” / „processing” does not take it back)', async () => {
    const b = await business();
    await saveCard(b, 'pm_card_threeDSecure2Required');
    const addonId = await addon({ validity: 'current_month' });
    const res = await purchase(b.ctx, { kind: 'addon', addonId });
    const [row] = await q(`SELECT stripe_payment_intent_id FROM billing.purchase WHERE id = $1`, [
      res.purchaseId,
    ]);
    const pi = row!.stripe_payment_intent_id as string;
    const older = fake.piObject(pi); // requires_action, as it was
    fake.settle(pi, 'succeeded');
    const t = Math.floor(Date.now() / 1000);
    await send('payment_intent.succeeded', fake.piObject(pi), t);
    await send('payment_intent.requires_action', older, t - 5);
    await send('payment_intent.processing', { ...older, status: 'processing' }, t - 3);
    const [after] = await q(`SELECT status FROM billing.purchase WHERE id = $1`, [res.purchaseId]);
    expect(after!.status).toBe('succeeded');
  });

  it('processing: nothing yet; the webhook activates it, though the dialog was closed', async () => {
    const b = await business();
    await saveCard(b, 'pm_card_processing');
    const addonId = await addon({ validity: 'current_month' });
    const before = await sms(b.organizationId);
    const res = await purchase(b.ctx, { kind: 'addon', addonId });
    expect(res.status).toBe('processing');
    const [row] = await q(`SELECT stripe_payment_intent_id FROM billing.purchase WHERE id = $1`, [
      res.purchaseId,
    ]);
    fake.settle(row!.stripe_payment_intent_id, 'succeeded');
    await send('payment_intent.succeeded', fake.piObject(row!.stripe_payment_intent_id));
    expect(await sms(b.organizationId)).toBe((before ?? 0) + 500);
  });

  it('refused before paying: on request, manual payment, no card, a support session, a pack not on sale', async () => {
    const b = await business();
    const onRequest = await addon({ validity: 'current_month', mode: 'on_request' });
    const direct = await addon({ validity: 'current_month' });
    await expect(purchase(b.ctx, { kind: 'addon', addonId: direct })).rejects.toBeInstanceOf(
      InvalidInput,
    ); // no card
    await saveCard(b);
    await expect(purchase(b.ctx, { kind: 'addon', addonId: onRequest })).rejects.toBeInstanceOf(
      Conflict,
    );
    await expect(
      purchase({ ...b.ctx, actor: 'support' }, { kind: 'addon', addonId: direct }),
    ).rejects.toBeInstanceOf(Forbidden);
    await q(`UPDATE commercial.addon SET sales_stopped_at = now() WHERE id = $1`, [direct]);
    await expect(purchase(b.ctx, { kind: 'addon', addonId: direct })).rejects.toThrow(
      /not available/,
    );
    await q(
      `UPDATE billing.billing_subscription SET payment_method = 'manual', stripe_subscription_id = NULL WHERE organization_id = $1`,
      [b.organizationId],
    );
    const other = await addon({ validity: 'current_month' });
    await expect(purchase(b.ctx, { kind: 'addon', addonId: other })).rejects.toBeInstanceOf(
      Conflict,
    );
    expect(
      await count(`SELECT count(*) AS n FROM billing.purchase WHERE organization_id = $1`, [
        b.organizationId,
      ]),
    ).toBe(0);
  });
});

describe('Lot 3.5 — D3-24: on „Direct” the setup is paid with the card at the purchase', () => {
  it('a monthly pack with setup: the days left + the setup now; then a line of the Stripe subscription, not prorated again', async () => {
    const b = await business({ startedDaysAgo: 10 });
    await saveCard(b);
    const addonId = await addon({ validity: 'monthly', price: 6000, setup: 15000 });
    const preview = await previewPurchase(b.ctx, { kind: 'addon', addonId });
    expect(preview.recurringMinor).toBe(6000);
    expect(preview.amountDueMinor).toBeGreaterThan(15000);
    expect(preview.amountDueMinor).toBeLessThan(15000 + 6000);
    fake.calls.length = 0;
    const res = await purchase(b.ctx, { kind: 'addon', addonId });
    expect(res).toMatchObject({ status: 'succeeded', amountMinor: preview.amountDueMinor });
    const [grant] = await q(
      `SELECT id, recurring, subscription_id FROM commercial.addon_grant WHERE purchase_id = $1`,
      [res.purchaseId],
    );
    expect(grant).toMatchObject({ recurring: true });
    // one payment now, then the line joins the subscription without a second proration
    expect(fake.calls).toEqual(['createPaymentIntent', 'updateSubscription:none']);
    const [bs] = await q(
      `SELECT stripe_subscription_id FROM billing.billing_subscription WHERE organization_id = $1`,
      [b.organizationId],
    );
    const sub = fake.subscriptions.get(bs!.stripe_subscription_id)!;
    const line = sub.items.find((i) => i.ref === `pack:${grant!.id}`)!;
    expect(fake.prices.get(line.priceId)).toMatchObject({
      unitAmountMinor: 6000,
      interval: 'month',
    });
    expect(await reconcileSubscription(b.organizationId)).toBe('unchanged');
  });

  it('an application à la carte on „Direct”: setup + days left now, active at once with its own line', async () => {
    const b = await business({ startedDaysAgo: 3 });
    await saveCard(b);
    const res = await purchase(b.ctx, { kind: 'application', applicationId: 'crm' });
    expect(res.status).toBe('succeeded');
    expect(res.amountMinor).toBeGreaterThan(30000);
    expect((await getEffectiveEntitlements(b.organizationId)).applications).toContain('crm');
    const [line] = await q(
      `SELECT id, source, amount_minor, created_by_founder_id FROM commercial.subscription_application WHERE purchase_id = $1`,
      [res.purchaseId],
    );
    expect(line).toMatchObject({
      source: 'purchase',
      amount_minor: '6900',
      created_by_founder_id: null,
    });
    await reconcileSubscription(b.organizationId);
    const [bs] = await q(
      `SELECT stripe_subscription_id FROM billing.billing_subscription WHERE organization_id = $1`,
      [b.organizationId],
    );
    expect(fake.subscriptions.get(bs!.stripe_subscription_id)!.items.map((i) => i.ref)).toContain(
      `application:${line!.id}`,
    );
    // already active: a second purchase is refused before any payment
    await expect(
      purchase(b.ctx, { kind: 'application', applicationId: 'crm' }),
    ).rejects.toBeInstanceOf(Conflict);
  });

  it('a monthly pack on a yearly subscription stays a request (one interval per Stripe subscription)', async () => {
    const b = await business({ interval: 'year' });
    await saveCard(b);
    const addonId = await addon({ validity: 'monthly' });
    await expect(previewPurchase(b.ctx, { kind: 'addon', addonId })).rejects.toBeInstanceOf(
      InvalidInput,
    );
  });
});

// ── The subscription's invoices, coupons, disputes ─────────────────────────────────────────

describe('Lot 3.5 — the subscription in Stripe Billing: invoices, retries, coupons, order of events', () => {
  it('a refused renewal → payment.renewal (card, retry day); again → payment.retry; the last attempt → nothing yet (3.8)', async () => {
    const b = await business({ name: 'Salon Reînnoire' });
    await saveCard(b);
    const [bs] = await q(
      `SELECT stripe_subscription_id FROM billing.billing_subscription WHERE organization_id = $1`,
      [b.organizationId],
    );
    const customer = fake.subscriptions.get(bs!.stripe_subscription_id)!.customerId;
    const retry = Math.floor(Date.parse('2026-12-04T09:00:00Z') / 1000);
    const invoice = (attempt: number, next: number | null) => ({
      id: 'in_l35_renewal_' + b.organizationId.slice(0, 8),
      object: 'invoice',
      customer,
      currency: 'ron',
      amount_due: 34900,
      amount_paid: 0,
      attempt_count: attempt,
      next_payment_attempt: next,
    });
    await send('invoice.payment_failed', invoice(1, retry));
    await send('invoice.payment_failed', invoice(2, retry + 3 * 86_400));
    await send('invoice.payment_failed', invoice(3, null));
    expect(
      await count(
        `SELECT count(*) AS n FROM billing.payment WHERE organization_id = $1 AND status = 'failed'`,
        [b.organizationId],
      ),
    ).toBe(3);
    await dispatchNotifications();
    const notes = await q(
      `SELECT type, params FROM notifications.notification WHERE organization_id = $1 ORDER BY created_at`,
      [b.organizationId],
    );
    expect(notes.map((n) => n.type)).toEqual(['billing.payment.renewal', 'billing.payment.retry']);
    expect(notes[0]!.params).toEqual({
      business: 'Salon Reînnoire',
      amount: { type: 'money', amountMinor: 34900, currency: 'RON' },
      brand: 'Visa',
      last4: '4242',
      retryDate: { type: 'date', date: '2026-12-04' },
    });
    // paid in the end: one succeeded payment, the event for the invoice
    await send('invoice.paid', { ...invoice(4, null), amount_paid: 34900 });
    expect(
      await count(
        `SELECT count(*) AS n FROM billing.outbox_events WHERE organization_id = $1 AND type = 'billing.payment.succeeded'`,
        [b.organizationId],
      ),
    ).toBe(1);
  });

  it('the subscription mirror ignores an older event', async () => {
    const b = await business();
    await saveCard(b);
    const [bs] = await q(
      `SELECT stripe_subscription_id FROM billing.billing_subscription WHERE organization_id = $1`,
      [b.organizationId],
    );
    const id = bs!.stripe_subscription_id as string;
    const t = Math.floor(Date.now() / 1000);
    await send(
      'customer.subscription.updated',
      fake.subscriptionObject(id, { status: 'past_due' }),
      t,
    );
    await send(
      'customer.subscription.updated',
      fake.subscriptionObject(id, { status: 'active' }),
      t - 60,
    );
    const [after] = await q(
      `SELECT status FROM billing.billing_subscription WHERE organization_id = $1`,
      [b.organizationId],
    );
    expect(after!.status).toBe('past_due');
  });

  it('discounts become coupons (D3-21): on the subscription, permanent; ended → removed', async () => {
    const b = await business();
    await saveCard(b);
    const [sub] = await q(`SELECT id FROM commercial.subscription WHERE organization_id = $1`, [
      b.organizationId,
    ]);
    const [d] = await q(
      `INSERT INTO commercial.discount (organization_id, subscription_id, scope, kind, percent_off, currency,
         duration, reason, created_by_founder_id)
       VALUES ($1, $2, 'subscription', 'percent', 20, 'RON', 'forever', 'Partener de lansare, test lot 3.5', $3)
       RETURNING id`,
      [b.organizationId, sub!.id, founderId],
    );
    expect(await reconcileSubscription(b.organizationId)).toBe('updated');
    const [bs] = await q(
      `SELECT stripe_subscription_id FROM billing.billing_subscription WHERE organization_id = $1`,
      [b.organizationId],
    );
    const stripeSub = fake.subscriptions.get(bs!.stripe_subscription_id)!;
    expect(stripeSub.couponIds).toEqual([`vnt_disc_${d!.id}`]);
    expect(fake.coupons.get(`vnt_disc_${d!.id}`)).toMatchObject({
      percentOff: 20,
      duration: 'forever',
    });
    await q(
      `UPDATE commercial.discount SET ended_at = now(), ended_by_founder_id = $2 WHERE id = $1`,
      [d!.id, founderId],
    );
    expect(await reconcileSubscription(b.organizationId)).toBe('updated');
    expect(fake.subscriptions.get(bs!.stripe_subscription_id)!.couponIds).toEqual([]);
  });

  it('E3 (3.9a): an application started by „Pornește aplicația” → its first days invoiced now (always_invoice); a line added by Founder stays on the next invoice', async () => {
    const b = await business();
    await saveCard(b);
    const [sub] = await q(`SELECT id FROM commercial.subscription WHERE organization_id = $1`, [
      b.organizationId,
    ]);
    const line = async () =>
      (
        await q(
          `INSERT INTO commercial.subscription_application
             (organization_id, subscription_id, application_id, currency, interval, amount_minor,
              source, created_by_founder_id)
           VALUES ($1, $2, 'crm', 'RON', 'month', 6900, 'request', $3) RETURNING id`,
          [b.organizationId, sub!.id, founderId],
        )
      )[0]!.id as string;
    // a line added by Founder (or a request handled): prorated on the next invoice (D3-7)
    const founderLine = await line();
    let before = fake.calls.length;
    expect(await reconcileSubscription(b.organizationId)).toBe('updated');
    expect(fake.calls.slice(before)).toContain('updateSubscription:prorate');
    expect(fake.calls.slice(before)).not.toContain('updateSubscription:invoiceNow');
    await q(
      `UPDATE commercial.subscription_application SET ended_at = now(), ended_by_founder_id = $2 WHERE id = $1`,
      [founderLine, founderId],
    );
    await reconcileSubscription(b.organizationId);
    // the line of a setup request gone live (Lot 3.8), as goLiveSetup leaves it
    const setupLine = await line();
    const u = newUuid();
    await admin.query('BEGIN');
    await admin.query(`SET LOCAL session_replication_role = replica`);
    await admin.query(
      `INSERT INTO commercial.setup_request
         (organization_id, application_id, currency, status, requested_by_user_id,
          setup_minor, maintenance_minor, maintenance_interval, estimated_start_on,
          offer_sent_at, offer_sent_by_founder_id, accepted_at, accepted_by_user_id,
          start_on, confirmed_at, confirmed_by_founder_id, paid_at, payment_method, payment_ref,
          paid_minor, work_started_at, work_started_by_founder_id, live_at, live_by_founder_id,
          subscription_application_id)
       VALUES ($1, 'crm', 'RON', 'live', $2, 30000, 6900, 'month', current_date,
               now(), $3, now(), $2, current_date, now(), $3, now(), 'card', $4, 30000,
               now(), $3, now(), $3, $5)`,
      [b.organizationId, b.ownerId, founderId, u, setupLine],
    );
    await admin.query('COMMIT');
    before = fake.calls.length;
    expect(await reconcileSubscription(b.organizationId)).toBe('updated');
    expect(fake.calls.slice(before)).toContain('updateSubscription:invoiceNow');
    expect(fake.calls.slice(before)).not.toContain('updateSubscription:prorate');
    expect(await reconcileSubscription(b.organizationId)).toBe('unchanged');
  });

  it('canceled in Ventora → Stripe stops at the end of the paid period (D3-10)', async () => {
    const b = await business();
    await saveCard(b);
    await q(
      `UPDATE commercial.subscription SET status = 'canceled', canceled_at = now() WHERE organization_id = $1`,
      [b.organizationId],
    );
    expect(await reconcileSubscription(b.organizationId)).toBe('cancel_scheduled');
    const [bs] = await q(
      `SELECT cancel_at_period_end FROM billing.billing_subscription WHERE organization_id = $1`,
      [b.organizationId],
    );
    expect(bs!.cancel_at_period_end).toBe(true);
  });

  it('a chargeback: recorded, audited, reported; the decision stays at Founder', async () => {
    const b = await business();
    await saveCard(b);
    const addonId = await addon({ validity: 'current_month' });
    const res = await purchase(b.ctx, { kind: 'addon', addonId });
    const [row] = await q(`SELECT stripe_payment_intent_id FROM billing.purchase WHERE id = $1`, [
      res.purchaseId,
    ]);
    const pi = fake.paymentIntents.get(row!.stripe_payment_intent_id)!;
    const out = await send('charge.dispute.created', {
      id: 'dp_l35_' + b.organizationId.slice(0, 8),
      object: 'dispute',
      charge: pi.chargeId,
      payment_intent: pi.id,
      amount: 4900,
      currency: 'ron',
      reason: 'fraudulent',
      status: 'needs_response',
    });
    expect(out).toMatchObject({
      status: 'processed',
      disputeOpened: true,
      organizationId: b.organizationId,
    });
    expect(
      await count(`SELECT count(*) AS n FROM billing.dispute WHERE organization_id = $1`, [
        b.organizationId,
      ]),
    ).toBe(1);
    expect(
      await count(
        `SELECT count(*) AS n FROM audit.audit_log WHERE action = 'billing.dispute_opened' AND organization_id = $1`,
        [b.organizationId],
      ),
    ).toBe(1);
  });

  it('the platform job reconciles every business with a card and activates paid purchases left behind', async () => {
    const b = await business();
    await saveCard(b);
    const addonId = await addon({ validity: 'current_month' });
    const res = await purchase(b.ctx, { kind: 'addon', addonId });
    // as if the activation had failed after the payment
    await q(`DELETE FROM commercial.addon_grant WHERE purchase_id = $1`, [res.purchaseId]);
    await q(`UPDATE billing.purchase SET status = 'paid', activated_at = NULL WHERE id = $1`, [
      res.purchaseId,
    ]);
    const report = await runStripeReconcileJob();
    expect(report.failed.filter((f) => f.organizationId === b.organizationId)).toEqual([]);
    expect(report.checked).toBeGreaterThan(0);
    const [after] = await q(`SELECT status FROM billing.purchase WHERE id = $1`, [res.purchaseId]);
    expect(after!.status).toBe('succeeded');
    expect(
      await count(`SELECT count(*) AS n FROM commercial.addon_grant WHERE purchase_id = $1`, [
        res.purchaseId,
      ]),
    ).toBe(1);
  });
});

// ── Isolation and card data ────────────────────────────────────────────────────────────────

describe('Lot 3.5 — isolation between businesses (T1/T2) and no card data', () => {
  it("billing_rw in one business's context sees and writes nothing of another's", async () => {
    const a = await business();
    const b = await business();
    await saveCard(a);
    const addonId = await addon({ validity: 'current_month' });
    await purchase(a.ctx, { kind: 'addon', addonId });
    const client = await appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE billing_rw');
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [b.organizationId]);
      for (const table of [
        'billing_customer',
        'payment_method_ref',
        'purchase',
        'payment',
        'billing_subscription',
        'stripe_event',
      ]) {
        const { rows } = await client.query(
          `SELECT count(*)::int AS n FROM billing.${table} WHERE organization_id = $1`,
          [a.organizationId],
        );
        expect([table, rows[0].n]).toEqual([table, 0]);
      }
      await expect(
        client.query(
          `INSERT INTO billing.purchase (id, organization_id, kind, addon_id, item_name, currency, price_minor, recurring, created_by_user_id)
           VALUES ($1, $2, 'addon', $3, 'x', 'RON', 1, false, $4)`,
          [newUuid(), a.organizationId, addonId, a.ownerId],
        ),
      ).rejects.toThrow(/row-level security/);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
    // no DELETE for billing_rw
    const del = await appPool.connect();
    try {
      await del.query('BEGIN');
      await del.query('SET LOCAL ROLE billing_rw');
      await expect(del.query('DELETE FROM billing.payment')).rejects.toThrow(/permission denied/);
    } finally {
      await del.query('ROLLBACK');
      del.release();
    }
  });

  it("a PaymentIntent of A that names B's purchase in its metadata changes nothing at B", async () => {
    const a = await business();
    const b = await business();
    await saveCard(a);
    await saveCard(b, 'pm_card_threeDSecure2Required');
    const addonId = await addon({ validity: 'current_month' });
    const pending = await purchase(b.ctx, { kind: 'addon', addonId });
    expect(pending.status).toBe('requires_action');
    const done = await purchase(a.ctx, { kind: 'addon', addonId });
    const [row] = await q(`SELECT stripe_payment_intent_id FROM billing.purchase WHERE id = $1`, [
      done.purchaseId,
    ]);
    const forged = {
      ...fake.piObject(row!.stripe_payment_intent_id),
      metadata: { purchase_id: pending.purchaseId, organization_id: b.organizationId },
    };
    const out = await send('payment_intent.succeeded', forged);
    expect(out.organizationId).toBe(a.organizationId); // the customer decides, not the metadata
    const [still] = await q(`SELECT status FROM billing.purchase WHERE id = $1`, [
      pending.purchaseId,
    ]);
    expect(still!.status).toBe('requires_action');
  });

  it('no card data in Ventora: only brand, last 4, expiry, Stripe ids', async () => {
    const columns = await q(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'billing'`,
    );
    // Lot 3.6: invoice.number is the invoice's number from SmartBill, not a card's
    const names = columns
      .map((c) => `${c.table_name}.${c.column_name}`)
      .filter((n) => n !== 'invoice.number');
    expect(names.filter((n) => /(number|pan|cvc|cvv|card_?number|fingerprint)/i.test(n))).toEqual(
      [],
    );
    const dump = JSON.stringify(
      await q(
        `SELECT (SELECT json_agg(t) FROM billing.payment_method_ref t) AS cards,
                (SELECT json_agg(t) FROM billing.purchase t) AS purchases,
                (SELECT json_agg(t) FROM billing.payment t) AS payments,
                (SELECT json_agg(t.payload) FROM billing.outbox_events t) AS events,
                (SELECT json_agg(t.metadata) FROM audit.audit_log t WHERE action LIKE 'billing.%') AS audit`,
      ),
    );
    expect(dump).not.toMatch(/4242424242424242|4000000000000002|4000002760003184|_secret_/);
  });
});
