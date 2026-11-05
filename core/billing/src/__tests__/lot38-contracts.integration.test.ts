import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { closeAuditPools } from '@ventora/audit';
import {
  acceptSetupOffer,
  cancelSetupByOwner,
  closeCommercialPools,
  confirmSetup,
  getOpenDunning,
  goLiveSetup,
  isReadOnly,
  listSetupRequests,
  openDunning,
  requestSetup,
  resolveDunningPaid,
  runDunningGraceJob,
  runTrialJob,
  sendSetupOffer,
  startApplicationTrial,
  startSetupWork,
  getSetupOfferDefaults,
  billingPeriod,
} from '@ventora/commercial';
import { founderAuth } from '@ventora/identity';
import { ConsumerRegistry, dispatchOutbox } from '@ventora/integrations';
import {
  billingInvoiceIssuedConsumer,
  BillingProfileInvalid,
  closeBillingPools,
  confirmTransferReceipt,
  createSetupTransferInvoice,
  getBillingProfile,
  issueInvoice,
  listInvoicesForFounder,
  markInvoiceManual,
  refundSetupRequest,
  retryInvoice,
  runSubscriptionTrialJob,
  runTransferInvoiceJob,
  runTransferOverdueJob,
  saveBillingProfile,
  setInvoiceProviderForTests,
  setPaymentSettings,
  TestInvoiceProvider,
  transferReceiptConsumer,
} from '../index';

/*
 * Lot 3.8 · Etapa 2 — the contracts on the runtime roles (app_runtime → commercial_rw /
 * billing_rw; founder_runtime → commercial_founder / billing_founder, with a real Founder session
 * and 2FA), with the test invoice provider. „Gata când” (FAZA-3 §3.8):
 *   - the trial stops by itself at its term and the data stays;
 *   - a business on manual payment cannot buy with the card (Lot 3.5 `PurchaseRefused`, kept);
 *   - non-payment after the grace → read-only (the source `isReadOnly`; authorize(): N14).
 * Plus the decisions of 05.11.2026: N3 (one owner trial per application), N4 (the subscription's
 * trial: read-only at once without a payment ready), N7 (the offer precompleted from the
 * catalog), N8 (maintenance on the subscription's interval), N12 (Reg. Com. both forms).
 */

const FOUNDER_PASSPHRASE = 'Founder-lifecycle-passphrase-38'; // gitleaks:allow
const adminPool = new Pool({ connectionString: process.env.DIRECT_URL, max: 2 });
const appPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
let admin: PoolClient;
const q = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;
const founderId = randomUUID();
const RUN = randomUUID().slice(0, 6);
const APP = `l38s-${RUN}`;
const APP_TRIAL = `l38t-${RUN}`;
const provider = new TestInvoiceProvider('T38', (Date.now() % 1_000_000) * 100 + 50_000_000);
let versionId: string;
let founder: { headers: () => Headers };
const touched = new Set<string>();
const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

/** Fixtures past their term: the triggers would not let the runtime roles move time. */
async function asReplica(sql: string, params: unknown[]): Promise<void> {
  await admin.query('BEGIN');
  try {
    await admin.query(`SET LOCAL session_replication_role = replica`);
    await admin.query(sql, params);
    await admin.query('COMMIT');
  } catch (err) {
    await admin.query('ROLLBACK');
    throw err;
  }
}

