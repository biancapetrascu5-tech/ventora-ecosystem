import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client, Pool, type PoolClient } from 'pg';
import { closeAuditPools } from '@ventora/audit';
import { closeCommercialPools } from '@ventora/commercial';
import { founderAuth } from '@ventora/identity';
import { ConsumerRegistry, dispatchOutbox } from '@ventora/integrations';
import {
  closeBillingPools,
  handleStripeWebhook,
  invoiceIssueConsumer,
  issueInvoice,
  listFailedPaymentsForFounder,
  listInvoicesNeedingAttentionForFounder,
  listOpenDisputesForFounder,
  listPayments,
  purchase,
  romanianMonth,
  runInvoiceIssueJob,
  setInvoiceProviderForTests,
  setStripeGatewayForTests,
  signStripePayload,
  startCardSetup,
  TestInvoiceProvider,
} from '../index';
import { eventFor, FakeStripe } from './fake-stripe';

/*
 * Lot 3.6 on the runtime roles (app_runtime → billing_rw; founder_runtime → billing.founder_*),
 * with the fake Stripe and the test invoice provider (CI has no SmartBill account). „Gata când”
 * (FAZA-3 §3.6):
 *   - a test payment → its invoice issued;
 *   - the same payment processed twice → one invoice;
 *   - the provider down → `pending`, then `issued` after the retry, without a second invoice.
 * Plus: an uncertain answer is never retried by itself, the storno after a full refund, the
 * dispute's deadline, the Founder reads (Prezentare) and the isolation between businesses.
 */

const SECRET = 'whsec_test_lot36_invoices'; // gitleaks:allow
const FOUNDER_PASSPHRASE = 'Founder-invoices-passphrase-1'; // gitleaks:allow
const adminPool = new Pool({ connectionString: process.env.DIRECT_URL, max: 2 });
const appPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
let admin: PoolClient;
const q = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;
const count = async (sql: string, params: unknown[]) => Number((await q(sql, params))[0]!.n);
const founderId = randomUUID();
const fake = new FakeStripe();
// numbered from a fresh point each run: a local test database may keep the invoices of the last one
const provider = new TestInvoiceProvider('TST', (Date.now() % 1_000_000) * 100);
let versionId: string;
let founder: { headers: () => Headers };

async function send(type: string, object: Record<string, unknown>) {
  const body = eventFor(type, object);
  return handleStripeWebhook(body, signStripePayload(body, SECRET));
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

// ── fixtures ────────────────────────────────────────────────────────────────────────────────

async function totpFromBase32(base32Secret: string): Promise<string> {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of base32Secret.toUpperCase().replace(/=+$/, '')) {
    const v = alpha.indexOf(c);
    if (v >= 0) bits += v.toString(2).padStart(5, '0');
  }
  const raw = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < raw.length; i++) raw[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setBigUint64(0, BigInt(Math.floor(Date.now() / 30_000)), false);
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-1' }, false, [
    'sign',
  ]);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf));
  const o = sig[sig.length - 1]! & 0x0f;
  const code =
    (((sig[o]! & 0x7f) << 24) |
      ((sig[o + 1]! & 0xff) << 16) |
      ((sig[o + 2]! & 0xff) << 8) |
      (sig[o + 3]! & 0xff)) %
    1_000_000;
  return code.toString().padStart(6, '0');
}

