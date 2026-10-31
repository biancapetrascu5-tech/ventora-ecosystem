import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import type { ApplicationManifest } from '@ventora/contracts';
import { Conflict, FeatureNotIncluded, InvalidInput, UnknownCommercialKey } from '@ventora/errors';
import { closeAuditPools } from '@ventora/audit';
import { founderAuth } from '@ventora/identity';
import {
  APPLICATIONS,
  addApplicationToSubscription,
  assignSubscription,
  createDiscount,
  endApplicationLine,
  endDiscount,
  firstDiscountedInvoice,
  listForeverDiscounts,
  setApplicationPrices,
  startOfDay,
  updateDiscount,
  closeCommercialPools,
  commercialEntitlementProvider,
  createAddon,
  createOverride,
  createPlan,
  createPlanVersion,
  endOverride,
  extendOverride,
  getEffectiveEntitlements,
  getSubscriptionSummary,
  grantAddon,
  listAddonsForOrg,
  publishVersion,
  requireFeature,
  scheduleVersionChange,
  setApplicationActivationMode,
  setBusinessCurrency,
  stopAddonSales,
  syncRegistry,
  updateDraftVersion,
  type VersionTermsInput,
} from '../index';

// Lot 3.2 — „Gata când” and the decisions of 31.10.2026 that enter the model: currency per
// business (D3-2), monthly / yearly prices and the anchor day (D3-3), the „direct / la cerere”
// switches (D3-7, D3-9), monthly add-ons as recurring lines (D3-7), trials (D3-5), exceptions with
// a required end date ≤ 12 months (D-COM-8), the 30-day notice (D-COM-9), audit on every write.
// Founder on founder_runtime (DATABASE_URL_FOUNDER), reads on app_runtime (DATABASE_URL).

const adminPool = new Pool({ connectionString: process.env.DIRECT_URL, max: 2 });
let admin: PoolClient;
const q = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;
const newUuid = () => crypto.randomUUID();
const DAY = 86_400_000;