// ── the Founder session (as lot36) ──────────────────────────────────────────────────────────

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
  const email = `founder-l38-${randomUUID()}@test.local`;
  await founderAuth.api.signUpEmail({
    body: { name: 'Founder 3.8', email, password: FOUNDER_PASSPHRASE },
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

// ── fixtures ────────────────────────────────────────────────────────────────────────────────

async function business(
  opts: { interval?: 'month' | 'year'; trialEndsAt?: Date } = {},
): Promise<{ org: string; ownerId: string; subscriptionId: string; owner: Owner }> {
  const org = randomUUID();
  const ownerId = randomUUID();
  touched.add(org);
  await q(
    `INSERT INTO organizations.organization (id, slug, name, created_via, updated_at)
     VALUES ($1, $2, $3, 'founder', now())`,
    [org, `l38-${org.slice(0, 12)}`, `Afacere ${org.slice(0, 4)}`],
  );
  await q(
    `INSERT INTO organizations.membership (organization_id, user_id, role, status, updated_at)
     VALUES ($1, $2, 'owner', 'active', now())`,
    [org, ownerId],
  );
  await q(
    `INSERT INTO commercial.billing_account (organization_id, currency, set_by_founder_id)
     VALUES ($1, 'RON', $2)`,
    [org, founderId],
  );
  const started = addDays(today(), -10);
  const [s] = await q(
    `INSERT INTO commercial.subscription
       (organization_id, plan_version_id, interval, currency, started_on, anchor_day, status,
        trial_ends_at, created_by_founder_id)
     VALUES ($1, $2, $3, 'RON', $4::date, EXTRACT(DAY FROM $4::date), $5, $6, $7) RETURNING id`,
    [
      org,
      versionId,
      opts.interval ?? 'month',
      started,
      opts.trialEndsAt ? 'trialing' : 'active',
      opts.trialEndsAt ?? null,
      founderId,
    ],
  );
  return {
    org,
    ownerId,
    subscriptionId: s!.id,
    owner: { organizationId: org, userId: ownerId, role: 'owner', actor: 'user' },
  };
}

type Owner = { organizationId: string; userId: string; role: string; actor: 'user' };

const founderParams = (org: string) => ({ founderHeaders: founder.headers(), organizationId: org });

const ROMANIAN_COMPANY = {
  entityType: 'company' as const,
  name: 'Salon Ana SRL',
  country: 'RO',
  taxId: 'RO14399840',
  regCom: 'J32/1234/2019',
  street: 'Str. Mihai Viteazu 12',
  city: 'Sibiu',
  county: 'Sibiu',
  email: 'facturi@salon-ana.test',
};

async function dispatchBilling() {
  return dispatchOutbox({
    pool: appPool,
    source: { schema: 'billing', moduleRole: 'billing_rw' },
    registry: new ConsumerRegistry().register(transferReceiptConsumer),
    limit: 200,
  });
}

beforeAll(async () => {
  admin = await adminPool.connect();
  setInvoiceProviderForTests(provider);
  for (const app of [APP, APP_TRIAL]) {
    await q(`INSERT INTO commercial.application (id, name) VALUES ($1, $1)`, [app]);
  }
  await q(
    `INSERT INTO commercial.application_price (application_id, currency, kind, amount_minor)
     VALUES ($1, 'RON', 'setup', 150000), ($1, 'RON', 'month', 9900), ($1, 'RON', 'year', 99000)`,
    [APP],
  );
  const [p] = await q(
    `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'Business', $2) RETURNING id`,
    [`l38e2-${RUN}`, founderId],
  );
  const [v] = await q(
    `INSERT INTO commercial.plan_version (plan_id, version_number, created_by_founder_id)
     VALUES ($1, 1, $2) RETURNING id`,
    [p!.id, founderId],
  );
  versionId = v!.id;
  await q(
    `INSERT INTO commercial.plan_version_price (plan_version_id, currency, kind, amount_minor)
     VALUES ($1, 'RON', 'month', 34900), ($1, 'RON', 'year', 349000)`,
    [versionId],
  );
  await q(
    `UPDATE commercial.plan_version SET published_at = now(), published_by_founder_id = $2 WHERE id = $1`,
    [versionId, founderId],
  );
  founder = await createFounder();
});

afterAll(async () => {
  // out of the 3.6 issuing job's way (it runs on every pending invoice of the database)
  await q(
    `UPDATE billing.invoice SET status = 'failed', failed_at = now(), claimed_until = NULL
      WHERE status = 'pending' AND organization_id = ANY($1::uuid[])`,
    [[...touched]],
  );
  setInvoiceProviderForTests(null);
  admin.release();
  await adminPool.end();
  await appPool.end();
  await closeBillingPools();
  await closeCommercialPools();
  await closeAuditPools();
});

// ── 1. the trial ────────────────────────────────────────────────────────────────────────────

describe('perioada de probă (D3-5, N3)', () => {
  it('owner-ul o pornește din Hub, o singură dată pe aplicație; ceilalți nu', async () => {
    const b = await business();
    const t = await startApplicationTrial(b.owner, APP_TRIAL);
    expect((t.endsAt.getTime() - t.startsAt.getTime()) / 86_400_000).toBe(14);
    await expect(startApplicationTrial(b.owner, APP_TRIAL)).rejects.toThrow(/trial_used|active/);
    await expect(startApplicationTrial({ ...b.owner, role: 'member' }, APP)).rejects.toMatchObject({
      name: 'Forbidden',
    });
    const [audit] = await q(
      `SELECT action FROM audit.audit_log WHERE organization_id = $1 AND action = 'commercial.trial_started'`,
      [b.org],
    );
    expect(audit).toBeTruthy();
  });

  it('job-ul: la termen se încheie (datele rămân), cu 3 zile înainte reamintește o dată', async () => {
    const b = await business();
    const t = await startApplicationTrial(b.owner, APP_TRIAL);
    await asReplica(
      `UPDATE commercial.trial SET ends_at = now() + interval '2 days' WHERE id = $1`,
      [t.id],
    );
    await runTrialJob();
    await runTrialJob();
    const events = await q(
      `SELECT payload FROM commercial.outbox_events WHERE type = 'commercial.trial.ending' AND resource_id = $1`,
      [t.id],
    );
    expect(events).toHaveLength(1);
    await asReplica(
      `UPDATE commercial.trial SET starts_at = now() - interval '14 days', ends_at = now() - interval '1 minute' WHERE id = $1`,
      [t.id],
    );
    await runTrialJob();
    const [row] = await q(`SELECT ended_at, end_reason FROM commercial.trial WHERE id = $1`, [
      t.id,
    ]);
    expect(row).toMatchObject({ end_reason: 'expired' });
    expect(row!.ended_at).not.toBeNull();
    // N3: not again, even after it ended
    await expect(startApplicationTrial(b.owner, APP_TRIAL)).rejects.toThrow(/trial_used/);
  });
});

// ── 2. the subscription's trial (N4) and non-payment (D3-12) ────────────────────────────────

describe('finalul probei pe tot abonamentul (N4) și neplata (D3-12)', () => {
  it('fără card și fără transfer → activ, dar doar citire de acum; pe transfer → activ, fără caz', async () => {
    const past = new Date(Date.now() - 60_000);
    const none = await business({ trialEndsAt: past });
    const manual = await business({ trialEndsAt: past });
    await setPaymentSettings({
      ...founderParams(manual.org),
      method: 'manual',
      paymentTermsDays: 14,
    });
    await runSubscriptionTrialJob();
    const status = async (id: string) =>
      (await q(`SELECT status FROM commercial.subscription WHERE id = $1`, [id]))[0]!.status;
    expect(await status(none.subscriptionId)).toBe('active');
    expect(await status(manual.subscriptionId)).toBe('active');
    expect(await isReadOnly(none.org)).toBe(true);
    expect((await getOpenDunning(none.org))!.cause).toBe('trial');
    expect(await getOpenDunning(manual.org)).toBeNull();
    // any payment ends the trial case
    expect(await resolveDunningPaid(none.org, 'in_test_first_payment')).toBe(true);
    expect(await isReadOnly(none.org)).toBe(false);
  });

  it('cazul de neplată: idempotent, 14 zile de grație puse de server, apoi doar citire; plata îl închide', async () => {
    const b = await business();
    const input = {
      organizationId: b.org,
      cause: 'card' as const,
      sourceRef: `in_${RUN}_1`,
      amountMinor: 34900,
      currency: 'RON' as const,
      overdueSince: new Date(),
    };
    const first = await openDunning(input);
    const again = await openDunning(input);
    expect(first.opened).toBe(true);
    expect(again).toEqual({ dunningId: first.dunningId, opened: false });
    const open = (await getOpenDunning(b.org))!;
    expect((open.graceEndsAt.getTime() - open.overdueSince.getTime()) / 86_400_000).toBe(14);
    await runDunningGraceJob();
    expect(await isReadOnly(b.org)).toBe(false);
    await asReplica(
      `UPDATE commercial.dunning SET overdue_since = now() - interval '15 days',
              grace_ends_at = now() - interval '1 day' WHERE id = $1`,
      [first.dunningId],
    );
    await runDunningGraceJob();
    expect(await isReadOnly(b.org)).toBe(true);
    const states = await q(
      `SELECT payload->>'state' AS state FROM commercial.outbox_events
        WHERE type = 'commercial.dunning.changed' AND resource_id = $1 ORDER BY occurred_at`,
      [first.dunningId],
    );
    expect(states.map((s) => s.state)).toEqual(['opened', 'read_only']);
    expect(await resolveDunningPaid(b.org, `in_${RUN}_1`)).toBe(true);
    expect(await isReadOnly(b.org)).toBe(false);
  });
});

// ── 3. the billing profile (D-3.6-1, N12) ───────────────────────────────────────────────────

describe('profilul de facturare', () => {
  it('echipa îl creează și îl schimbă cu motiv; owner-ul îl vede, membrul nu; factura îl folosește', async () => {
    const b = await business();
    expect(
      await saveBillingProfile({
        ...founderParams(b.org),
        profile: ROMANIAN_COMPANY,
        reason: null,
      }),
    ).toEqual({ created: true });
    await expect(
      saveBillingProfile({
        ...founderParams(b.org),
        profile: { ...ROMANIAN_COMPANY, city: 'Brașov' },
        reason: null,
      }),
    ).rejects.toMatchObject({ name: 'InvalidInput' });
    // N12: the single form of the registrations made since 2024
    await saveBillingProfile({
      ...founderParams(b.org),
      profile: { ...ROMANIAN_COMPANY, regCom: 'J2024012345320' },
      reason: 'Număr nou de la ONRC',
    });
    const seen = await getBillingProfile({
      organizationId: b.org,
      userId: b.ownerId,
      actor: 'user',
      role: 'owner',
    });
    expect(seen).toMatchObject({ taxId: 'RO14399840', regCom: 'J2024012345320' });
    await expect(
      getBillingProfile({
        organizationId: b.org,
        userId: b.ownerId,
        actor: 'user',
        role: 'member',
      }),
    ).rejects.toMatchObject({ name: 'Forbidden' });
    const [audit] = await q(
      `SELECT metadata FROM audit.audit_log
        WHERE organization_id = $1 AND action = 'billing.profile_saved' ORDER BY created_at DESC LIMIT 1`,
      [b.org],
    );
    expect(audit!.metadata).toMatchObject({
      created: false,
      changed: ['regCom'],
      reason: 'Număr nou de la ONRC',
    });
    expect(JSON.stringify(audit!.metadata)).not.toContain('14399840');
  });

  it('erorile au numele din formular: cifra de control, formatul, Reg. Com., e-mailul', async () => {
    const b = await business();
    const attempt = (profile: Partial<typeof ROMANIAN_COMPANY>) =>
      saveBillingProfile({
        ...founderParams(b.org),
        profile: { ...ROMANIAN_COMPANY, ...profile },
        reason: null,
      });
    await expect(attempt({ taxId: '14399841' })).rejects.toMatchObject({ errors: ['cuiControl'] });
    await expect(attempt({ taxId: '0123' })).rejects.toMatchObject({ errors: ['cuiFormat'] });
    await expect(attempt({ regCom: 'X/1/2' })).rejects.toBeInstanceOf(BillingProfileInvalid);
    await expect(attempt({ email: 'nu-e-email' })).rejects.toMatchObject({ errors: ['email'] });
    // a person: no CUI, no Reg. Com. (no CNP asked)
    await expect(
      saveBillingProfile({
        ...founderParams(b.org),
        profile: {
          ...ROMANIAN_COMPANY,
          entityType: 'person',
          name: 'Ana Pop',
          taxId: null,
          regCom: null,
        },
        reason: null,
      }),
    ).resolves.toEqual({ created: true });
  });
});

// ── 4. manual payment by transfer (D3-11) ───────────────────────────────────────────────────

describe('plata manuală prin transfer', () => {
  it('factura perioadei, o dată, cu scadența afacerii; emisă neîncasată, pe profil; încasarea o închide', async () => {
    const b = await business();
    await saveBillingProfile({ ...founderParams(b.org), profile: ROMANIAN_COMPANY, reason: null });
    await setPaymentSettings({ ...founderParams(b.org), method: 'manual', paymentTermsDays: 30 });
    await runTransferInvoiceJob();
    await runTransferInvoiceJob();
    const invoices = await q(
      `SELECT * FROM billing.invoice WHERE organization_id = $1 AND collection = 'transfer'`,
      [b.org],
    );
    expect(invoices).toHaveLength(1);
    const inv = invoices[0]!;
    expect(inv).toMatchObject({ status: 'pending', amount_minor: '34900' });
    const due = (
      await q(`SELECT due_on::text AS d FROM billing.invoice WHERE id = $1`, [inv.id])
    )[0]!.d;
    expect(due).toBe(addDays(today(), 30));
    expect(await issueInvoice(b.org, inv.id)).toBe('issued');
    const doc = provider.documents.at(-1)!.input as {
      paid: unknown;
      dueDate: string;
      buyer: { vatCode: string };
    };
    expect(doc.paid).toBeNull();
    expect(doc.dueDate).toBe(due);
    expect(doc.buyer.vatCode).toBe('RO14399840');
    await expect(
      confirmTransferReceipt({
        ...founderParams(b.org),
        invoiceId: inv.id,
        receivedOn: addDays(today(), 1),
      }),
    ).rejects.toMatchObject({ name: 'InvalidInput' });
    await confirmTransferReceipt({
      ...founderParams(b.org),
      invoiceId: inv.id,
      receivedOn: today(),
    });
    await expect(
      confirmTransferReceipt({ ...founderParams(b.org), invoiceId: inv.id, receivedOn: today() }),
    ).rejects.toThrow(/invoice_paid/);
    // N16: the receipt in SmartBill (here the test provider), through the outbox
    const before = provider.payments.length;
    await dispatchBilling();
    expect(provider.payments.length).toBe(before + 1);
    expect(provider.payments.at(-1)).toMatchObject({ amountMinor: 34900, date: today() });
    const listed = await listInvoicesForFounder(founderParams(b.org));
    expect(listed[0]).toMatchObject({ collection: 'transfer', paidOn: today(), status: 'issued' });
  });

  it('E6 (3.9a): factura de transfer emisă → „Factura {number} e emisă” cu scadența (invoice.transfer), o dată', async () => {
    const b = await business();
    await setPaymentSettings({ ...founderParams(b.org), method: 'manual', paymentTermsDays: 10 });
    await runTransferInvoiceJob();
    const [inv] = await q(
      `SELECT id, due_on::text AS due FROM billing.invoice WHERE organization_id = $1 AND collection = 'transfer'`,
      [b.org],
    );
    expect(await issueInvoice(b.org, inv!.id)).toBe('issued');
    const dispatchIssued = () =>
      dispatchOutbox({
        pool: appPool,
        source: { schema: 'billing', moduleRole: 'billing_rw' },
        registry: new ConsumerRegistry().register(billingInvoiceIssuedConsumer),
        limit: 200,
      });
    await dispatchIssued();
    await dispatchIssued();
    const notes = await q(
      `SELECT type, params FROM notifications.notification WHERE organization_id = $1 AND type LIKE 'billing.invoice.%'`,
      [b.org],
    );
    expect(notes).toHaveLength(1);
    const [issued] = await q(
      `SELECT series, number, emailed_at FROM billing.invoice WHERE id = $1`,
      [inv!.id],
    );
    expect(notes[0]).toMatchObject({
      type: 'billing.invoice.transfer',
      params: {
        number: `${issued!.series}-${issued!.number}`,
        amount: { type: 'money', amountMinor: 34900, currency: 'RON' },
        what: { type: 'key', key: 'billing.have.bundle', params: { name: 'Business' } },
        due: { type: 'date', date: inv!.due },
      },
    });
    expect(issued!.emailed_at).not.toBeNull();
  });

  it('E3 (3.9a): o aplicație pornită după factura perioadei → pe factura următoare, zilele ei ca linie separată', async () => {
    const b = await business();
    await setPaymentSettings({ ...founderParams(b.org), method: 'manual', paymentTermsDays: 14 });
    await runTransferInvoiceJob();
    // „Pornește aplicația” today, after this period's invoice (as goLiveSetup leaves the line)
    await q(
      `INSERT INTO commercial.subscription_application
         (organization_id, subscription_id, application_id, currency, interval, amount_minor,
          source, created_by_founder_id)
       VALUES ($1, $2, $3, 'RON', 'month', 9900, 'request', $4)`,
      [b.org, b.subscriptionId, APP, founderId],
    );
    const current = billingPeriod({ startedOn: addDays(today(), -10), interval: 'month' }, today());
    await runTransferInvoiceJob({ now: new Date(`${current.end}T09:00:00+02:00`) });
    const invoices = await q(
      `SELECT period_start::text AS ps, amount_minor, lines FROM billing.invoice
        WHERE organization_id = $1 AND collection = 'transfer' ORDER BY period_start`,
      [b.org],
    );
    expect(invoices.map((i) => i.ps)).toEqual([current.start, current.end]);
    const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
    const days = day(current.end) - day(today());
    const part = Math.round((9900 * days) / (day(current.end) - day(current.start)));
    const next = invoices[1]!;
    expect(next.lines).toEqual([
      expect.objectContaining({ code: 'VNT-SUB', unitMinor: 34900 }),
      expect.objectContaining({ code: 'VNT-APP', unitMinor: 9900 }),
      expect.objectContaining({
        code: 'VNT-APP',
        unitMinor: part,
        name: expect.stringContaining(`${days} zile din`),
      }),
    ]);
    expect(Number(next.amount_minor)).toBe(34900 + 9900 + part);
    // the first invoice had neither: the application was not there yet
    expect(Number(invoices[0]!.amount_minor)).toBe(34900);
  });

  it('după scadență: cazul de neplată de a doua zi; încasarea îl închide', async () => {
    const b = await business();
    await setPaymentSettings({ ...founderParams(b.org), method: 'manual', paymentTermsDays: 1 });
    await runTransferInvoiceJob();
    const [inv] = await q(
      `SELECT id FROM billing.invoice WHERE organization_id = $1 AND collection = 'transfer'`,
      [b.org],
    );
    expect(await issueInvoice(b.org, inv!.id)).toBe('issued');
    await asReplica(`UPDATE billing.invoice SET due_on = CURRENT_DATE - 3 WHERE id = $1`, [
      inv!.id,
    ]);
    await runTransferOverdueJob();
    const open = (await getOpenDunning(b.org))!;
    expect(open).toMatchObject({ cause: 'transfer', sourceRef: inv!.id, amountMinor: 34900 });
    await confirmTransferReceipt({
      ...founderParams(b.org),
      invoiceId: inv!.id,
      receivedOn: today(),
    });
    expect(await getOpenDunning(b.org)).toBeNull();
  });

  it('termenul: 1–90 de zile', async () => {
    const b = await business();
    await expect(
      setPaymentSettings({ ...founderParams(b.org), method: 'manual', paymentTermsDays: 91 }),
    ).rejects.toMatchObject({ name: 'InvalidInput' });
    await expect(
      setPaymentSettings({ ...founderParams(b.org), method: 'manual', paymentTermsDays: 0 }),
    ).rejects.toMatchObject({ name: 'InvalidInput' });
  });
});

// ── 5. the invoice not issued (D-3.6-5) ─────────────────────────────────────────────────────

describe('factura neemisă', () => {
  async function failedInvoice() {
    const b = await business();
    await setPaymentSettings({ ...founderParams(b.org), method: 'manual', paymentTermsDays: 14 });
    await runTransferInvoiceJob();
    const [inv] = await q(
      `SELECT id FROM billing.invoice WHERE organization_id = $1 AND collection = 'transfer'`,
      [b.org],
    );
    provider.failNext('rejected');
    expect(await issueInvoice(b.org, inv!.id)).toBe('failed');
    return { b, invoiceId: inv!.id as string };
  }

  it('„Reîncearcă” după corectarea datelor: emisă, cu datele noi', async () => {
    const { b, invoiceId } = await failedInvoice();
    await saveBillingProfile({ ...founderParams(b.org), profile: ROMANIAN_COMPANY, reason: null });
    expect(await retryInvoice({ ...founderParams(b.org), invoiceId })).toBe('issued');
    const doc = provider.documents.at(-1)!.input as { buyer: { name: string } };
    expect(doc.buyer.name).toBe('Salon Ana SRL');
  });

  it('„Am emis-o manual”: motiv de min. 10 caractere, fără serie și număr folosite', async () => {
    const one = await failedInvoice();
    const two = await failedInvoice();
    const base = { series: 'T38M', number: `${RUN}1`, issueDate: today() };
    await expect(
      markInvoiceManual({
        ...founderParams(one.b.org),
        invoiceId: one.invoiceId,
        ...base,
        reason: 'scurt',
      }),
    ).rejects.toMatchObject({ name: 'InvalidInput' });
    await markInvoiceManual({
      ...founderParams(one.b.org),
      invoiceId: one.invoiceId,
      ...base,
      reason: 'e-Factura a refuzat, emisă din SmartBill',
    });
    await expect(
      markInvoiceManual({
        ...founderParams(two.b.org),
        invoiceId: two.invoiceId,
        ...base,
        reason: 'e-Factura a refuzat, emisă din SmartBill',
      }),
    ).rejects.toThrow(/invoice_number_used/);
    const [row] = await q(`SELECT status, series, number FROM billing.invoice WHERE id = $1`, [
      one.invoiceId,
    ]);
    expect(row).toMatchObject({ status: 'manual', series: 'T38M' });
  });
});

// ── 6. the requests with implementation (S121, N7, N8) ──────────────────────────────────────

describe('cererile cu implementare', () => {
  it('pe transfer: cerută → ofertă (din catalog, pe anul abonamentului) → acceptată → confirmată → plătită → în lucru → pornită', async () => {
    const b = await business({ interval: 'year' });
    await setPaymentSettings({ ...founderParams(b.org), method: 'manual', paymentTermsDays: 14 });
    const { setupRequestId: id, created } = await requestSetup(b.owner, APP);
    expect(created).toBe(true);
    expect((await requestSetup(b.owner, APP)).created).toBe(false);
    const step = { ...founderParams(b.org), setupRequestId: id };
    const defaults = await getSetupOfferDefaults(step);
    expect(defaults).toEqual({ setupMinor: 150000, maintenanceMinor: 99000, interval: 'year' });
    const offered = await sendSetupOffer({
      ...step,
      offer: {
        setupMinor: 120000,
        maintenanceMinor: 99000,
        estimatedStartOn: addDays(today(), 7),
        note: null,
      },
    });
    expect(offered).toMatchObject({
      status: 'requested',
      setupMinor: 120000,
      maintenanceInterval: 'year',
    });
    await acceptSetupOffer(b.owner, id);
    await confirmSetup({ ...step, startOn: addDays(today(), 7) });
    const { invoiceId } = await createSetupTransferInvoice(step);
    expect(invoiceId).toBeTruthy();
    expect(await issueInvoice(b.org, invoiceId!)).toBe('issued');
    const doc = provider.documents.at(-1)!.input as {
      lines: Array<{ name: string; unitMinor: number }>;
    };
    expect(doc.lines).toEqual([
      expect.objectContaining({ name: `Implementare ${APP} · o singură dată`, unitMinor: 120000 }),
    ]);
    await confirmTransferReceipt({
      ...founderParams(b.org),
      invoiceId: invoiceId!,
      receivedOn: today(),
    });
    expect((await listSetupRequests(b.org))[0]).toMatchObject({
      status: 'paid',
      paymentMethod: 'transfer',
    });
    await startSetupWork(step);
    const live = await goLiveSetup(step);
    expect(live.status).toBe('live');
    const [line] = await q(
      `SELECT amount_minor, interval, source FROM commercial.subscription_application WHERE id = $1`,
      [live.lineId],
    );
    expect(line).toMatchObject({ amount_minor: '99000', interval: 'year', source: 'request' });
    const steps = await q(
      `SELECT action FROM audit.audit_log WHERE organization_id = $1 AND target_id = $2 ORDER BY created_at, id`,
      [b.org, id],
    );
    expect(steps.map((s) => s.action)).toEqual([
      'commercial.setup_requested',
      'commercial.setup_offer_sent',
      'commercial.setup_accepted',
      'commercial.setup_confirmed',
      'commercial.setup_paid',
      'commercial.setup_work_started',
      'commercial.setup_live',
    ]);
  });

  it('owner-ul refuză oferta; echipa rambursează transferul cu storno până la pornire', async () => {
    const b = await business();
    const first = await requestSetup(b.owner, APP);
    const step1 = { ...founderParams(b.org), setupRequestId: first.setupRequestId };
    await sendSetupOffer({
      ...step1,
      offer: { setupMinor: 150000, maintenanceMinor: 9900, estimatedStartOn: addDays(today(), 3) },
    });
    await cancelSetupByOwner(b.owner, first.setupRequestId, 'Nu acum');
    await setPaymentSettings({ ...founderParams(b.org), method: 'manual', paymentTermsDays: 14 });
    const second = await requestSetup(b.owner, APP);
    expect(second.created).toBe(true);
    const step = { ...founderParams(b.org), setupRequestId: second.setupRequestId };
    await sendSetupOffer({
      ...step,
      offer: { setupMinor: 150000, maintenanceMinor: 9900, estimatedStartOn: addDays(today(), 3) },
    });
    await acceptSetupOffer(b.owner, second.setupRequestId);
    await confirmSetup({ ...step, startOn: addDays(today(), 3) });
    const { invoiceId } = await createSetupTransferInvoice(step);
    await issueInvoice(b.org, invoiceId!);
    await confirmTransferReceipt({
      ...founderParams(b.org),
      invoiceId: invoiceId!,
      receivedOn: today(),
    });
    await startSetupWork(step);
    const refunded = await refundSetupRequest({
      ...step,
      reason: 'Clientul renunță înainte de pornire',
    });
    expect(refunded.status).toBe('refunded');
    const [storno] = await q(
      `SELECT kind, amount_minor FROM billing.invoice WHERE reverses_invoice_id = $1`,
      [invoiceId],
    );
    expect(storno).toMatchObject({ kind: 'storno', amount_minor: '150000' });
    // after the refund (closed), nothing more
    await expect(goLiveSetup(step)).rejects.toThrow();
  });
});