function sessionCookieFrom(resp: Response): string {
  const all =
    (resp.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ??
    (resp.headers.get('set-cookie') ?? '').split(', ');
  const line = all.find((c) => c.includes('session_token='));
  if (!line) throw new Error('no session cookie in response');
  return line.split(';')[0]!.trim();
}

async function createFounder(): Promise<{ headers: () => Headers }> {
  const email = `founder-l36-${randomUUID()}@test.local`;
  await founderAuth.api.signUpEmail({
    body: { name: 'Founder 3.6', email, password: FOUNDER_PASSPHRASE },
  });
  const signIn = await founderAuth.api.signInEmail({
    body: { email, password: FOUNDER_PASSPHRASE },
    asResponse: true,
  });
  let cookie = sessionCookieFrom(signIn);
  const enabled = await founderAuth.api.enableTwoFactor({
    headers: new Headers({ cookie }),
    body: { password: FOUNDER_PASSPHRASE },
  });
  const secret = (enabled as { totpURI: string }).totpURI.match(/[?&]secret=([A-Z2-7=]+)/i)![1]!;
  const verified = await founderAuth.api.verifyTOTP({
    headers: new Headers({ cookie }),
    body: { code: await totpFromBase32(secret) },
    asResponse: true,
  });
  cookie = sessionCookieFrom(verified);
  return { headers: () => new Headers({ cookie }) };
}

async function bundle(): Promise<string> {
  const [p] = await q(
    `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'Business', $2) RETURNING id`,
    [`l36-${randomUUID().slice(0, 8)}`, founderId],
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

async function business(name = `Salon ${randomUUID().slice(0, 4)}`) {
  const organizationId = randomUUID();
  const ownerId = randomUUID();
  await q(
    `INSERT INTO organizations.organization (id, slug, name, created_via, updated_at)
     VALUES ($1, $2, $3, 'founder', now())`,
    [organizationId, `l36-${organizationId.slice(0, 12)}`, name],
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
  const started = daysAgo(10);
  await q(
    `INSERT INTO commercial.subscription
       (organization_id, plan_version_id, interval, currency, started_on, anchor_day, status,
        created_by_founder_id)
     VALUES ($1, $2, 'month', 'RON', $3::date, EXTRACT(DAY FROM $3::date), 'active', $4)`,
    [organizationId, versionId, started, founderId],
  );
  const ctx = { organizationId, userId: ownerId, actor: 'user' as const };
  // the card, as Stripe reports it
  const { setupIntentId } = await startCardSetup(ctx);
  const si = fake.confirmSetup(setupIntentId, 'pm_card_visa');
  await send('setup_intent.succeeded', {
    id: si.id,
    object: 'setup_intent',
    status: 'succeeded',
    customer: si.customerId,
    payment_method: 'pm_card_visa',
    metadata: si.metadata,
  });
  return { organizationId, ownerId, name, ctx };
}

type Biz = Awaited<ReturnType<typeof business>>;

let addonId: string;

async function packAddon(): Promise<string> {
  const [a] = await q(
    `INSERT INTO commercial.addon (code, name, quota_key, quantity, validity, purchase_mode, created_by_founder_id)
     VALUES ($1, '500 SMS', 'messaging.sms', 500, 'current_month', 'direct', $2) RETURNING id`,
    [`l36-${randomUUID().slice(0, 8)}`, founderId],
  );
  await q(
    `INSERT INTO commercial.addon_price (addon_id, currency, amount_minor, setup_minor)
     VALUES ($1, 'RON', 4900, 0)`,
    [a!.id],
  );
  return a!.id as string;
}

/** A pack bought and paid; returns the payment's id. */
async function paidPack(b: Biz, packs = 1): Promise<string> {
  const res = await purchase(b.ctx, { kind: 'addon', addonId, packs });
  expect(res.status).toBe('succeeded');
  const [p] = await q(`SELECT id FROM billing.payment WHERE purchase_id = $1`, [res.purchaseId]);
  return p!.id as string;
}

async function dispatch() {
  return dispatchOutbox({
    pool: appPool,
    source: { schema: 'billing', moduleRole: 'billing_rw' },
    registry: new ConsumerRegistry().register(invoiceIssueConsumer),
    limit: 100,
  });
}

const invoiceOf = async (paymentId: string) =>
  (
    await q(`SELECT * FROM billing.invoice WHERE payment_id = $1 AND kind = 'invoice'`, [paymentId])
  )[0];

/** The next attempt is due now (instead of waiting the backoff). */
const dueNow = (invoiceId: string) =>
  q(`UPDATE billing.invoice SET next_attempt_at = now() WHERE id = $1`, [invoiceId]);

beforeAll(async () => {
  admin = await adminPool.connect();
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  setStripeGatewayForTests(fake);
  setInvoiceProviderForTests(provider);
  versionId = await bundle();
  addonId = await packAddon();
  founder = await createFounder();
});

afterAll(async () => {
  setStripeGatewayForTests(null);
  setInvoiceProviderForTests(null);
  admin.release();
  await adminPool.end();
  await appPool.end();
  await closeBillingPools();
  await closeCommercialPools();
  await closeAuditPools();
});

// ── „Gata când” ─────────────────────────────────────────────────────────────────────────────

describe('Lot 3.6 — the invoice of every payment', () => {
  it('a test payment → its invoice issued: the glossary line, paid by card, the event for the e-mail, listed in the Hub', async () => {
    const b = await business('Salon Factura');
    const paymentId = await paidPack(b, 2);
    await dispatch();
    const pending = await invoiceOf(paymentId);
    expect(pending).toMatchObject({
      status: 'pending',
      provider: 'test',
      amount_minor: '9800',
      currency: 'RON',
      attempts: 0,
    });
    const before = provider.documents.length;
    expect(await issueInvoice(b.organizationId, pending!.id)).toBe('issued');
    const issued = await invoiceOf(paymentId);
    expect(issued).toMatchObject({ status: 'issued', series: 'TST', attempts: 1 });
    expect(issued!.number).toMatch(/^\d{4,}$/);
    expect(issued!.claimed_until).toBeNull();
    expect(provider.documents.length).toBe(before + 1);
    const doc = provider.documents.at(-1)!;
    expect(doc.input).toMatchObject({
      reference: pending!.id,
      currency: 'RON',
      buyer: { name: 'Salon Factura', country: 'Romania', vatCode: null },
      lines: [{ name: 'Pachet în plus · 500 SMS', code: 'VNT-PACK', quantity: 2, unitMinor: 4900 }],
      paid: { amountMinor: 9800 },
    });
    expect(
      await count(
        `SELECT count(*) AS n FROM billing.outbox_events WHERE type = 'billing.invoice.issued' AND resource_id = $1`,
        [pending!.id],
      ),
    ).toBe(1);
    expect(
      await count(
        `SELECT count(*) AS n FROM audit.audit_log WHERE action = 'billing.invoice_issued' AND target_id = $1`,
        [pending!.id],
      ),
    ).toBe(1);
    // the Hub's list shows the number („Descarcă PDF” comes with the signed link)
    const rows = await listPayments({ organizationId: b.organizationId });
    expect(rows.find((r) => r.id === paymentId)!.invoice).toEqual({
      id: pending!.id,
      number: `TST-${issued!.number}`,
    });
    // issuing again changes nothing
    expect(await issueInvoice(b.organizationId, pending!.id)).toBe('skipped');
    expect(provider.documents.length).toBe(before + 1);
  });

  it('the same payment processed twice → one invoice (the event delivered again, the consumer run again)', async () => {
    const b = await business();
    const paymentId = await paidPack(b);
    await dispatch();
    const [event] = await q(
      `SELECT event_id, organization_id, payload FROM billing.outbox_events
        WHERE type = 'billing.payment.succeeded' AND organization_id = $1`,
      [b.organizationId],
    );
    // the consumer again, as if the dispatcher delivered the event a second time
    const client = await appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE billing_rw');
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [b.organizationId]);
      await invoiceIssueConsumer.handle(
        { organizationId: event!.organization_id, payload: event!.payload },
        client,
      );
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    // and the event itself back to pending, dispatched again
    await q(`UPDATE billing.outbox_events SET status = 'pending' WHERE event_id = $1`, [
      event!.event_id,
    ]);
    await q(`DELETE FROM billing.processed_events WHERE event_id = $1`, [event!.event_id]);
    await dispatch();
    expect(
      await count(`SELECT count(*) AS n FROM billing.invoice WHERE payment_id = $1`, [paymentId]),
    ).toBe(1);
    const job = await runInvoiceIssueJob({ limit: 100 });
    expect(job.errors).toEqual([]);
    const before = provider.documents.length;
    await runInvoiceIssueJob({ limit: 100 });
    expect(provider.documents.length).toBe(before);
    expect(await invoiceOf(paymentId)).toMatchObject({ status: 'issued' });
  });

  it('SmartBill down → pending, then issued after the retry, without a second invoice', async () => {
    const b = await business();
    const paymentId = await paidPack(b);
    await dispatch();
    const { id } = (await invoiceOf(paymentId))!;
    const docs = provider.documents.length;
    const calls = provider.calls;
    provider.failNext('retryable', 2);

    expect(await issueInvoice(b.organizationId, id)).toBe('pending');
    let row = await invoiceOf(paymentId);
    expect(row).toMatchObject({ status: 'pending', attempts: 1, claimed_until: null });
    expect(row!.last_error).toContain('retryable');
    expect(row!.next_attempt_at.getTime()).toBeGreaterThan(Date.now());
    // not due yet: the job leaves it
    expect(await issueInvoice(b.organizationId, id)).toBe('skipped');

    await dueNow(id);
    expect(await issueInvoice(b.organizationId, id)).toBe('pending');
    row = await invoiceOf(paymentId);
    expect(row!.attempts).toBe(2);

    await dueNow(id);
    expect(await issueInvoice(b.organizationId, id)).toBe('issued');
    row = await invoiceOf(paymentId);
    expect(row).toMatchObject({ status: 'issued', attempts: 3, last_error: null });
    expect(provider.calls).toBe(calls + 3);
    expect(provider.documents.length).toBe(docs + 1);
    // the lines and the buyer were photographed once: the retry sent the same invoice
    expect(row!.lines).toEqual([
      { name: 'Pachet în plus · 500 SMS', code: 'VNT-PACK', quantity: 1, unitMinor: 4900 },
    ]);
  });

  it('an uncertain answer (timeout, 500) → failed, never retried by itself; Founder sees it', async () => {
    const b = await business();
    const paymentId = await paidPack(b);
    await dispatch();
    const { id } = (await invoiceOf(paymentId))!;
    provider.failNext('ambiguous');
    expect(await issueInvoice(b.organizationId, id)).toBe('failed');
    const row = await invoiceOf(paymentId);
    expect(row).toMatchObject({ status: 'failed', attempts: 1 });
    expect(row!.failed_at).not.toBeNull();
    const calls = provider.calls;
    await runInvoiceIssueJob({ limit: 100 });
    expect(await issueInvoice(b.organizationId, id)).toBe('skipped');
    expect(provider.calls).toBe(calls);
    const attention = await listInvoicesNeedingAttentionForFounder({
      founderHeaders: founder.headers(),
    });
    expect(attention.find((a) => a.invoiceId === id)).toMatchObject({
      organizationId: b.organizationId,
      status: 'failed',
      amountMinor: 4900,
    });
    expect(
      await count(
        `SELECT count(*) AS n FROM audit.audit_log WHERE action = 'billing.invoice_failed' AND target_id = $1`,
        [id],
      ),
    ).toBe(1);
  });

  it('an attempt that ended without a result (lease run out) → failed, no second call', async () => {
    const b = await business();
    const paymentId = await paidPack(b);
    await dispatch();
    const { id } = (await invoiceOf(paymentId))!;
    await q(
      `UPDATE billing.invoice SET attempts = 1, claimed_until = now() - interval '1 minute' WHERE id = $1`,
      [id],
    );
    const calls = provider.calls;
    expect(await issueInvoice(b.organizationId, id)).toBe('failed');
    expect(provider.calls).toBe(calls);
    expect((await invoiceOf(paymentId))!.last_error).toContain('ambiguous');
  });

  it('a renewal of the subscription → „Abonament Business · {luna}”', async () => {
    const b = await business();
    const [bs] = await q(
      `SELECT stripe_subscription_id FROM billing.billing_subscription WHERE organization_id = $1`,
      [b.organizationId],
    );
    const customer = fake.subscriptions.get(bs!.stripe_subscription_id)!.customerId;
    await send('invoice.paid', {
      id: 'in_l36_' + b.organizationId.slice(0, 8),
      object: 'invoice',
      customer,
      currency: 'ron',
      amount_due: 34900,
      amount_paid: 34900,
      attempt_count: 1,
      next_payment_attempt: null,
    });
    await dispatch();
    const [p] = await q(
      `SELECT id, occurred_at FROM billing.payment WHERE organization_id = $1 AND kind = 'subscription'`,
      [b.organizationId],
    );
    const { id } = (await invoiceOf(p!.id))!;
    expect(await issueInvoice(b.organizationId, id)).toBe('issued');
    expect((await invoiceOf(p!.id))!.lines).toEqual([
      {
        name: `Abonament Business · ${romanianMonth(p!.occurred_at)}`,
        code: 'VNT-SUB',
        quantity: 1,
        unitMinor: 34900,
      },
    ]);
  });
});

describe('Lot 3.6 — the storno after a full refund (D3-10)', () => {
  it('a full refund → the storno, issued after its invoice; a partial refund → no storno', async () => {
    const b = await business();
    const paymentId = await paidPack(b);
    const [p] = await q(`SELECT idempotency_key FROM billing.payment WHERE id = $1`, [paymentId]);
    const chargeId = p!.idempotency_key as string;
    const customer = (
      await q(
        `SELECT stripe_customer_id FROM billing.billing_customer WHERE organization_id = $1`,
        [b.organizationId],
      )
    )[0]!.stripe_customer_id;

    // partial: recorded in the audit, nothing to reverse
    await send('charge.refunded', {
      id: chargeId,
      object: 'charge',
      customer,
      amount: 4900,
      amount_refunded: 1000,
      currency: 'ron',
    });
    expect(
      await count(
        `SELECT count(*) AS n FROM billing.invoice WHERE kind = 'storno' AND payment_id = $1`,
        [paymentId],
      ),
    ).toBe(0);

    // full, before the invoice was even issued (the refund came before the consumer)
    const full = {
      id: chargeId,
      object: 'charge',
      customer,
      amount: 4900,
      amount_refunded: 4900,
      currency: 'ron',
    };
    expect((await send('charge.refunded', full)).status).toBe('processed');
    const [storno] = await q(
      `SELECT * FROM billing.invoice WHERE kind = 'storno' AND payment_id = $1`,
      [paymentId],
    );
    expect(storno).toMatchObject({ status: 'pending', amount_minor: '4900' });
    await dispatch(); // the consumer finds the invoice already there: still one
    expect(
      await count(
        `SELECT count(*) AS n FROM billing.invoice WHERE kind = 'invoice' AND payment_id = $1`,
        [paymentId],
      ),
    ).toBe(1);

    // the storno waits for its invoice
    expect(await issueInvoice(b.organizationId, storno!.id)).toBe('skipped');
    const invoice = (await invoiceOf(paymentId))!;
    expect(await issueInvoice(b.organizationId, invoice.id)).toBe('issued');
    await dueNow(storno!.id);
    expect(await issueInvoice(b.organizationId, storno!.id)).toBe('issued');
    const issuedInvoice = (await invoiceOf(paymentId))!;
    expect(provider.documents.at(-1)).toMatchObject({
      kind: 'storno',
      input: { series: 'TST', number: issuedInvoice.number },
    });
    // the same refund event again (another id): one storno
    await send('charge.refunded', full);
    expect(
      await count(
        `SELECT count(*) AS n FROM billing.invoice WHERE kind = 'storno' AND payment_id = $1`,
        [paymentId],
      ),
    ).toBe(1);
    expect(
      await count(
        `SELECT count(*) AS n FROM audit.audit_log WHERE action = 'billing.payment_refunded' AND target_id = $1`,
        [paymentId],
      ),
    ).toBe(3);
  });
});

describe('Lot 3.6 — Founder · Prezentare: failed payments and disputes', () => {
  it('a refused renewal is listed with the amount to collect until it is paid', async () => {
    const b = await business();
    const [bs] = await q(
      `SELECT stripe_subscription_id FROM billing.billing_subscription WHERE organization_id = $1`,
      [b.organizationId],
    );
    const customer = fake.subscriptions.get(bs!.stripe_subscription_id)!.customerId;
    const id = 'in_l36_failed_' + b.organizationId.slice(0, 8);
    const invoice = (attempt: number, next: number | null) => ({
      id,
      object: 'invoice',
      customer,
      currency: 'ron',
      amount_due: 34900,
      amount_paid: 0,
      attempt_count: attempt,
      next_payment_attempt: next,
    });
    const retry = Math.floor(Date.now() / 1000) + 3 * 86_400;
    await send('invoice.payment_failed', invoice(1, retry));
    await send('invoice.payment_failed', invoice(2, retry + 86_400));
    const mine = async () =>
      (await listFailedPaymentsForFounder({ founderHeaders: founder.headers() })).filter(
        (f) => f.organizationId === b.organizationId,
      );
    const listed = await mine();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      stripeInvoiceId: id,
      amountMinor: 34900,
      currency: 'RON',
      attempt: 2,
    });
    expect(listed[0]!.nextAttemptAt!.getTime()).toBe((retry + 86_400) * 1000);
    // paid in the end: nothing left to collect
    await send('invoice.paid', { ...invoice(3, null), amount_paid: 34900 });
    expect(await mine()).toEqual([]);
  });

  it('a dispute: the deadline from Stripe, listed until closed', async () => {
    const b = await business();
    const res = await purchase(b.ctx, { kind: 'addon', addonId });
    const [row] = await q(`SELECT stripe_payment_intent_id FROM billing.purchase WHERE id = $1`, [
      res.purchaseId,
    ]);
    const pi = fake.paymentIntents.get(row!.stripe_payment_intent_id)!;
    const due = Math.floor(Date.parse('2026-11-20T23:59:59Z') / 1000);
    const dispute = (status: string, dueBy: number | null) => ({
      id: 'dp_l36_' + b.organizationId.slice(0, 8),
      object: 'dispute',
      charge: pi.chargeId,
      payment_intent: pi.id,
      amount: 4900,
      currency: 'ron',
      reason: 'fraudulent',
      status,
      evidence_details: dueBy === null ? { due_by: null } : { due_by: dueBy },
    });
    await send('charge.dispute.created', dispute('needs_response', due));
    const [d] = await q(`SELECT evidence_due_by FROM billing.dispute WHERE organization_id = $1`, [
      b.organizationId,
    ]);
    expect(d!.evidence_due_by.getTime()).toBe(due * 1000);
    const mine = async () =>
      (await listOpenDisputesForFounder({ founderHeaders: founder.headers() })).filter(
        (x) => x.organizationId === b.organizationId,
      );
    expect(await mine()).toEqual([
      expect.objectContaining({
        amountMinor: 4900,
        currency: 'RON',
        reason: 'fraudulent',
        status: 'needs_response',
        evidenceDueBy: new Date(due * 1000),
      }),
    ]);
    // an update without a deadline keeps the one known
    await send('charge.dispute.updated', dispute('under_review', null));
    expect((await mine())[0]).toMatchObject({
      status: 'under_review',
      evidenceDueBy: new Date(due * 1000),
    });
    await send('charge.dispute.closed', dispute('won', null));
    expect(await mine()).toEqual([]);
  });

  it('without a Founder session the reads are refused', async () => {
    const none = new Headers();
    await expect(listFailedPaymentsForFounder({ founderHeaders: none })).rejects.toThrow();
    await expect(listOpenDisputesForFounder({ founderHeaders: none })).rejects.toThrow();
    await expect(
      listInvoicesNeedingAttentionForFounder({ founderHeaders: none }),
    ).rejects.toThrow();
  });

  it('founder_runtime reaches billing only through the founder functions', async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL_FOUNDER });
    await client.connect();
    try {
      await expect(client.query('SELECT * FROM billing.invoice LIMIT 1')).rejects.toMatchObject({
        code: '42501',
      });
      await expect(client.query('SELECT * FROM billing.invoices_due(1)')).rejects.toMatchObject({
        code: '42501',
      });
    } finally {
      await client.end();
    }
  });
});

