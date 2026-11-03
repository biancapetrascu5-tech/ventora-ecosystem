import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { closeAuditPools } from '@ventora/audit';
import { founderAuth } from '@ventora/identity';
import {
  closeCommercialPools,
  getIncludedMembersForFounder,
  listAddonsForFounder,
  listApplicationsForFounder,
  listPlansForFounder,
  setApplicationPrices,
} from '../../index';
import {
  APPS,
  BUNDLES,
  PACKS,
  PricingConflict,
  bundleQuotas,
  seedPricing,
  yearly,
} from '../../../../../scripts/seed-pricing';

/*
 * D3-1 (PRETURI-2027.md): scripts/seed-pricing.ts on a clean base — every migration, the registry
 * synced from the real manifests, no prices yet (the CI step creates this base apart from the
 * other commercial tests, which set their own prices). Through the Founder contracts, with a real
 * Founder session: the prices, the limits, the bundles and the packs; a second run is a no-op; a
 * value set differently stops the script before it writes anything.
 */

const adminPool = new Pool({ connectionString: process.env.DIRECT_URL, max: 2 });
let admin: PoolClient;
const q = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;

// ── Founder session with 2FA (as in lot34.integration.test.ts) ─────────────────────────────

const FOUNDER_PASSPHRASE = 'Founder-test-passphrase-1';

async function totpFromBase32(base32Secret: string): Promise<string> {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of base32Secret.toUpperCase().replace(/=+$/, '')) {
    const v = alpha.indexOf(c);
    if (v >= 0) bits += v.toString(2).padStart(5, '0');
  }
  const raw = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < raw.length; i++) raw[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  const counterBuf = new Uint8Array(8);
  new DataView(counterBuf.buffer).setBigUint64(0, BigInt(Math.floor(Date.now() / 30_000)), false);
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-1' }, false, [
    'sign',
  ]);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, counterBuf));
  const offset = sig[sig.length - 1]! & 0x0f;
  const code =
    (((sig[offset]! & 0x7f) << 24) |
      ((sig[offset + 1]! & 0xff) << 16) |
      ((sig[offset + 2]! & 0xff) << 8) |
      (sig[offset + 3]! & 0xff)) %
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

let founderId: string;
let founderHeaders: () => Headers;

async function createFounder(): Promise<void> {
  const email = `founder-d31-${crypto.randomUUID()}@test.local`;
  await founderAuth.api.signUpEmail({
    body: { name: 'Founder D3-1', email, password: FOUNDER_PASSPHRASE },
  });
  const signIn = await founderAuth.api.signInEmail({
    body: { email, password: FOUNDER_PASSPHRASE },
    asResponse: true,
  });
  let cookie = sessionCookieFrom(signIn);
  const [row] = await q(`SELECT id FROM founder_identity.users WHERE email = $1`, [email]);
  founderId = row!.id;
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
  founderHeaders = () => new Headers({ cookie });
}

const auditRows = async () =>
  Number(
    (
      await q(
        `SELECT count(*)::int AS n FROM audit.audit_log WHERE founder_id = $1 AND category = 'commercial'`,
        [founderId],
      )
    )[0]!.n,
  );
const h = () => ({ founderHeaders: founderHeaders() });

beforeAll(async () => {
  admin = await adminPool.connect();
  // a clean base: the real registry, nothing priced yet
  const [registry] = await q(
    `SELECT (SELECT count(*)::int FROM commercial.application WHERE NOT is_platform) AS apps,
            (SELECT count(*)::int FROM commercial.application_price) AS prices,
            (SELECT count(*)::int FROM commercial.plan) AS plans,
            (SELECT count(*)::int FROM commercial.addon) AS addons`,
  );
  expect(registry).toMatchObject({ prices: 0, plans: 0, addons: 0 });
  expect(registry!.apps).toBeGreaterThanOrEqual(13);
  for (const key of [
    'booking.appointments',
    'documents.storage',
    'events.active',
    'marketing.campaigns',
    'messaging.email',
    'ai.analyses',
    'platform.members',
    'platform.locations',
    'messaging.sms',
  ]) {
    expect((await q(`SELECT 1 FROM commercial.quota_key WHERE key = $1`, [key])).length, key).toBe(
      1,
    );
  }
  await createFounder();
});