// ── Founder session with 2FA (as in core/access lot28) ──────────────────────────────────────

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
  const email = `founder-l32-${newUuid()}@test.local`;
  await founderAuth.api.signUpEmail({
    body: { name: 'Founder 3.2', email, password: FOUNDER_PASSPHRASE },
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

// ── Registry fixture (test manifests, not the real ones) ────────────────────────────────────

const stock = (key: string, unit: string) =>
  ({ key, kind: 'stock', unit, period: null, overflow: 'block', refundable: false }) as const;
const flow = (key: string, unit: string, refundable = false) =>
  ({ key, kind: 'flow', unit, period: 'month', overflow: 'block', refundable }) as const;

const MANIFESTS: ApplicationManifest[] = [
  {
    applicationId: 'platform',
    permissions: [],
    defaultGrants: {},
    quotas: [stock('platform.members', 'member'), flow('messaging.sms', 'sms')],
  },
  {
    applicationId: 'booking',
    permissions: [],
    defaultGrants: {},
    features: [{ key: 'booking.sms.ownNumber' }],
    quotas: [flow('booking.appointments', 'appointment', true)],
  },
];

const TERMS: VersionTermsInput = {
  applications: ['booking'],
  features: ['booking.sms.ownNumber'],
  quotas: { 'platform.members': 10, 'messaging.sms': 500, 'booking.appointments': null },
  prices: [
    { currency: 'RON', kind: 'month', amountMinor: 34900 },
    { currency: 'RON', kind: 'year', amountMinor: 349000 },
  ],
};

async function auditCount(action: string, targetId?: string): Promise<number> {
  const rows = await q(
    `SELECT count(*)::int AS n FROM audit.audit_log
      WHERE action = $1 AND founder_id = $2 AND ($3::text IS NULL OR target_id = $3)`,
    [action, founderId, targetId ?? null],
  );
  return rows[0]!.n;
}

let planSeq = 0;
/** A published plan version; returns its plan and version ids. */
async function publishedVersion(
  terms: VersionTermsInput = TERMS,
): Promise<{ planId: string; versionId: string }> {
  planSeq += 1;
  const { planId } = await createPlan({
    founderHeaders: founderHeaders(),
    code: `l32-${planSeq}-${newUuid().slice(0, 6)}`,
    name: 'Business',
  });
  const { versionId } = await createPlanVersion({ founderHeaders: founderHeaders(), planId });
  await updateDraftVersion({ founderHeaders: founderHeaders(), versionId, terms });
  await publishVersion({ founderHeaders: founderHeaders(), versionId });
  return { planId, versionId };
}

async function nextVersion(planId: string, terms: VersionTermsInput): Promise<string> {
  const { versionId } = await createPlanVersion({ founderHeaders: founderHeaders(), planId });
  await updateDraftVersion({ founderHeaders: founderHeaders(), versionId, terms });
  await publishVersion({ founderHeaders: founderHeaders(), versionId });
  return versionId;
}

beforeAll(async () => {
  admin = await adminPool.connect();
  await admin.query(
    'TRUNCATE commercial.quota_key, commercial.feature_key, commercial.application CASCADE',
  );
  await syncRegistry(admin, APPLICATIONS, MANIFESTS);
  await createFounder();
});

afterAll(async () => {
  admin.release();
  await adminPool.end();
  await closeCommercialPools();
  await closeAuditPools();
});

// ── Plans and versions ─────────────────────────────────────────────────────────────────────

describe('Lot 3.2 — plans and versions', () => {
  it('create → draft terms → publish, each write with its audit row', async () => {
    const { planId, versionId } = await publishedVersion();
    expect(await auditCount('commercial.plan_created', planId)).toBe(1);
    expect(await auditCount('commercial.version_created', versionId)).toBe(1);
    expect(await auditCount('commercial.version_updated', versionId)).toBe(1);
    expect(await auditCount('commercial.version_published', versionId)).toBe(1);
    const [v] = await q(
      `SELECT version_number, published_by_founder_id FROM commercial.plan_version WHERE id = $1`,
      [versionId],
    );
    expect(v).toMatchObject({ version_number: 1, published_by_founder_id: founderId });
    const second = await createPlanVersion({
      founderHeaders: founderHeaders(),
      planId,
      copyFromVersionId: versionId,
    });
    expect(second.versionNumber).toBe(2);
    const copied = await q(
      `SELECT quota_key, limit_value FROM commercial.plan_version_quota WHERE plan_version_id = $1 ORDER BY 1`,
      [second.versionId],
    );
    expect(copied).toEqual([
      { quota_key: 'booking.appointments', limit_value: null },
      { quota_key: 'messaging.sms', limit_value: '500' },
      { quota_key: 'platform.members', limit_value: '10' },
    ]);
  });

  it('a published version cannot be modified — by the contract, nor by SQL (trigger)', async () => {
    const { versionId } = await publishedVersion();
    await expect(
      updateDraftVersion({ founderHeaders: founderHeaders(), versionId, terms: TERMS }),
    ).rejects.toThrow(Conflict);
    // the trigger refuses even the postgres role
    await expect(
      q(`UPDATE commercial.plan_version SET version_number = 9 WHERE id = $1`, [versionId]),
    ).rejects.toThrow(/published and cannot be changed/);
    await expect(
      q(`UPDATE commercial.plan_version_quota SET limit_value = 1 WHERE plan_version_id = $1`, [
        versionId,
      ]),
    ).rejects.toThrow(/published and cannot be changed/);
    await expect(
      q(
        `INSERT INTO commercial.plan_version_application (plan_version_id, application_id) VALUES ($1, 'crm')`,
        [versionId],
      ),
    ).rejects.toThrow(/published and cannot be changed/);
    await expect(
      q(`DELETE FROM commercial.plan_version_price WHERE plan_version_id = $1`, [versionId]),
    ).rejects.toThrow(/published and cannot be changed/);
    await expect(
      q(`DELETE FROM commercial.plan_version WHERE id = $1`, [versionId]),
    ).rejects.toThrow(/published and cannot be changed/);
  });

  it('a draft with a key that no manifest declares is refused; the foreign keys hold too', async () => {
    const { planId } = await createPlan({
      founderHeaders: founderHeaders(),
      code: `l32-keys-${newUuid().slice(0, 6)}`,
      name: 'Keys',
    });
    const { versionId } = await createPlanVersion({ founderHeaders: founderHeaders(), planId });
    await expect(
      updateDraftVersion({
        founderHeaders: founderHeaders(),
        versionId,
        terms: { ...TERMS, quotas: { ...TERMS.quotas, 'crm.contacts': 100 } },
      }),
    ).rejects.toThrow(UnknownCommercialKey);
    await expect(
      updateDraftVersion({
        founderHeaders: founderHeaders(),
        versionId,
        terms: { ...TERMS, applications: ['platform'] },
      }),
    ).rejects.toThrow(InvalidInput);
    await expect(
      q(
        `INSERT INTO commercial.plan_version_quota (plan_version_id, quota_key, limit_value) VALUES ($1, 'crm.contacts', 1)`,
        [versionId],
      ),
    ).rejects.toThrow(/plan_version_quota_quota_key_fkey/);
    await expect(
      q(
        `INSERT INTO commercial.plan_version_feature (plan_version_id, feature_key) VALUES ($1, 'booking.magic')`,
        [versionId],
      ),
    ).rejects.toThrow(/plan_version_feature_feature_key_fkey/);
  });

  it('publishing needs a monthly price', async () => {
    const { planId } = await createPlan({
      founderHeaders: founderHeaders(),
      code: `l32-noprice-${newUuid().slice(0, 6)}`,
      name: 'No price',
    });
    const { versionId } = await createPlanVersion({ founderHeaders: founderHeaders(), planId });
    await updateDraftVersion({
      founderHeaders: founderHeaders(),
      versionId,
      terms: { ...TERMS, prices: [{ currency: 'RON', kind: 'year', amountMinor: 100 }] },
    });
    await expect(publishVersion({ founderHeaders: founderHeaders(), versionId })).rejects.toThrow(
      InvalidInput,
    );
  });

  it('D3-9: the „direct / la cerere” switch on an application; the registry sync keeps it', async () => {
    const [before] = await q(`SELECT activation_mode FROM commercial.application WHERE id = 'crm'`);
    expect(before!.activation_mode).toBe('on_request');
    await setApplicationActivationMode({
      founderHeaders: founderHeaders(),
      applicationId: 'crm',
      mode: 'direct',
    });
    await syncRegistry(admin, APPLICATIONS, MANIFESTS);
    const [after] = await q(`SELECT activation_mode FROM commercial.application WHERE id = 'crm'`);
    expect(after!.activation_mode).toBe('direct');
    expect(await auditCount('commercial.application_mode_changed', 'crm')).toBe(1);
    await expect(
      setApplicationActivationMode({
        founderHeaders: founderHeaders(),
        applicationId: 'platform',
        mode: 'direct',
      }),
    ).rejects.toThrow();
  });

  it('a request without a Founder session with 2FA is refused before any write', async () => {
    await expect(
      createPlan({ founderHeaders: new Headers(), code: 'l32-nobody', name: 'x' }),
    ).rejects.toThrow();
    expect(await q(`SELECT 1 FROM commercial.plan WHERE code = 'l32-nobody'`)).toEqual([]);
  });
});

// ── Currency, subscription, anchor day ─────────────────────────────────────────────────────

describe('Lot 3.2 — the business currency and the subscription (D3-2, D3-3)', () => {
  it('a version without a price in the business currency cannot be assigned to it', async () => {
    const { versionId } = await publishedVersion(); // RON only
    const org = newUuid();
    await setBusinessCurrency({
      founderHeaders: founderHeaders(),
      organizationId: org,
      currency: 'EUR',
    });
    await expect(
      assignSubscription({
        founderHeaders: founderHeaders(),
        organizationId: org,
        versionId,
        interval: 'month',
      }),
    ).rejects.toThrow(/no month price in EUR/);
    // with a EUR price (entered separately, no conversion) it can
    const { versionId: withEur } = await publishedVersion({
      ...TERMS,
      prices: [...TERMS.prices, { currency: 'EUR', kind: 'month', amountMinor: 7000 }],
    });
    await assignSubscription({
      founderHeaders: founderHeaders(),
      organizationId: org,
      versionId: withEur,
      interval: 'month',
    });
    const summary = await getSubscriptionSummary(org);
    expect(summary).toMatchObject({ currency: 'EUR', interval: 'month', priceMinor: 7000 });
    // a yearly subscription needs the yearly price of that currency
    const org2 = newUuid();
    await setBusinessCurrency({
      founderHeaders: founderHeaders(),
      organizationId: org2,
      currency: 'EUR',
    });
    await expect(
      assignSubscription({
        founderHeaders: founderHeaders(),
        organizationId: org2,
        versionId: withEur,
        interval: 'year',
      }),
    ).rejects.toThrow(/no year price in EUR/);
  });

  it('the currency cannot change under a live subscription in the other currency', async () => {
    const { versionId } = await publishedVersion();
    const org = newUuid();
    await assignSubscription({
      founderHeaders: founderHeaders(),
      organizationId: org,
      versionId,
      interval: 'month',
    });
    await expect(
      setBusinessCurrency({
        founderHeaders: founderHeaders(),
        organizationId: org,
        currency: 'EUR',
      }),
    ).rejects.toThrow(Conflict);
    expect(await auditCount('commercial.subscription_assigned')).toBeGreaterThan(0);
  });

  it('started on the 31st: anchor day 31, billed on 30 April and on 28/29 February', async () => {
    const { versionId } = await publishedVersion();
    const org = newUuid();
    await assignSubscription({
      founderHeaders: founderHeaders(),
      organizationId: org,
      versionId,
      interval: 'month',
      startedOn: '2027-01-31',
    });
    const [sub] = await q(
      `SELECT anchor_day, started_on::text AS started_on FROM commercial.subscription WHERE organization_id = $1`,
      [org],
    );
    expect(sub).toEqual({ anchor_day: 31, started_on: '2027-01-31' });
    const april = await getSubscriptionSummary(org, new Date('2027-04-10T10:00:00Z'));
    expect(april!.nextBillingDate).toBe('2027-04-30');
    expect(april!.quotaPeriod).toEqual({ start: '2027-03-31', end: '2027-04-30' });
    const feb = await getSubscriptionSummary(org, new Date('2027-02-10T10:00:00Z'));
    expect(feb!.nextBillingDate).toBe('2027-02-28');
    // the database holds the anchor day to the start day
    await expect(
      q(`UPDATE commercial.subscription SET anchor_day = 28 WHERE organization_id = $1`, [org]),
    ).rejects.toThrow(/subscription_anchor_day/);
  });

  it('one live subscription per business', async () => {
    const { versionId } = await publishedVersion();
    const org = newUuid();
    await assignSubscription({
      founderHeaders: founderHeaders(),
      organizationId: org,
      versionId,
      interval: 'month',
    });
    await expect(
      assignSubscription({
        founderHeaders: founderHeaders(),
        organizationId: org,
        versionId,
        interval: 'year',
      }),
    ).rejects.toThrow(Conflict);
  });
});

// ── Effective entitlements ─────────────────────────────────────────────────────────────────

describe('Lot 3.2 — getEffectiveEntitlements', () => {
  it('without a subscription: no application, every quota 0', async () => {
    const e = await getEffectiveEntitlements(newUuid());
    expect(e.subscription).toBeNull();
    expect(e.applications).toEqual([]);
    expect(e.quotas).toEqual({
      'booking.appointments': 0,
      'messaging.sms': 0,
      'platform.members': 0,
    });
    expect(await commercialEntitlementProvider.isEnabled(e.organizationId, 'booking')).toBe(false);
  });

  it('the version: applications, features, limits, null = unlimited', async () => {
    const { versionId } = await publishedVersion();
    const org = newUuid();
    await assignSubscription({
      founderHeaders: founderHeaders(),
      organizationId: org,
      versionId,
      interval: 'month',
    });
    const e = await getEffectiveEntitlements(org);
    expect(e.applications).toEqual(['booking']);
    expect(e.features).toEqual(['booking.sms.ownNumber']);
    expect(e.quotas).toEqual({
      'booking.appointments': null,
      'messaging.sms': 500,
      'platform.members': 10,
    });
    expect(await commercialEntitlementProvider.isEnabled(org, 'booking')).toBe(true);
    expect(await commercialEntitlementProvider.isEnabled(org, 'crm')).toBe(false);
    await expect(
      requireFeature({ organizationId: org }, 'booking.sms.ownNumber'),
    ).resolves.toBeUndefined();
    // the Hub shows only the limited quotas
    expect((await getSubscriptionSummary(org))!.quotas).toEqual([
      { key: 'messaging.sms', limit: 500 },
      { key: 'platform.members', limit: 10 },
    ]);
  });

  it('a limit changed from Founder shows at the next request, without a deploy', async () => {
    const { versionId } = await publishedVersion();
    const org = newUuid();
    await assignSubscription({
      founderHeaders: founderHeaders(),
      organizationId: org,
      versionId,
      interval: 'month',
    });
    expect((await getEffectiveEntitlements(org)).quotas['messaging.sms']).toBe(500);
    const { overrideId } = await createOverride({
      founderHeaders: founderHeaders(),
      organizationId: org,
      kind: 'quota',
      quotaKey: 'messaging.sms',
      limit: 2000,
      reason: 'Campanie de lansare',
      expiresAt: new Date(Date.now() + 30 * DAY),
    });
    expect((await getEffectiveEntitlements(org)).quotas['messaging.sms']).toBe(2000);
    await endOverride({ founderHeaders: founderHeaders(), organizationId: org, overrideId });
    expect((await getEffectiveEntitlements(org)).quotas['messaging.sms']).toBe(500);
    // the exception stays in the history
    const [row] = await q(
      `SELECT ended_at, ended_by_founder_id FROM commercial.override WHERE id = $1`,
      [overrideId],
    );
    expect(row!.ended_by_founder_id).toBe(founderId);
    expect(await auditCount('commercial.override_created', overrideId)).toBe(1);
    expect(await auditCount('commercial.override_ended', overrideId)).toBe(1);
  });

  it('add-ons add capacity: monthly = recurring line of the subscription, current month = until the reset (D3-7)', async () => {
    const { planId, versionId } = await publishedVersion();
    const org = newUuid();
    await assignSubscription({
      founderHeaders: founderHeaders(),
      organizationId: org,
      versionId,
      interval: 'month',
    });
    const monthly = await createAddon({
      founderHeaders: founderHeaders(),
      code: `seats-${newUuid().slice(0, 6)}`,
      name: '5 locuri în plus',
      quotaKey: 'platform.members',
      quantity: 5,
      validity: 'monthly',
      purchaseMode: 'direct',
      prices: [{ currency: 'RON', amountMinor: 6000 }],
      eligiblePlanIds: [planId],
    });
    const once = await createAddon({
      founderHeaders: founderHeaders(),
      code: `sms-${newUuid().slice(0, 6)}`,
      name: '500 SMS',
      quotaKey: 'messaging.sms',
      quantity: 500,
      validity: 'current_month',
      purchaseMode: 'on_request',
      prices: [
        { currency: 'RON', amountMinor: 4900 },
        { currency: 'EUR', amountMinor: 1000 },
      ],
      eligiblePlanIds: [planId],
    });
    const g1 = await grantAddon({
      founderHeaders: founderHeaders(),
      organizationId: org,
      addonId: monthly.addonId,
    });
    await grantAddon({
      founderHeaders: founderHeaders(),
      organizationId: org,
      addonId: once.addonId,
      packs: 2,
    });
    const e = await getEffectiveEntitlements(org);
    expect(e.quotas['platform.members']).toBe(15);
    expect(e.quotas['messaging.sms']).toBe(1500);
    const [line] = await q(
      `SELECT recurring, subscription_id, ends_at FROM commercial.addon_grant WHERE id = $1`,
      [g1.grantId],
    );
    expect(line).toMatchObject({ recurring: true, ends_at: null });
    expect(line!.subscription_id).toBeTruthy();
    const [one] = await q(
      `SELECT recurring, ends_at FROM commercial.addon_grant WHERE organization_id = $1 AND NOT recurring`,
      [org],
    );
    expect(one!.ends_at).toBeInstanceOf(Date);
    // after the reset the current-month add-on is gone, the monthly line stays
    const later = await getEffectiveEntitlements(
      org,
      new Date((one!.ends_at as Date).getTime() + 1000),
    );
    expect(later.quotas['messaging.sms']).toBe(500);
    expect(later.quotas['platform.members']).toBe(15);
    // offered: on sale, eligible, in the business currency, with its own switch
    const offers = await listAddonsForOrg(org);
    expect(offers.map((o) => [o.quotaKey, o.purchaseMode, o.currency, o.priceMinor])).toEqual([
      ['messaging.sms', 'on_request', 'RON', 4900],
      ['platform.members', 'direct', 'RON', 6000],
    ]);
    await stopAddonSales({ founderHeaders: founderHeaders(), addonId: once.addonId });
    expect((await listAddonsForOrg(org)).map((o) => o.quotaKey)).toEqual(['platform.members']);
    expect(await auditCount('commercial.addon_granted')).toBeGreaterThanOrEqual(2);
    expect(await auditCount('commercial.addon_sales_stopped', once.addonId)).toBe(1);
  });

  it('trials (D3-5): an application for 14 days; the whole subscription only from Founder', async () => {
    const { versionId } = await publishedVersion();
    const org = newUuid();
    await assignSubscription({
      founderHeaders: founderHeaders(),
      organizationId: org,
      versionId,
      interval: 'month',
    });
    await q(
      `INSERT INTO commercial.trial (organization_id, kind, application_id, source, started_by, ends_at)
       VALUES ($1, 'application', 'crm', 'owner', $2, now() + interval '14 days')`,
      [org, newUuid()],
    );
    expect((await getEffectiveEntitlements(org)).applications).toEqual(['booking', 'crm']);
    expect(
      (await getEffectiveEntitlements(org, new Date(Date.now() + 15 * DAY))).applications,
    ).toEqual(['booking']);

    const trialOrg = newUuid();
    await assignSubscription({
      founderHeaders: founderHeaders(),
      organizationId: trialOrg,
      versionId,
      interval: 'month',
      trialEndsAt: new Date(Date.now() + 14 * DAY),
    });
    const during = await getEffectiveEntitlements(trialOrg);
    expect(during.subscription!.status).toBe('trialing');
    expect(during.applications).toEqual(['booking']);
    const after = await getEffectiveEntitlements(trialOrg, new Date(Date.now() + 15 * DAY));
    expect(after.applications).toEqual([]);
  });

  it('requireFeature: a feature outside the effective plan is refused; an exception turns it on', async () => {
    const { versionId } = await publishedVersion({ ...TERMS, features: [] });
    const org = newUuid();
    await assignSubscription({
      founderHeaders: founderHeaders(),
      organizationId: org,
      versionId,
      interval: 'month',
    });
    await expect(requireFeature({ organizationId: org }, 'booking.sms.ownNumber')).rejects.toThrow(
      FeatureNotIncluded,
    );
    await createOverride({
      founderHeaders: founderHeaders(),
      organizationId: org,
      kind: 'feature',
      featureKey: 'booking.sms.ownNumber',
      reason: 'Pilot',
      expiresAt: new Date(Date.now() + 60 * DAY),
    });
    await expect(
      requireFeature({ organizationId: org }, 'booking.sms.ownNumber'),
    ).resolves.toBeUndefined();
  });

  it('RLS: without the organization context nothing is visible', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('SET LOCAL ROLE commercial_rw');
      expect(
        (await c.query('SELECT count(*)::int AS n FROM commercial.subscription')).rows[0].n,
      ).toBe(0);
      await c.query('ROLLBACK');
    } finally {
      c.release();
      await pool.end();
    }
  });
});