describe('Lot 3.6 — isolation between businesses (T1/T2)', () => {
  it("billing_rw in one business's context sees and writes no invoice of another", async () => {
    const a = await business();
    const other = await business();
    const paymentId = await paidPack(other);
    await dispatch();
    const { id } = (await invoiceOf(paymentId))!;
    const client = await appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE billing_rw');
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [a.organizationId]);
      expect(
        (await client.query(`SELECT id FROM billing.invoice WHERE id = $1`, [id])).rows,
      ).toEqual([]);
      const upd = await client.query(
        `UPDATE billing.invoice SET status = 'failed', failed_at = now() WHERE id = $1`,
        [id],
      );
      expect(upd.rowCount).toBe(0);
      await expect(
        client.query(
          `INSERT INTO billing.invoice (id, organization_id, kind, payment_id, provider, amount_minor, currency)
           VALUES ($1, $2, 'invoice', $3, 'test', 1, 'RON')`,
          [randomUUID(), other.organizationId, paymentId],
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await client.query('ROLLBACK');
      // and no DELETE at all
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE billing_rw');
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [
        other.organizationId,
      ]);
      await expect(
        client.query(`DELETE FROM billing.invoice WHERE id = $1`, [id]),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
    // issuing in the wrong business's context finds nothing
    expect(await issueInvoice(a.organizationId, id)).toBe('skipped');
  });
});