afterAll(async () => {
  admin?.release();
  await adminPool.end();
  await closeCommercialPools();
  await closeAuditPools();
});

describe('D3-1 — scripts/seed-pricing.ts, through the Founder contracts', () => {
  it('the check mode plans everything and writes nothing', async () => {
    const before = await auditRows();
    const report = await seedPricing(founderHeaders, { apply: false });
    expect(report.applied).toBe(false);
    expect(report.conflicts).toEqual([]);
    expect(report.missingApplications).toEqual([]);
    expect(report.includedMembers).toBe(3);
    expect(report.steps.length).toBeGreaterThan(0);
    expect(await auditRows()).toBe(before);
    expect((await q(`SELECT count(*)::int AS n FROM commercial.application_price`))[0]!.n).toBe(0);
  });

  it('apply: the 13 applications — prices in lei and euro, yearly = 12 × monthly × 0.85, „La cerere”, limits', async () => {
    const report = await seedPricing(founderHeaders, { apply: true });
    expect(report.applied).toBe(true);
    const apps = new Map((await listApplicationsForFounder(h())).map((a) => [a.id, a]));
    const easyBook = apps.get('booking')!;
    const price = (id: string, currency: string, kind: string) =>
      apps.get(id)!.prices.find((p) => p.currency === currency && p.kind === kind)?.amountMinor;
    // EasyBook, as in the list: 195 lei / 39 € a month, 495 lei / 99 € setup
    expect(price('booking', 'RON', 'month')).toBe(19500);
    expect(price('booking', 'EUR', 'month')).toBe(3900);
    expect(price('booking', 'RON', 'year')).toBe(198900); // 12 × 195 × 0.85 = 1.989
    expect(price('booking', 'EUR', 'year')).toBe(39800); // 397,8 → 398
    expect(price('booking', 'RON', 'setup')).toBe(49500);
    expect(price('booking', 'EUR', 'setup')).toBe(9900);
    expect(easyBook.quotas).toEqual({ 'booking.appointments': 1000 });
    expect(price('hr', 'RON', 'setup')).toBe(74500);
    for (const want of APPS) {
      const app = apps.get(want.id)!;
      expect(app.name).toBe(want.name);
      expect(app.activationMode).toBe('on_request');
      expect(app.prices).toHaveLength(6);
      expect(app.quotas).toEqual(want.quotas);
      const month = app.prices.find((p) => p.currency === 'RON' && p.kind === 'month')!.amountMinor;
      expect(price(want.id, 'RON', 'year')).toBe(yearly(month / 100) * 100);
    }
    expect(apps.get('documents')!.quotas).toEqual({ 'documents.storage': 20 });
    expect(apps.get('events')!.quotas).toEqual({ 'events.active': 20 });
    expect(apps.get('marketing')!.quotas).toEqual({
      'marketing.campaigns': 20,
      'messaging.email': 2000,
    });
    expect(apps.get('analytics')!.quotas).toEqual({ 'ai.analyses': 20 });
    expect(apps.get('crm')!.quotas).toEqual({});
    // Portal and Network are outside the list
    expect(apps.get('portal')?.prices ?? []).toEqual([]);
    expect(apps.get('network')?.prices ?? []).toEqual([]);
  });

  it('the bundles: one published version each, open sale period, applications, prices, extra seats', async () => {
    const plans = await listPlansForFounder(h());
    expect(plans.map((p) => p.code).sort()).toEqual([
      'complet',
      'echipa',
      'operatiuni',
      'programari',
    ]);
    for (const want of BUNDLES) {
      const plan = plans.find((p) => p.code === want.code)!;
      expect(plan.name).toBe(want.name);
      expect(plan.salesStoppedAt).toBeNull();
      expect(plan.versions).toHaveLength(1);
      const v = plan.versions[0]!;
      expect(v.publishedAt).not.toBeNull();
      expect(v.current).toBe(true);
      expect(v.availableFrom).toBeNull();
      expect(v.availableUntil).toBeNull();
      expect([...v.terms.applications].sort()).toEqual([...want.applications].sort());
      expect(v.terms.quotas).toEqual(bundleQuotas(want));
      expect(v.terms.quotas['platform.members']).toBe(want.extraSeats);
    }
    const programari = plans.find((p) => p.code === 'programari')!.versions[0]!.terms;
    const amount = (currency: string, kind: string) =>
      programari.prices.find((p) => p.currency === currency && p.kind === kind)!.amountMinor;
    expect([amount('RON', 'month'), amount('EUR', 'month')]).toEqual([36900, 7400]);
    expect([amount('RON', 'year'), amount('EUR', 'year')]).toEqual([376400, 75500]);
    expect([amount('RON', 'setup'), amount('EUR', 'setup')]).toEqual([89000, 17800]);
    expect(programari.quotas).toEqual({
      'platform.members': 2,
      'platform.locations': 1,
      'booking.appointments': 1000,
    });
    const complet = plans.find((p) => p.code === 'complet')!.versions[0]!.terms;
    expect(complet.applications).toHaveLength(13);
    expect(
      complet.prices.find((p) => p.currency === 'RON' && p.kind === 'setup')!.amountMinor,
    ).toBe(534000);
  });

  it('the packs; no „Funnel realizat de echipă” (not expressible); included_members stays 3', async () => {
    const addons = await listAddonsForFounder(h());
    expect(addons.map((a) => a.code).sort()).toEqual(PACKS.map((p) => p.code).sort());
    for (const want of PACKS) {
      const a = addons.find((x) => x.code === want.code)!;
      expect(a).toMatchObject({
        name: want.name,
        quotaKey: want.quotaKey,
        quantity: want.quantity,
        validity: want.validity,
        purchaseMode: 'on_request',
        salesStoppedAt: null,
      });
      expect(a.prices.map((p) => [p.currency, p.amountMinor, p.setupMinor]).sort()).toEqual(
        [
          ['EUR', want.eur * 100, 0],
          ['RON', want.ron * 100, 0],
        ].sort(),
      );
    }
    expect(addons.find((a) => a.code === 'sms-500')!.validity).toBe('current_month');
    expect(addons.some((a) => /funnel/i.test(a.code + a.name))).toBe(false);
    expect(await getIncludedMembersForFounder(h())).toBe(3);
  });

  it('every change has its audit row on the Founder', async () => {
    const actions = (
      await q(
        `SELECT action, count(*)::int AS n FROM audit.audit_log
          WHERE founder_id = $1 AND category = 'commercial' GROUP BY action ORDER BY action`,
        [founderId],
      )
    ).map((r) => [r.action, r.n]);
    expect(Object.fromEntries(actions)).toMatchObject({
      'commercial.application_prices_set': 13,
      'commercial.addon_created': PACKS.length,
      'commercial.plan_created': 4,
      'commercial.version_published': 4,
    });
  });

  it('a second run is a no-op: nothing planned, nothing written', async () => {
    const before = await auditRows();
    const report = await seedPricing(founderHeaders, { apply: true });
    expect(report.steps).toEqual([]);
    expect(report.conflicts).toEqual([]);
    expect(report.unchanged.length).toBeGreaterThan(0);
    expect(await auditRows()).toBe(before);
  });

  it('a value already set differently stops the script before it writes anything', async () => {
    await setApplicationPrices({
      ...h(),
      applicationId: 'crm',
      prices: [{ currency: 'RON', kind: 'month', amountMinor: 1 }],
    });
    const before = await auditRows();
    const error = await seedPricing(founderHeaders, { apply: true }).catch((e) => e);
    expect(error).toBeInstanceOf(PricingConflict);
    expect((error as PricingConflict).report.conflicts).toEqual([
      'ClientDesk: are deja alte prețuri',
    ]);
    expect(await auditRows()).toBe(before);
    const crm = (await listApplicationsForFounder(h())).find((a) => a.id === 'crm')!;
    expect(crm.prices).toEqual([{ currency: 'RON', kind: 'month', amountMinor: 1 }]);
  });
});