// ── Exceptions ─────────────────────────────────────────────────────────────────────────────

describe('Lot 3.2 — exceptions: a required end date, at most 12 months (D-COM-8)', () => {
  const org = newUuid();
  const base = () => ({
    founderHeaders: founderHeaders(),
    organizationId: org,
    kind: 'quota' as const,
    quotaKey: 'messaging.sms',
    limit: 1000,
    reason: 'Test',
  });

  it('without an end date, or more than 12 months away, the server refuses it', async () => {
    await expect(
      createOverride({ ...base(), expiresAt: undefined as unknown as Date }),
    ).rejects.toThrow(InvalidInput);
    await expect(
      createOverride({ ...base(), expiresAt: new Date(Date.now() + 400 * DAY) }),
    ).rejects.toThrow(InvalidInput);
    await expect(
      createOverride({ ...base(), expiresAt: new Date(Date.now() - DAY) }),
    ).rejects.toThrow(InvalidInput);
    await expect(
      createOverride({
        ...base(),
        quotaKey: 'crm.contacts',
        expiresAt: new Date(Date.now() + DAY),
      }),
    ).rejects.toThrow(UnknownCommercialKey);
  });

  it('the database refuses it too, whatever writes it (and sets the creation time itself)', async () => {
    await expect(
      q(
        `INSERT INTO commercial.override (organization_id, kind, quota_key, limit_value, reason, created_by_founder_id, expires_at)
         VALUES ($1, 'quota', 'messaging.sms', 1, 'x', $2, NULL)`,
        [org, founderId],
      ),
    ).rejects.toThrow(/null value|not-null/);
    await expect(
      q(
        `INSERT INTO commercial.override (organization_id, kind, quota_key, limit_value, reason, created_by_founder_id, expires_at)
         VALUES ($1, 'quota', 'messaging.sms', 1, 'x', $2, now() + interval '13 months')`,
        [org, founderId],
      ),
    ).rejects.toThrow(/override_at_most_12_months/);
    // a back-dated created_at does not buy more time: the trigger writes now()
    await expect(
      q(
        `INSERT INTO commercial.override (organization_id, kind, quota_key, limit_value, reason, created_by_founder_id, created_at, expires_at)
         VALUES ($1, 'quota', 'messaging.sms', 1, 'x', $2, now() + interval '6 months', now() + interval '17 months')`,
        [org, founderId],
      ),
    ).rejects.toThrow(/override_at_most_12_months/);
  });

  it('extended explicitly (audited), again at most 12 months from now; ended once', async () => {
    const { overrideId } = await createOverride({
      ...base(),
      expiresAt: new Date(Date.now() + 30 * DAY),
    });
    await extendOverride({
      founderHeaders: founderHeaders(),
      organizationId: org,
      overrideId,
      expiresAt: new Date(Date.now() + 300 * DAY),
    });
    const [row] = await q(
      `SELECT extended_at, extended_by_founder_id FROM commercial.override WHERE id = $1`,
      [overrideId],
    );
    expect(row!.extended_at).toBeInstanceOf(Date);
    expect(row!.extended_by_founder_id).toBe(founderId);
    expect(await auditCount('commercial.override_extended', overrideId)).toBe(1);
    await expect(
      extendOverride({
        founderHeaders: founderHeaders(),
        organizationId: org,
        overrideId,
        expiresAt: new Date(Date.now() + 400 * DAY),
      }),
    ).rejects.toThrow(InvalidInput);
    await endOverride({ founderHeaders: founderHeaders(), organizationId: org, overrideId });
    await expect(
      q(`UPDATE commercial.override SET expires_at = now() + interval '1 day' WHERE id = $1`, [
        overrideId,
      ]),
    ).rejects.toThrow(/has ended/);
    await expect(
      q(`UPDATE commercial.override SET reason = 'altul' WHERE id = $1`, [overrideId]),
    ).rejects.toThrow();
  });
});

// ── Moving businesses ──────────────────────────────────────────────────────────────────────

describe('Lot 3.2 — moving businesses to another version (§8.5, D-COM-9)', () => {
  it('in the customer’s advantage: applies now, with its event and audit row', async () => {
    const { planId, versionId } = await publishedVersion();
    const org = newUuid();
    await assignSubscription({
      founderHeaders: founderHeaders(),
      organizationId: org,
      versionId,
      interval: 'month',
    });
    const better = await nextVersion(planId, {
      ...TERMS,
      quotas: { ...TERMS.quotas, 'messaging.sms': 1000 },
    });
    const [change] = await scheduleVersionChange({
      founderHeaders: founderHeaders(),
      organizationIds: [org],
      toVersionId: better,
    });
    expect(change!.classification).toBe('advantage');
    expect((await getEffectiveEntitlements(org)).quotas['messaging.sms']).toBe(1000);
    const events = await q(
      `SELECT type, version, payload FROM commercial.outbox_events WHERE organization_id = $1`,
      [org],
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'subscription.version_change_scheduled',
      version: 1,
      payload: {
        classification: 'advantage',
        toVersionId: better,
        subscriptionChangeId: change!.subscriptionChangeId,
      },
    });
    expect(
      await auditCount('commercial.version_change_scheduled', change!.subscriptionChangeId),
    ).toBe(1);
  });

  it('in the customer’s disadvantage with less than 30 days: refused for every business, nothing written', async () => {
    const { planId, versionId } = await publishedVersion();
    const orgA = newUuid();
    const orgB = newUuid();
    for (const org of [orgA, orgB]) {
      await assignSubscription({
        founderHeaders: founderHeaders(),
        organizationId: org,
        versionId,
        interval: 'month',
      });
    }
    const dearer = await nextVersion(planId, {
      ...TERMS,
      prices: [{ currency: 'RON', kind: 'month', amountMinor: 44900 }, TERMS.prices[1]!],
    });
    await expect(
      scheduleVersionChange({
        founderHeaders: founderHeaders(),
        organizationIds: [orgA, orgB],
        toVersionId: dearer,
        effectiveAt: new Date(Date.now() + 10 * DAY),
      }),
    ).rejects.toThrow(/at least 30 days/);
    expect(
      await q(
        `SELECT 1 FROM commercial.subscription_change WHERE organization_id = ANY($1::uuid[])`,
        [[orgA, orgB]],
      ),
    ).toEqual([]);
    expect(
      await q(`SELECT 1 FROM commercial.outbox_events WHERE organization_id = ANY($1::uuid[])`, [
        [orgA, orgB],
      ]),
    ).toEqual([]);

    // the database refuses it too, whatever the interface
    const [sub] = await q(`SELECT id FROM commercial.subscription WHERE organization_id = $1`, [
      orgA,
    ]);
    await expect(
      q(
        `INSERT INTO commercial.subscription_change
           (subscription_id, organization_id, from_version_id, to_version_id, classification, effective_at, created_by_founder_id)
         VALUES ($1, $2, $3, $4, 'disadvantage', now() + interval '5 days', $5)`,
        [sub!.id, orgA, versionId, dearer, founderId],
      ),
    ).rejects.toThrow(/subscription_change_notice/);
  });

  it('in the customer’s disadvantage with 30 days: scheduled; the old version applies until then', async () => {
    const { planId, versionId } = await publishedVersion();
    const org = newUuid();
    await assignSubscription({
      founderHeaders: founderHeaders(),
      organizationId: org,
      versionId,
      interval: 'month',
    });
    const fewer = await nextVersion(planId, {
      ...TERMS,
      quotas: { ...TERMS.quotas, 'messaging.sms': 100 },
    });
    const [change] = await scheduleVersionChange({
      founderHeaders: founderHeaders(),
      organizationIds: [org],
      toVersionId: fewer,
    });
    expect(change!.classification).toBe('disadvantage');
    expect(change!.reasons).toContainEqual({
      kind: 'quota_lower',
      key: 'messaging.sms',
      from: 500,
      to: 100,
    });
    expect(change!.effectiveAt.getTime()).toBeGreaterThanOrEqual(Date.now() + 30 * DAY - 60_000);
    expect((await getEffectiveEntitlements(org)).quotas['messaging.sms']).toBe(500);
    expect((await getSubscriptionSummary(org))!.pendingChange).toMatchObject({
      classification: 'disadvantage',
    });
    // when its time comes it applies by itself, at the next request
    expect(
      (await getEffectiveEntitlements(org, new Date(Date.now() + 31 * DAY))).quotas[
        'messaging.sms'
      ],
    ).toBe(100);
    // a second move while one is pending is refused
    await expect(
      scheduleVersionChange({
        founderHeaders: founderHeaders(),
        organizationIds: [org],
        toVersionId: fewer,
      }),
    ).rejects.toThrow(Conflict);
  });
});

// ── D3-21: discounts and applications added to a subscription ───────────────────────────────

describe('D3-21 — applications added to a subscription are recurring lines', () => {
  it('added at the application’s price for the subscription’s currency and interval; ended', async () => {
    await setApplicationPrices({
      founderHeaders: founderHeaders(),
      applicationId: 'crm',
      prices: [{ currency: 'RON', kind: 'month', amountMinor: 4900 }],
    });
    const { versionId } = await publishedVersion();
    const org = newUuid();
    await assignSubscription({
      founderHeaders: founderHeaders(),
      organizationId: org,
      versionId,
      interval: 'month',
    });
    const { lineId } = await addApplicationToSubscription({
      founderHeaders: founderHeaders(),
      organizationId: org,
      applicationId: 'crm',
    });
    expect((await getEffectiveEntitlements(org)).applications).toEqual(['booking', 'crm']);
    const invoice = (await getSubscriptionSummary(org))!.nextInvoice;
    expect(invoice.lines).toEqual([
      expect.objectContaining({ kind: 'plan', amountMinor: 34900 }),
      { kind: 'application', key: 'crm', lineId, amountMinor: 4900 },
    ]);
    expect(invoice).toMatchObject({ subtotalMinor: 39800, discountMinor: 0, totalMinor: 39800 });
    // already in the plan → refused; no price in the subscription's currency / interval → refused
    await expect(
      addApplicationToSubscription({
        founderHeaders: founderHeaders(),
        organizationId: org,
        applicationId: 'booking',
      }),
    ).rejects.toThrow(Conflict);
    const yearlyOrg = newUuid();
    await assignSubscription({
      founderHeaders: founderHeaders(),
      organizationId: yearlyOrg,
      versionId,
      interval: 'year',
    });
    await expect(
      addApplicationToSubscription({
        founderHeaders: founderHeaders(),
        organizationId: yearlyOrg,
        applicationId: 'crm',
      }),
    ).rejects.toThrow(/no year price in RON/);
    await endApplicationLine({ founderHeaders: founderHeaders(), organizationId: org, lineId });
    expect((await getEffectiveEntitlements(org)).applications).toEqual(['booking']);
    expect(await auditCount('commercial.application_line_added', lineId)).toBe(1);
    expect(await auditCount('commercial.application_line_ended', lineId)).toBe(1);
    expect(await auditCount('commercial.application_prices_set', 'crm')).toBeGreaterThan(0);
  });
});

describe('D3-21 — discounts', () => {
  const REASON = 'Partener fondator, înțelegere din octombrie';
  /** A business on the monthly test plan (34900 RON), started on the 15th. */
  async function business(): Promise<{ org: string; planId: string }> {
    const { planId, versionId } = await publishedVersion();
    const org = newUuid();
    await assignSubscription({
      founderHeaders: founderHeaders(),
      organizationId: org,
      versionId,
      interval: 'month',
      startedOn: '2026-10-15',
    });
    return { org, planId };
  }
  const sub = { startedOn: '2026-10-15', interval: 'month' as const };
  /** Seen the day before an invoice date, the next invoice is that one. */
  const dayBefore = (invoiceDate: string) =>
    new Date(startOfDay(invoiceDate).getTime() - 12 * 3_600_000);
  const nextAfter = (date: string, months: number) => {
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + months);
    return d.toISOString().slice(0, 10);
  };

  it('a percentage on the whole subscription: full price, the discount as a line, the total; audited', async () => {
    const { org } = await business();
    const { discountId } = await createDiscount({
      founderHeaders: founderHeaders(),
      organizationId: org,
      target: { scope: 'subscription' },
      value: { kind: 'percent', percentOff: 20 },
      duration: { duration: 'forever' },
      reason: REASON,
    });
    const s = (await getSubscriptionSummary(org))!;
    expect(s.priceMinor).toBe(34900);
    expect(s.nextInvoice).toMatchObject({
      currency: 'RON',
      subtotalMinor: 34900,
      discountMinor: 6980,
      totalMinor: 27920,
    });
    expect(s.nextInvoice.discounts).toEqual([
      expect.objectContaining({
        discountId,
        scope: 'subscription',
        kind: 'percent',
        percentOff: 20,
        appliedMinor: 6980,
      }),
    ]);
    expect(await auditCount('commercial.discount_created', discountId)).toBe(1);
  });

  it('a fixed amount in the business currency; 100% = free', async () => {
    const { org } = await business();
    await createDiscount({
      founderHeaders: founderHeaders(),
      organizationId: org,
      target: { scope: 'subscription' },
      value: { kind: 'amount', amountOffMinor: 5000 },
      duration: { duration: 'forever' },
      reason: REASON,
    });
    expect((await getSubscriptionSummary(org))!.nextInvoice.totalMinor).toBe(29900);
    const [row] = await q(`SELECT currency FROM commercial.discount WHERE organization_id = $1`, [
      org,
    ]);
    expect(row!.currency).toBe('RON');
    // the database keeps it in the subscription's currency
    const [s] = await q(`SELECT id FROM commercial.subscription WHERE organization_id = $1`, [org]);
    await expect(
      q(
        `INSERT INTO commercial.discount (organization_id, subscription_id, scope, kind, amount_off_minor, currency, duration, reason, created_by_founder_id)
         VALUES ($1, $2, 'subscription', 'amount', 100, 'EUR', 'once', $3, $4)`,
        [org, s!.id, REASON, founderId],
      ),
    ).rejects.toThrow(/subscription currency/);

    const free = await business();
    await createDiscount({
      founderHeaders: founderHeaders(),
      organizationId: free.org,
      target: { scope: 'subscription' },
      value: { kind: 'percent', percentOff: 100 },
      duration: { duration: 'forever' },
      reason: REASON,
    });
    expect((await getSubscriptionSummary(free.org))!.nextInvoice).toMatchObject({
      subtotalMinor: 34900,
      discountMinor: 34900,
      totalMinor: 0,
    });
  });

  it('on one line (an application added, a monthly add-on) vs. on the whole subscription', async () => {
    await setApplicationPrices({
      founderHeaders: founderHeaders(),
      applicationId: 'crm',
      prices: [{ currency: 'RON', kind: 'month', amountMinor: 4900 }],
    });
    const { org, planId } = await business();
    const { lineId } = await addApplicationToSubscription({
      founderHeaders: founderHeaders(),
      organizationId: org,
      applicationId: 'crm',
    });
    const seats = await createAddon({
      founderHeaders: founderHeaders(),
      code: `seats-d-${newUuid().slice(0, 6)}`,
      name: '5 locuri',
      quotaKey: 'platform.members',
      quantity: 5,
      validity: 'monthly',
      purchaseMode: 'direct',
      prices: [{ currency: 'RON', amountMinor: 6000 }],
      eligiblePlanIds: [planId],
    });
    const { grantId } = await grantAddon({
      founderHeaders: founderHeaders(),
      organizationId: org,
      addonId: seats.addonId,
    });
    await createDiscount({
      founderHeaders: founderHeaders(),
      organizationId: org,
      target: { scope: 'application', lineId },
      value: { kind: 'percent', percentOff: 100 },
      duration: { duration: 'forever' },
      reason: REASON,
    });
    await createDiscount({
      founderHeaders: founderHeaders(),
      organizationId: org,
      target: { scope: 'addon', lineId: grantId },
      value: { kind: 'amount', amountOffMinor: 1000 },
      duration: { duration: 'forever' },
      reason: REASON,
    });
    let inv = (await getSubscriptionSummary(org))!.nextInvoice;
    // 34900 + 4900 + 6000 = 45800; - 4900 (crm free) - 1000 (seats)
    expect(inv).toMatchObject({ subtotalMinor: 45800, discountMinor: 5900, totalMinor: 39900 });
    // a subscription discount comes on top, on what is left
    await createDiscount({
      founderHeaders: founderHeaders(),
      organizationId: org,
      target: { scope: 'subscription' },
      value: { kind: 'percent', percentOff: 10 },
      duration: { duration: 'forever' },
      reason: REASON,
    });
    inv = (await getSubscriptionSummary(org))!.nextInvoice;
    expect(inv.totalMinor).toBe(39900 - 3990);
    // one active discount per target
    await expect(
      createDiscount({
        founderHeaders: founderHeaders(),
        organizationId: org,
        target: { scope: 'application', lineId },
        value: { kind: 'percent', percentOff: 50 },
        duration: { duration: 'once' },
        reason: REASON,
      }),
    ).rejects.toThrow(Conflict);
    // a line of another business, or a current-month add-on, is not a line of this subscription
    await expect(
      createDiscount({
        founderHeaders: founderHeaders(),
        organizationId: (await business()).org,
        target: { scope: 'application', lineId },
        value: { kind: 'percent', percentOff: 50 },
        duration: { duration: 'once' },
        reason: REASON,
      }),
    ).rejects.toThrow(InvalidInput);
  });

  it('once: only the next invoice; N months: N invoices; forever: until ended', async () => {
    const { org } = await business();
    const first = firstDiscountedInvoice(sub, new Date());
    const { discountId: once } = await createDiscount({
      founderHeaders: founderHeaders(),
      organizationId: org,
      target: { scope: 'subscription' },
      value: { kind: 'amount', amountOffMinor: 100 },
      duration: { duration: 'once' },
      reason: REASON,
    });
    const at = (months: number) => dayBefore(nextAfter(first, months));
    expect((await getSubscriptionSummary(org, at(0)))!.nextInvoice.discountMinor).toBe(100);
    expect((await getSubscriptionSummary(org, at(1)))!.nextInvoice.discountMinor).toBe(0);
    await endDiscount({ founderHeaders: founderHeaders(), organizationId: org, discountId: once });

    const { discountId: three } = await createDiscount({
      founderHeaders: founderHeaders(),
      organizationId: org,
      target: { scope: 'subscription' },
      value: { kind: 'amount', amountOffMinor: 200 },
      duration: { duration: 'repeating', durationMonths: 3 },
      reason: REASON,
    });
    const applied = [];
    for (const m of [0, 1, 2, 3])
      applied.push((await getSubscriptionSummary(org, at(m)))!.nextInvoice.discountMinor);
    expect(applied).toEqual([200, 200, 200, 0]);
    await endDiscount({ founderHeaders: founderHeaders(), organizationId: org, discountId: three });

    const { discountId: forever } = await createDiscount({
      founderHeaders: founderHeaders(),
      organizationId: org,
      target: { scope: 'subscription' },
      value: { kind: 'amount', amountOffMinor: 300 },
      duration: { duration: 'forever' },
      reason: REASON,
    });
    expect((await getSubscriptionSummary(org, at(24)))!.nextInvoice.discountMinor).toBe(300);
    expect(
      (await listForeverDiscounts({ founderHeaders: founderHeaders() })).map((d) => d.discountId),
    ).toContain(forever);
    await endDiscount({
      founderHeaders: founderHeaders(),
      organizationId: org,
      discountId: forever,
    });
    expect((await getSubscriptionSummary(org))!.nextInvoice.discountMinor).toBe(0);
    const permanent = await listForeverDiscounts({ founderHeaders: founderHeaders() });
    expect(permanent.map((d) => d.discountId)).not.toContain(forever);
    expect(permanent.map((d) => d.discountId)).not.toContain(three);
    // ended, not deleted: the rows stay, with who ended them
    const rows = await q(
      `SELECT ended_by_founder_id FROM commercial.discount WHERE id = ANY($1::uuid[])`,
      [[once, three, forever]],
    );
    expect(rows.map((r) => r.ended_by_founder_id)).toEqual([founderId, founderId, founderId]);
    expect(await auditCount('commercial.discount_ended', forever)).toBe(1);
  });

  it('modified (value, reason) with its audit row; the kind stays; an ended one cannot change', async () => {
    const { org } = await business();
    const { discountId } = await createDiscount({
      founderHeaders: founderHeaders(),
      organizationId: org,
      target: { scope: 'subscription' },
      value: { kind: 'percent', percentOff: 10 },
      duration: { duration: 'forever' },
      reason: REASON,
    });
    await updateDiscount({
      founderHeaders: founderHeaders(),
      organizationId: org,
      discountId,
      value: { kind: 'percent', percentOff: 25 },
      reason: 'Partener fondator, reducere mărită în noiembrie',
    });
    expect((await getSubscriptionSummary(org))!.nextInvoice.discountMinor).toBe(8725);
    const [row] = await q(
      `SELECT updated_by_founder_id, updated_at FROM commercial.discount WHERE id = $1`,
      [discountId],
    );
    expect(row!.updated_by_founder_id).toBe(founderId);
    expect(row!.updated_at).toBeInstanceOf(Date);
    expect(await auditCount('commercial.discount_updated', discountId)).toBe(1);
    await expect(
      updateDiscount({
        founderHeaders: founderHeaders(),
        organizationId: org,
        discountId,
        value: { kind: 'amount', amountOffMinor: 10 },
      }),
    ).rejects.toThrow(InvalidInput);
    await expect(
      q(`UPDATE commercial.discount SET duration = 'once' WHERE id = $1`, [discountId]),
    ).rejects.toThrow(/can only change its value and reason/);
    await endDiscount({ founderHeaders: founderHeaders(), organizationId: org, discountId });
    await expect(
      updateDiscount({
        founderHeaders: founderHeaders(),
        organizationId: org,
        discountId,
        reason: REASON,
      }),
    ).rejects.toThrow();
    await expect(
      q(`UPDATE commercial.discount SET reason = $2 WHERE id = $1`, [discountId, REASON + ' x']),
    ).rejects.toThrow(/has ended/);
  });

  it('the server refuses a bad reason, percentage or amount (and the database too)', async () => {
    const { org } = await business();
    const base = {
      founderHeaders: founderHeaders(),
      organizationId: org,
      target: { scope: 'subscription' as const },
      duration: { duration: 'forever' as const },
    };
    await expect(
      createDiscount({ ...base, value: { kind: 'percent', percentOff: 10 }, reason: 'scurt' }),
    ).rejects.toThrow(InvalidInput);
    await expect(
      createDiscount({
        ...base,
        value: { kind: 'percent', percentOff: 10 },
        reason: 'x'.repeat(1001),
      }),
    ).rejects.toThrow(InvalidInput);
    for (const percentOff of [0, 101, 12.5]) {
      await expect(
        createDiscount({ ...base, value: { kind: 'percent', percentOff }, reason: REASON }),
      ).rejects.toThrow(InvalidInput);
    }
    await expect(
      createDiscount({ ...base, value: { kind: 'amount', amountOffMinor: 0 }, reason: REASON }),
    ).rejects.toThrow(InvalidInput);
    await expect(
      createDiscount({
        ...base,
        value: { kind: 'percent', percentOff: 10 },
        duration: { duration: 'repeating', durationMonths: 0 },
        reason: REASON,
      }),
    ).rejects.toThrow(InvalidInput);
    const [s] = await q(`SELECT id FROM commercial.subscription WHERE organization_id = $1`, [org]);
    await expect(
      q(
        `INSERT INTO commercial.discount (organization_id, subscription_id, scope, kind, percent_off, currency, duration, reason, created_by_founder_id)
         VALUES ($1, $2, 'subscription', 'percent', 10, 'RON', 'forever', 'scurt', $3)`,
        [org, s!.id, founderId],
      ),
    ).rejects.toThrow(/discount_reason/);
    expect(await q(`SELECT 1 FROM commercial.discount WHERE organization_id = $1`, [org])).toEqual(
      [],
    );
  });
});
