import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import type { ApplicationManifest } from '@ventora/contracts';
import { Conflict, Forbidden, InvalidInput } from '@ventora/errors';
import { closeAuditPools } from '@ventora/audit';
import { founderAuth } from '@ventora/identity';
import {
  APPLICATIONS,
  activatePurchasedAddon,
  activatePurchasedApplication,
  addApplicationToSubscription,
  assignSubscription,
  closeCommercialPools,
  commitQuota,
  createAddon,
  createCommercialRequest,
  createDiscount,
  createOverride,
  createPlan,
  createPlanVersion,
  extendOverride,
  getBusinessCommercialForFounder,
  getCatalogForOrg,
  listAddonsForOrg,
  getEffectiveEntitlements,
  getIncludedMembersForFounder,
  getPlanVersionForFounder,
  getSeatsBreakdown,
  getSubscriptionSummary,
  getUsage,
  getUsageTotalsForFounder,
  grantAddon,
  listActiveDiscountsForFounder,
  listAddonsForFounder,
  listApplicationsForFounder,
  listBusinessUsageForFounder,
  listExpiringOverridesForFounder,
  listPlansForFounder,
  listRequestsForFounder,
  listSubscriptionsForFounder,
  publishVersion,
  refuseRequest,
  reserveQuota,
  resolveRequest,
  scheduleVersionChange,
  setApplicationActivationMode,
  setApplicationPrices,
  setApplicationQuotas,
  setOfferPeriod,
  setBusinessCurrency,
  setIncludedMembers,
  stopBundleSales,
  syncRegistry,
  updateAddon,
  updateDraftVersion,
  type VersionTermsInput,
} from '../index';

// Lot 3.4 — the Founder screens' contracts: „Gata când” (a limit changed in FounderPlanEditor and
// published shows in the Hub at the next request, without a deploy; every action has its audit row
// on the Founder), the requests from the Hub (commercial_requests), D3-24 (a setup cost no longer
// keeps an application or an add-on on request: migrations 010 and 011), the reads across businesses
// (FounderPlans, FounderUsage, FounderDiscounts, „Prezentare”) and one business (FounderBusiness).

const adminPool = new Pool({ connectionString: process.env.DIRECT_URL, max: 2 });
let admin: PoolClient;
const q = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;
const newUuid = () => crypto.randomUUID();
const DAY = 86_400_000;

// ── Founder session with 2FA (as in plans.integration.test.ts) ─────────────────────────────

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
  const email = `founder-l34-${newUuid()}@test.local`;
  await founderAuth.api.signUpEmail({
    body: { name: 'Founder 3.4', email, password: FOUNDER_PASSPHRASE },
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

// ── Registry fixture (test manifests) ───────────────────────────────────────────────────────

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
  features: [],
  quotas: { 'platform.members': 10, 'messaging.sms': 1000, 'booking.appointments': 1000 },
  prices: [
    { currency: 'RON', kind: 'month', amountMinor: 34900 },
    { currency: 'RON', kind: 'year', amountMinor: 349000 },
    { currency: 'EUR', kind: 'month', amountMinor: 7000 },
    { currency: 'EUR', kind: 'year', amountMinor: 70000 },
  ],
};

async function auditRows(action: string, targetId: string) {
  return q(
    `SELECT actor_type, actor_id, founder_id, organization_id, metadata FROM audit.audit_log
      WHERE action = $1 AND target_id = $2 ORDER BY created_at`,
    [action, targetId],
  );
}

let seq = 0;
async function plan(terms: VersionTermsInput = TERMS) {
  seq += 1;
  const { planId } = await createPlan({
    founderHeaders: founderHeaders(),
    code: `l34-${seq}-${newUuid().slice(0, 6)}`,
    name: `Business ${seq}`,
  });
  const { versionId } = await createPlanVersion({ founderHeaders: founderHeaders(), planId });
  await updateDraftVersion({ founderHeaders: founderHeaders(), versionId, terms });
  await publishVersion({ founderHeaders: founderHeaders(), versionId });
  return { planId, versionId };
}

async function business(versionId: string, startedOn?: string): Promise<string> {
  const organizationId = newUuid();
  await setBusinessCurrency({ founderHeaders: founderHeaders(), organizationId, currency: 'RON' });
  await assignSubscription({
    founderHeaders: founderHeaders(),
    organizationId,
    versionId,
    interval: 'month',
    startedOn,
  });
  return organizationId;
}

const owner = (organizationId: string, userId = newUuid()) => ({
  organizationId,
  userId,
  role: 'owner',
  actor: 'user' as const,
});

beforeAll(async () => {
  admin = await adminPool.connect();
  await admin.query(
    'TRUNCATE commercial.quota_key, commercial.feature_key, commercial.application CASCADE',
  );
  await syncRegistry(admin, APPLICATIONS, MANIFESTS);
  await admin.query(`UPDATE commercial.setting SET int_value = 3 WHERE key = 'included_members'`);
  await createFounder();
});

afterAll(async () => {
  admin.release();
  await adminPool.end();
  await closeCommercialPools();
  await closeAuditPools();
});

// ── Gata când ──────────────────────────────────────────────────────────────────────────────

describe('Lot 3.4 — „Gata când”: a limit changed in FounderPlanEditor shows in the Hub at once', () => {
  it('new version from the current one → limit changed → published → businesses moved → Hub', async () => {
    const { planId, versionId: v1 } = await plan();
    const org = await business(v1);
    const before = await getSubscriptionSummary(org);
    expect(before!.quotas.find((x) => x.key === 'messaging.sms')!.limit).toBe(1000);

    // FounderPlanEditor: „Versiune nouă” copies the current one, the draft gets the new limit
    const detail0 = await getPlanVersionForFounder({
      founderHeaders: founderHeaders(),
      versionId: v1,
    });
    const { versionId: v2 } = await createPlanVersion({
      founderHeaders: founderHeaders(),
      planId,
      copyFromVersionId: v1,
    });
    const draft = await getPlanVersionForFounder({
      founderHeaders: founderHeaders(),
      versionId: v2,
    });
    expect(draft.version.publishedAt).toBeNull();
    expect(draft.base?.id).toBe(v1);
    expect(draft.businessesOnPlan).toBe(1);
    expect(detail0.version.current).toBe(true);
    await updateDraftVersion({
      founderHeaders: founderHeaders(),
      versionId: v2,
      terms: {
        ...draft.version.terms,
        quotas: { ...draft.version.terms.quotas, 'messaging.sms': 1500 },
      },
    });
    await publishVersion({ founderHeaders: founderHeaders(), versionId: v2 });

    // publishing alone moves nobody (§8.5)
    expect(
      (await getSubscriptionSummary(org))!.quotas.find((x) => x.key === 'messaging.sms')!.limit,
    ).toBe(1000);

    // „Mută afaceri pe v2”: more SMS, same price → in the client's advantage → now
    const [move] = await scheduleVersionChange({
      founderHeaders: founderHeaders(),
      organizationIds: [org],
      toVersionId: v2,
    });
    expect(move!.classification).toBe('advantage');
    const after = await getSubscriptionSummary(org);
    expect(after!.versionNumber).toBe(2);
    expect(after!.quotas.find((x) => x.key === 'messaging.sms')!.limit).toBe(1500);
    const usage = await getUsage({ organizationId: org });
    expect(usage.find((x) => x.quotaKey === 'messaging.sms')!.limit).toBe(1500);

    // FounderPlans: the business is counted on v2, which is the current version
    const plans = await listPlansForFounder({ founderHeaders: founderHeaders() });
    const p = plans.find((x) => x.id === planId)!;
    expect(p.versions.map((v) => [v.number, v.businesses, v.current])).toEqual([
      [1, 0, false],
      [2, 1, true],
    ]);

    // every step has its audit row on the Founder
    for (const [action, target] of [
      ['commercial.version_created', v2],
      ['commercial.version_updated', v2],
      ['commercial.version_published', v2],
      ['commercial.version_change_scheduled', move!.subscriptionChangeId],
    ] as const) {
      const rows = await auditRows(action, target);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ actor_type: 'founder', founder_id: founderId });
    }
  });
});

// ── The requests from the Hub ──────────────────────────────────────────────────────────────

describe('Lot 3.4 — commercial_requests: „Cere activare”, „Cere alt abonament”', () => {
  it('the owner asks; a member is refused; asking again returns the open request', async () => {
    const { versionId } = await plan();
    const { planId: otherPlan } = await plan();
    const org = await business(versionId);
    const userId = newUuid();
    const r = await createCommercialRequest(owner(org, userId), {
      kind: 'plan_change',
      targetType: 'plan',
      targetId: otherPlan,
    });
    expect(r.created).toBe(true);
    const again = await createCommercialRequest(owner(org, userId), {
      kind: 'plan_change',
      targetType: 'plan',
      targetId: otherPlan,
    });
    expect(again).toEqual({ requestId: r.requestId, created: false });
    await expect(
      createCommercialRequest(
        { ...owner(org), role: 'member' },
        { kind: 'activation', targetType: 'application', targetId: 'crm' },
      ),
    ).rejects.toThrow(Forbidden);
    await expect(
      createCommercialRequest(
        { ...owner(org), role: 'admin' },
        { kind: 'activation', targetType: 'application', targetId: 'crm' },
      ),
    ).rejects.toThrow(Forbidden);
    // what cannot be asked: an application already active, an unknown one, the plan it is on
    await expect(
      createCommercialRequest(owner(org), {
        kind: 'activation',
        targetType: 'application',
        targetId: 'booking',
      }),
    ).rejects.toThrow(InvalidInput);
    await expect(
      createCommercialRequest(owner(org), {
        kind: 'activation',
        targetType: 'application',
        targetId: 'nope',
      }),
    ).rejects.toThrow(InvalidInput);
    const [rows] = await q(`SELECT plan_id FROM commercial.plan_version WHERE id = $1`, [
      versionId,
    ]);
    await expect(
      createCommercialRequest(owner(org), {
        kind: 'plan_change',
        targetType: 'plan',
        targetId: rows!.plan_id,
      }),
    ).rejects.toThrow(InvalidInput);

    const audit = await auditRows('commercial.request_created', r.requestId);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor_type: 'user', actor_id: userId, organization_id: org });
  });

  it('Founder lists, resolves or refuses with a reason — once, audited, with the Hub event', async () => {
    const { versionId } = await plan();
    const org = await business(versionId);
    const { addonId } = await createAddon({
      founderHeaders: founderHeaders(),
      code: `l34-dom-${newUuid().slice(0, 6)}`,
      name: 'Domeniu propriu',
      quotaKey: 'platform.members',
      quantity: 1,
      validity: 'monthly',
      purchaseMode: 'on_request',
      prices: [{ currency: 'RON', amountMinor: 2500, setupMinor: 15000 }],
      eligiblePlanIds: [
        (await q(`SELECT plan_id FROM commercial.plan_version WHERE id = $1`, [versionId]))[0]!
          .plan_id,
      ],
    });
    const a = await createCommercialRequest(owner(org), {
      kind: 'activation',
      targetType: 'addon',
      targetId: addonId,
    });
    const b = await createCommercialRequest(owner(org), {
      kind: 'activation',
      targetType: 'application',
      targetId: 'crm',
    });

    const fresh = await listRequestsForFounder({ founderHeaders: founderHeaders(), onlyNew: true });
    expect(
      fresh
        .filter((x) => x.organizationId === org)
        .map((x) => x.id)
        .sort(),
    ).toEqual([a.requestId, b.requestId].sort());

    await resolveRequest({
      founderHeaders: founderHeaders(),
      organizationId: org,
      requestId: a.requestId,
    });
    await expect(
      refuseRequest({
        founderHeaders: founderHeaders(),
        organizationId: org,
        requestId: b.requestId,
        reason: '  ',
      }),
    ).rejects.toThrow(InvalidInput);
    await refuseRequest({
      founderHeaders: founderHeaders(),
      organizationId: org,
      requestId: b.requestId,
      reason: 'O activăm după o discuție despre configurare.',
    });
    // decided once — by the contract and in the database
    await expect(
      resolveRequest({
        founderHeaders: founderHeaders(),
        organizationId: org,
        requestId: b.requestId,
      }),
    ).rejects.toThrow(Conflict);
    await expect(
      q(`UPDATE commercial.commercial_request SET status = 'new' WHERE id = $1`, [b.requestId]),
    ).rejects.toThrow(/already decided/);
    // the business of the transaction (RLS): another organization does not reach it
    await expect(
      resolveRequest({
        founderHeaders: founderHeaders(),
        organizationId: newUuid(),
        requestId: a.requestId,
      }),
    ).rejects.toThrow();

    const all = await listRequestsForFounder({ founderHeaders: founderHeaders() });
    const mine = all.filter((x) => x.organizationId === org);
    expect(mine.find((x) => x.id === a.requestId)).toMatchObject({
      status: 'resolved',
      decidedByFounderId: founderId,
    });
    expect(mine.find((x) => x.id === b.requestId)).toMatchObject({
      status: 'refused',
      refusalReason: 'O activăm după o discuție despre configurare.',
    });
    expect(await auditRows('commercial.request_resolved', a.requestId)).toHaveLength(1);
    const refused = await auditRows('commercial.request_refused', b.requestId);
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatchObject({ actor_type: 'founder', founder_id: founderId });
    const events = await q(
      `SELECT payload FROM commercial.outbox_events
        WHERE type = 'commercial.request.decided' AND organization_id = $1 ORDER BY occurred_at`,
      [org],
    );
    expect(events.map((e) => e.payload.status)).toEqual(['resolved', 'refused']);
  });
});

// ── Setup cost: D3-24 (applications, Lot 3.4; add-ons, Lot 3.5) ───────────────────────────

describe('Lot 3.4 / 3.5 — setup cost: the switch is free for applications and add-ons (D3-24)', () => {
  it('an application with a setup cost stays „direct” and can be switched freely, in SQL too', async () => {
    await setApplicationActivationMode({
      founderHeaders: founderHeaders(),
      applicationId: 'crm',
      mode: 'direct',
    });
    await setApplicationPrices({
      founderHeaders: founderHeaders(),
      applicationId: 'crm',
      prices: [
        { currency: 'RON', kind: 'month', amountMinor: 6900 },
        { currency: 'EUR', kind: 'month', amountMinor: 1400 },
        { currency: 'RON', kind: 'setup', amountMinor: 30000 },
        { currency: 'EUR', kind: 'setup', amountMinor: 6000 },
      ],
    });
    const apps = await listApplicationsForFounder({ founderHeaders: founderHeaders() });
    const crm = apps.find((a) => a.id === 'crm')!;
    expect(crm.activationMode).toBe('direct');
    expect(crm.prices).toContainEqual({ currency: 'RON', kind: 'setup', amountMinor: 30000 });
    const [audit] = await auditRows('commercial.application_prices_set', 'crm').then((r) =>
      r.slice(-1),
    );
    expect(audit!.metadata.activationModeForcedBySetup).toBeUndefined();
    await setApplicationActivationMode({
      founderHeaders: founderHeaders(),
      applicationId: 'crm',
      mode: 'on_request',
    });
    await setApplicationActivationMode({
      founderHeaders: founderHeaders(),
      applicationId: 'crm',
      mode: 'direct',
    });
    // the D3-23 triggers on applications are gone (migration 010)
    await q(`UPDATE commercial.application SET activation_mode = 'direct' WHERE id = 'crm'`);
    const triggers = await q(
      `SELECT tgname FROM pg_trigger
        WHERE tgname IN ('application_setup_on_request', 'application_price_setup_on_request')`,
    );
    expect(triggers).toEqual([]);
  });

  it('an add-on (D3-24, Lot 3.5): direct with a setup cost, the switch free, in SQL too; validity changes', async () => {
    const { planId } = await plan();
    const base = {
      founderHeaders: founderHeaders(),
      name: 'Pachet',
      quotaKey: 'messaging.sms',
      quantity: 500,
      validity: 'current_month' as const,
      eligiblePlanIds: [planId],
    };
    const { addonId: withSetup } = await createAddon({
      ...base,
      code: `l34-x-${newUuid().slice(0, 6)}`,
      purchaseMode: 'direct',
      prices: [{ currency: 'RON', amountMinor: 4900, setupMinor: 100 }],
    });
    expect(
      (await listAddonsForFounder({ founderHeaders: founderHeaders() })).find(
        (a) => a.id === withSetup,
      ),
    ).toMatchObject({ purchaseMode: 'direct' });
    const { addonId } = await createAddon({
      ...base,
      code: `l34-y-${newUuid().slice(0, 6)}`,
      purchaseMode: 'direct',
      prices: [
        { currency: 'RON', amountMinor: 4900 },
        { currency: 'EUR', amountMinor: 1000 },
      ],
    });
    await updateAddon({
      founderHeaders: founderHeaders(),
      addonId,
      validity: 'monthly',
      prices: [
        { currency: 'RON', amountMinor: 6000, setupMinor: 15000 },
        { currency: 'EUR', amountMinor: 1200, setupMinor: 3000 },
      ],
    });
    const addon = (await listAddonsForFounder({ founderHeaders: founderHeaders() })).find(
      (a) => a.id === addonId,
    )!;
    // a setup price keeps the add-on direct
    expect(addon).toMatchObject({ purchaseMode: 'direct', validity: 'monthly' });
    expect(addon.prices).toContainEqual({ currency: 'EUR', amountMinor: 1200, setupMinor: 3000 });
    await updateAddon({ founderHeaders: founderHeaders(), addonId, purchaseMode: 'on_request' });
    await updateAddon({ founderHeaders: founderHeaders(), addonId, purchaseMode: 'direct' });
    const audit = await auditRows('commercial.addon_updated', addonId);
    expect(audit[0]!.metadata).toMatchObject({ validity: 'monthly' });
    expect(audit[0]!.metadata.purchaseModeForcedBySetup).toBeUndefined();
    // the D3-23 triggers on add-ons are gone too (migration 011)
    await q(`UPDATE commercial.addon SET purchase_mode = 'on_request' WHERE id = $1`, [addonId]);
    await q(`UPDATE commercial.addon SET purchase_mode = 'direct' WHERE id = $1`, [addonId]);
    const triggers = await q(
      `SELECT tgname FROM pg_trigger
        WHERE tgname IN ('addon_setup_on_request', 'addon_price_setup_on_request')`,
    );
    expect(triggers).toEqual([]);
  });
});

// ── Reads ──────────────────────────────────────────────────────────────────────────────────

describe('Lot 3.4 — FounderBusiness, FounderUsage, „Reduceri”, „Prezentare”', () => {
  it('one business: usage against limits with the exception, exceptions, lines, discounts, invoice', async () => {
    const { planId, versionId } = await plan();
    const org = await business(versionId);
    const { overrideId } = await createOverride({
      founderHeaders: founderHeaders(),
      organizationId: org,
      kind: 'quota',
      quotaKey: 'platform.members',
      limit: 12,
      reason: 'Extindere la al doilea cabinet',
      expiresAt: new Date(Date.now() + 3 * DAY),
    });
    await setApplicationPrices({
      founderHeaders: founderHeaders(),
      applicationId: 'crm',
      prices: [{ currency: 'RON', kind: 'month', amountMinor: 4900 }],
    });
    const { lineId } = await addApplicationToSubscription({
      founderHeaders: founderHeaders(),
      organizationId: org,
      applicationId: 'crm',
    });
    const { addonId } = await createAddon({
      founderHeaders: founderHeaders(),
      code: `l34-seats-${newUuid().slice(0, 6)}`,
      name: '5 locuri în echipă în plus',
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
      addonId,
    });
    await createDiscount({
      founderHeaders: founderHeaders(),
      organizationId: org,
      target: { scope: 'subscription' },
      value: { kind: 'percent', percentOff: 15 },
      duration: { duration: 'repeating', durationMonths: 5 },
      reason: 'Client din primul val',
    });
    await createDiscount({
      founderHeaders: founderHeaders(),
      organizationId: org,
      target: { scope: 'application', lineId },
      value: { kind: 'percent', percentOff: 100 },
      duration: { duration: 'forever' },
      reason: 'Partener de test pentru campanii',
    });
    for (let i = 0; i < 3; i++) {
      const op = newUuid();
      await reserveQuota({ organizationId: org }, 'messaging.sms', 10, op);
      await commitQuota({ organizationId: org }, op);
    }

    const b = await getBusinessCommercialForFounder({
      founderHeaders: founderHeaders(),
      organizationId: org,
    });
    expect(b.currency).toBe('RON');
    expect(b.subscription).toMatchObject({
      interval: 'month',
      priceMinor: 34900,
      versionNumber: 1,
    });
    expect(b.applications.sort()).toEqual(['booking', 'crm']);
    // the exception replaces what the account includes (3 seats + 10 in the bundle, D3-24); the
    // add-on adds on top (D3-22)
    expect(b.quotas.find((x) => x.key === 'platform.members')).toMatchObject({
      limit: 17,
      planLimit: 13,
    });
    expect(b.quotas.find((x) => x.key === 'messaging.sms')).toMatchObject({
      limit: 1000,
      used: 30,
    });
    expect(b.overrides).toEqual([
      expect.objectContaining({
        id: overrideId,
        limit: 12,
        planLimit: 13,
        createdByFounderId: founderId,
      }),
    ]);
    expect(b.lines.map((l) => [l.type, l.id]).sort()).toEqual(
      [
        ['addon', grantId],
        ['application', lineId],
      ].sort(),
    );
    const repeating = b.discounts.find((d) => d.duration === 'repeating')!;
    expect(repeating.lastInvoiceOn! > repeating.firstInvoiceOn).toBe(true);
    // the next invoice: the plan, the application (free) and the add-on, then the discounts
    expect(b.nextInvoice!.subtotalMinor).toBe(34900 + 4900 + 6000);
    expect(b.nextInvoice!.discounts).toHaveLength(2);

    // „Prezentare”: it expires in 3 days, so it shows; extended by 30 days, it no longer does
    const soon = await listExpiringOverridesForFounder({ founderHeaders: founderHeaders() });
    expect(soon.map((o) => o.id)).toContain(overrideId);
    await extendOverride({
      founderHeaders: founderHeaders(),
      organizationId: org,
      overrideId,
      expiresAt: new Date(Date.now() + 30 * DAY),
    });
    const later = await listExpiringOverridesForFounder({ founderHeaders: founderHeaders() });
    expect(later.map((o) => o.id)).not.toContain(overrideId);
    expect(await auditRows('commercial.override_extended', overrideId)).toHaveLength(1);

    // „Reduceri” → „Toate active”: the temporary one too
    const active = await listActiveDiscountsForFounder({ founderHeaders: founderHeaders() });
    expect(
      active
        .filter((d) => d.organizationId === org)
        .map((d) => d.duration)
        .sort(),
    ).toEqual(['forever', 'repeating']);
  });

  it('across businesses: the highest share of a limit, the totals of the month, the subscriptions', async () => {
    const { versionId } = await plan({
      ...TERMS,
      quotas: { ...TERMS.quotas, 'messaging.sms': 100 },
    });
    const org = await business(versionId);
    const before = await getUsageTotalsForFounder({
      founderHeaders: founderHeaders(),
      dailyKey: 'messaging.sms',
    });
    const op = newUuid();
    await reserveQuota({ organizationId: org }, 'messaging.sms', 92, op);
    await commitQuota({ organizationId: org }, op);
    const after = await getUsageTotalsForFounder({
      founderHeaders: founderHeaders(),
      dailyKey: 'messaging.sms',
    });
    const sms = (t: typeof after) => t.totals.find((x) => x.key === 'messaging.sms')?.amount ?? 0;
    expect(sms(after) - sms(before)).toBe(92);
    expect(after.daily.reduce((s, d) => s + d.amount, 0)).toBeGreaterThanOrEqual(92);

    const usage = await listBusinessUsageForFounder({ founderHeaders: founderHeaders() });
    expect(usage.find((u) => u.organizationId === org)!.top).toEqual({
      key: 'messaging.sms',
      pct: 92,
    });
    const subs = await listSubscriptionsForFounder({ founderHeaders: founderHeaders() });
    expect(subs.find((s) => s.organizationId === org)).toMatchObject({
      versionId,
      interval: 'month',
      currency: 'RON',
      priceMinor: 34900,
    });
  });
});

// ── D3-24 (31.10.2026): applications à la carte, bundles, the seats every account includes ────

describe('Lot 3.4 — D3-24 / D3-25: the included seats, applications à la carte, bundles', () => {
  it('D3-25: a new subscription takes the included seats of the setting and keeps them; existing ones keep 0', async () => {
    const { versionId } = await plan(); // the bundle brings 10 seats
    const members = async (org: string) =>
      (await getEffectiveEntitlements(org)).quotas['platform.members'];
    expect(await getIncludedMembersForFounder({ founderHeaders: founderHeaders() })).toBe(3);
    // without a subscription nothing is included
    const none = newUuid();
    expect(await members(none)).toBe(0);

    // a subscription from before the lot: the column's default (what ADD COLUMN gave the rows
    // already there), without the trigger that fills it at creation
    const old = newUuid();
    await q(`ALTER TABLE commercial.subscription DISABLE TRIGGER subscription_included_members`);
    try {
      await q(
        `INSERT INTO commercial.subscription (organization_id, plan_version_id, interval, currency,
           started_on, anchor_day, status, created_by_founder_id)
         VALUES ($1, $2, 'month', 'RON', CURRENT_DATE, EXTRACT(DAY FROM CURRENT_DATE), 'active', $3)`,
        [old, versionId, founderId],
      );
    } finally {
      await q(`ALTER TABLE commercial.subscription ENABLE TRIGGER subscription_included_members`);
    }
    // a new one, created from Founder (founder_runtime): the setting's value now
    const fresh = await business(versionId);
    // read as app_runtime (commercial_rw)
    expect(await members(old)).toBe(10);
    expect(await members(fresh)).toBe(13);
    expect((await getSeatsBreakdown(old)).included).toBe(0);
    expect(await getSeatsBreakdown(fresh)).toMatchObject({ total: 13, included: 3, bundle: 10 });
    expect((await getCatalogForOrg(fresh)).includedMembers).toBe(3);

    // the setting changes: only subscriptions created afterwards get it
    await setIncludedMembers({ founderHeaders: founderHeaders(), members: 5 });
    const [row] = await auditRows('commercial.setting_changed', 'included_members').then((r) =>
      r.slice(-1),
    );
    expect(row).toMatchObject({ actor_type: 'founder', founder_id: founderId });
    expect(row!.metadata).toMatchObject({ from: 3, to: 5 });
    expect(await members(old)).toBe(10);
    expect(await members(fresh)).toBe(13);
    expect((await getSeatsBreakdown(fresh)).included).toBe(3);
    expect((await getCatalogForOrg(fresh)).includedMembers).toBe(3);
    const later = await business(versionId);
    expect(await members(later)).toBe(15);
    expect((await getSeatsBreakdown(later)).included).toBe(5);
    // without a subscription, the catalog shows what a new one would include
    expect((await getCatalogForOrg(none)).includedMembers).toBe(5);

    // fixed at creation, in the database too
    await expect(
      q(`UPDATE commercial.subscription SET included_members = 9 WHERE organization_id = $1`, [
        fresh,
      ]),
    ).rejects.toThrow(/fixed at its creation/);
    const snap = await q(
      `SELECT included_members FROM commercial.subscription WHERE organization_id = ANY($1::uuid[])
        ORDER BY included_members`,
      [[old, fresh, later]],
    );
    expect(snap.map((r) => r.included_members)).toEqual([0, 3, 5]);

    await expect(
      setIncludedMembers({ founderHeaders: founderHeaders(), members: -1 }),
    ).rejects.toThrow(InvalidInput);
    await setIncludedMembers({ founderHeaders: founderHeaders(), members: 3 });
  });

  it('a subscription without a bundle: only applications à la carte, with their own limits', async () => {
    await setApplicationPrices({
      founderHeaders: founderHeaders(),
      applicationId: 'booking',
      prices: [
        { currency: 'RON', kind: 'month', amountMinor: 9900 },
        { currency: 'RON', kind: 'year', amountMinor: 99000 },
      ],
    });
    await setApplicationQuotas({
      founderHeaders: founderHeaders(),
      applicationId: 'booking',
      quotas: { 'booking.appointments': 1000, 'messaging.sms': 200 },
    });
    expect(
      (await listApplicationsForFounder({ founderHeaders: founderHeaders() })).find(
        (a) => a.id === 'booking',
      )!.quotas,
    ).toEqual({ 'booking.appointments': 1000, 'messaging.sms': 200 });
    const [audit] = (await auditRows('commercial.application_quotas_set', 'booking')).slice(-1);
    expect(audit).toMatchObject({ actor_type: 'founder', founder_id: founderId });

    const org = newUuid();
    await setBusinessCurrency({
      founderHeaders: founderHeaders(),
      organizationId: org,
      currency: 'RON',
    });
    await assignSubscription({
      founderHeaders: founderHeaders(),
      organizationId: org,
      interval: 'month',
    });
    expect((await getEffectiveEntitlements(org)).applications).toEqual([]);
    await addApplicationToSubscription({
      founderHeaders: founderHeaders(),
      organizationId: org,
      applicationId: 'booking',
    });
    const e = await getEffectiveEntitlements(org);
    expect(e.subscription!.planVersionId).toBeNull();
    expect(e.applications).toEqual(['booking']);
    expect(e.quotas).toMatchObject({
      'booking.appointments': 1000,
      'messaging.sms': 200,
      'platform.members': 3,
    });
    const summary = (await getSubscriptionSummary(org))!;
    expect(summary).toMatchObject({ planCode: null, versionNumber: null, priceMinor: 0 });
    expect(summary.nextInvoice.lines.map((l) => [l.kind, l.key, l.amountMinor])).toEqual([
      ['application', 'booking', 9900],
    ]);
    // nothing to move from; add-ons are eligible per bundle
    const { versionId } = await plan();
    await expect(
      scheduleVersionChange({
        founderHeaders: founderHeaders(),
        organizationIds: [org],
        toVersionId: versionId,
      }),
    ).rejects.toThrow(InvalidInput);
    const b = await getBusinessCommercialForFounder({
      founderHeaders: founderHeaders(),
      organizationId: org,
    });
    expect(b.subscription).toMatchObject({ planCode: null, versionId: null });
    expect(b.quotas.find((x) => x.key === 'booking.appointments')).toMatchObject({
      limit: 1000,
      planLimit: 1000,
    });
    await setApplicationQuotas({
      founderHeaders: founderHeaders(),
      applicationId: 'booking',
      quotas: {},
    });
  });

  it('a bundle and an application à la carte: their limits add up; the exception replaces the sum', async () => {
    const { versionId } = await plan();
    const org = await business(versionId);
    await setApplicationPrices({
      founderHeaders: founderHeaders(),
      applicationId: 'crm',
      prices: [{ currency: 'RON', kind: 'month', amountMinor: 4900 }],
    });
    await setApplicationQuotas({
      founderHeaders: founderHeaders(),
      applicationId: 'crm',
      quotas: { 'messaging.sms': 500, 'platform.members': 2 },
    });
    await addApplicationToSubscription({
      founderHeaders: founderHeaders(),
      organizationId: org,
      applicationId: 'crm',
    });
    const e = await getEffectiveEntitlements(org);
    expect(e.quotas['messaging.sms']).toBe(1500); // 1.000 in the bundle + 500 from ClientDesk
    expect(e.quotas['platform.members']).toBe(15); // 3 included + 10 in the bundle + 2
    await createOverride({
      founderHeaders: founderHeaders(),
      organizationId: org,
      kind: 'quota',
      quotaKey: 'messaging.sms',
      limit: 2000,
      reason: 'Campanie de reactivare',
      expiresAt: new Date(Date.now() + 30 * DAY),
    });
    expect((await getEffectiveEntitlements(org)).quotas['messaging.sms']).toBe(2000);
    // an unlimited application limit makes the key unlimited — on a line created with it; the
    // line above keeps the limits it was created with (D3-26, Lot 3.5b)
    await setApplicationQuotas({
      founderHeaders: founderHeaders(),
      applicationId: 'crm',
      quotas: { 'booking.appointments': null },
    });
    const later = await business(versionId);
    await addApplicationToSubscription({
      founderHeaders: founderHeaders(),
      organizationId: later,
      applicationId: 'crm',
    });
    expect((await getEffectiveEntitlements(later)).quotas['booking.appointments']).toBeNull();
    expect((await getEffectiveEntitlements(org)).quotas['booking.appointments']).toBe(1000);
    await setApplicationQuotas({
      founderHeaders: founderHeaders(),
      applicationId: 'crm',
      quotas: {},
    });
  });

  it('an offer sells in its sale period, offers do not overlap, „Oprește vânzarea”; who has it keeps it', async () => {
    const { planId, versionId } = await plan();
    const existing = await business(versionId);
    const before = await getEffectiveEntitlements(existing);
    const day = (d: number) => new Date(Date.now() + d * DAY).toISOString().slice(0, 10);

    // a bundle sold by offers with periods: a scheduled one is not on sale yet
    const { planId: p3 } = await createPlan({
      founderHeaders: founderHeaders(),
      code: `l34-sched-${newUuid().slice(0, 6)}`,
      name: 'Clinică',
    });
    const { versionId: sched } = await createPlanVersion({
      founderHeaders: founderHeaders(),
      planId: p3,
    });
    await updateDraftVersion({ founderHeaders: founderHeaders(), versionId: sched, terms: TERMS });
    await expect(
      setOfferPeriod({
        founderHeaders: founderHeaders(),
        versionId: sched,
        availableFrom: day(40),
        availableUntil: day(10),
      }),
    ).rejects.toThrow(InvalidInput);
    await setOfferPeriod({
      founderHeaders: founderHeaders(),
      versionId: sched,
      availableFrom: day(10),
      availableUntil: day(40),
    });
    await publishVersion({ founderHeaders: founderHeaders(), versionId: sched });
    await expect(business(sched)).rejects.toThrow(InvalidInput); // scheduled, not on sale yet
    // a published offer does not change
    await expect(
      setOfferPeriod({
        founderHeaders: founderHeaders(),
        versionId: sched,
        availableFrom: day(1),
        availableUntil: day(40),
      }),
    ).rejects.toThrow(Conflict);
    // the next offer may not overlap it („Perioada se suprapune cu oferta de acum”)
    const { versionId: next } = await createPlanVersion({
      founderHeaders: founderHeaders(),
      planId: p3,
      copyFromVersionId: sched,
    });
    await setOfferPeriod({
      founderHeaders: founderHeaders(),
      versionId: next,
      availableFrom: day(25),
      availableUntil: day(60),
    });
    await expect(
      publishVersion({ founderHeaders: founderHeaders(), versionId: next }),
    ).rejects.toThrow(InvalidInput);
    await setOfferPeriod({
      founderHeaders: founderHeaders(),
      versionId: next,
      availableFrom: day(41),
      availableUntil: day(70),
    });
    await publishVersion({ founderHeaders: founderHeaders(), versionId: next });
    expect(await auditRows('commercial.offer_period_set', next)).toHaveLength(2);
    const versions = (await listPlansForFounder({ founderHeaders: founderHeaders() })).find(
      (p) => p.id === p3,
    )!.versions;
    expect(versions.map((v) => [v.availableFrom, v.availableUntil])).toEqual([
      [day(10), day(40)],
      [day(41), day(70)],
    ]);

    // „Oprește vânzarea”: no new business on it, in the database too; who has it keeps it
    await stopBundleSales({ founderHeaders: founderHeaders(), planId });
    await expect(stopBundleSales({ founderHeaders: founderHeaders(), planId })).rejects.toThrow(
      Conflict,
    );
    await expect(business(versionId)).rejects.toThrow(InvalidInput);
    await expect(
      q(
        `INSERT INTO commercial.subscription (organization_id, plan_version_id, interval, currency,
           started_on, anchor_day, status, created_by_founder_id)
         VALUES ($1, $2, 'month', 'RON', CURRENT_DATE, EXTRACT(DAY FROM CURRENT_DATE), 'active', $3)`,
        [newUuid(), versionId, founderId],
      ),
    ).rejects.toThrow(/not on sale/);
    expect(await getEffectiveEntitlements(existing)).toEqual(before);
    expect(
      (await listPlansForFounder({ founderHeaders: founderHeaders() })).find(
        (p) => p.id === planId,
      )!.salesStoppedAt,
    ).not.toBeNull();
    expect(await auditRows('commercial.bundle_sales_stopped', planId)).toHaveLength(1);
  });
});

// ── S117: add-ons by application, the catalog in the Hub ──────────────────────────────────

describe('Lot 3.4 — S117: add-ons „Disponibil pentru”, the catalog of bundles and applications', () => {
  it('an add-on is available with the application of its quota; a platform one, to everyone', async () => {
    const seatsCode = `l34-seats-all-${newUuid().slice(0, 6)}`;
    const { addonId: seats } = await createAddon({
      founderHeaders: founderHeaders(),
      code: seatsCode,
      name: '5 locuri în echipă în plus',
      quotaKey: 'platform.members',
      quantity: 5,
      validity: 'monthly',
      purchaseMode: 'direct',
      prices: [{ currency: 'RON', amountMinor: 6000 }],
      eligiblePlanIds: [],
    });
    const { addonId: appts } = await createAddon({
      founderHeaders: founderHeaders(),
      code: `l34-appts-${newUuid().slice(0, 6)}`,
      name: '200 de programări în plus',
      quotaKey: 'booking.appointments',
      quantity: 200,
      validity: 'current_month',
      purchaseMode: 'direct',
      prices: [{ currency: 'RON', amountMinor: 3900 }],
      eligiblePlanIds: [],
    });
    // without a bundle and without EasyBook: only the platform add-on
    const org = newUuid();
    await setBusinessCurrency({
      founderHeaders: founderHeaders(),
      organizationId: org,
      currency: 'RON',
    });
    await assignSubscription({
      founderHeaders: founderHeaders(),
      organizationId: org,
      interval: 'month',
    });
    const offered = (await listAddonsForOrg(org)).map((a) => a.id);
    expect(offered).toContain(seats);
    expect(offered).not.toContain(appts);
    await expect(
      grantAddon({ founderHeaders: founderHeaders(), organizationId: org, addonId: appts }),
    ).rejects.toThrow(InvalidInput);
    await grantAddon({ founderHeaders: founderHeaders(), organizationId: org, addonId: seats });
    // with EasyBook à la carte, its add-on too
    await setApplicationPrices({
      founderHeaders: founderHeaders(),
      applicationId: 'booking',
      prices: [{ currency: 'RON', kind: 'month', amountMinor: 14900 }],
    });
    await addApplicationToSubscription({
      founderHeaders: founderHeaders(),
      organizationId: org,
      applicationId: 'booking',
    });
    expect((await listAddonsForOrg(org)).map((a) => a.id)).toContain(appts);
    const packs = await listAddonsForFounder({ founderHeaders: founderHeaders() });
    expect(packs.find((a) => a.id === appts)!.applicationId).toBe('booking');
    expect(packs.find((a) => a.id === seats)!.applicationId).toBeNull();
  });

  it('the catalog: bundles on sale now, against the applications separately; the one the business has', async () => {
    await setApplicationPrices({
      founderHeaders: founderHeaders(),
      applicationId: 'booking',
      prices: [
        { currency: 'RON', kind: 'month', amountMinor: 14900 },
        { currency: 'RON', kind: 'setup', amountMinor: 30000 },
      ],
    });
    await setApplicationPrices({
      founderHeaders: founderHeaders(),
      applicationId: 'crm',
      prices: [{ currency: 'RON', kind: 'month', amountMinor: 6900 }],
    });
    const terms: VersionTermsInput = {
      ...TERMS,
      applications: ['booking', 'crm'],
      prices: [
        { currency: 'RON', kind: 'month', amountMinor: 17900 },
        { currency: 'RON', kind: 'year', amountMinor: 179000 },
        { currency: 'RON', kind: 'setup', amountMinor: 20000 },
      ],
    };
    const { planId, versionId } = await plan(terms);
    const org = await business(versionId);
    const { planId: stopped } = await plan(terms);
    await stopBundleSales({ founderHeaders: founderHeaders(), planId: stopped });

    const c = await getCatalogForOrg(org);
    expect(c).toMatchObject({ currency: 'RON', interval: 'month', includedMembers: 3 });
    const mine = c.bundles.find((b) => b.planId === planId)!;
    expect(mine).toMatchObject({
      monthMinor: 17900,
      yearMinor: 179000,
      setupMinor: 20000,
      separateMonthMinor: 14900 + 6900,
      seats: 10,
      have: { versionNumber: 1, priceMinor: 17900 },
    });
    expect(mine.quotas['platform.members']).toBeUndefined();
    expect(c.bundles.find((b) => b.planId === stopped)).toBeUndefined();
    const booking = c.applications.find((a) => a.id === 'booking')!;
    expect(booking).toMatchObject({ active: true, monthMinor: 14900, setupMinor: 30000 });
    expect(c.applications.find((a) => a.id === 'crm')!.active).toBe(true);
    expect(c.applications.find((a) => a.id === 'hr')!.active).toBe(false);
  });
});

// ── D3-26 (Lot 3.5b): the limits of an application line, fixed at its creation ───────────────

describe('Lot 3.5b — D3-26: an application line keeps the limits it was created with', () => {
  const sms = async (org: string) => (await getEffectiveEntitlements(org)).quotas['messaging.sms'];
  const crmQuotas = (limit: number) =>
    setApplicationQuotas({
      founderHeaders: founderHeaders(),
      applicationId: 'crm',
      quotas: { 'messaging.sms': limit },
    });

  /** A transaction as one module role, in one business's context; always rolled back. */
  async function asRole(
    url: string | undefined,
    role: 'commercial_rw' | 'commercial_founder',
    organizationId: string,
    fn: (c: PoolClient) => Promise<void>,
  ): Promise<void> {
    const pool = new Pool({ connectionString: url, max: 1 });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL ROLE ${role}`);
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
      await fn(client);
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
      await pool.end();
    }
  }

  /** The request path: the line written as commercial_founder (source `request`), on founder_runtime. */
  async function requestLine(organizationId: string): Promise<string> {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_FOUNDER, max: 1 });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE commercial_founder');
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
      const [sub] = (
        await client.query(`SELECT id FROM commercial.subscription WHERE canceled_at IS NULL`)
      ).rows;
      const { rows } = await client.query(
        `INSERT INTO commercial.subscription_application
           (organization_id, subscription_id, application_id, currency, interval, amount_minor,
            source, created_by_founder_id)
         VALUES ($1, $2, 'crm', 'RON', 'month', 6900, 'request', $3) RETURNING id`,
        [organizationId, sub.id, founderId],
      );
      await client.query('COMMIT');
      return rows[0].id;
    } finally {
      client.release();
      await pool.end();
    }
  }

  beforeAll(async () => {
    await setApplicationPrices({
      founderHeaders: founderHeaders(),
      applicationId: 'crm',
      prices: [
        { currency: 'RON', kind: 'month', amountMinor: 6900 },
        { currency: 'EUR', kind: 'month', amountMinor: 1400 },
      ],
    });
  });

  it('every way a line is created copies the limits of that day; a later change in Founder, down or up, does not reach it', async () => {
    await crmQuotas(300);
    const { versionId } = await plan(); // the bundle: 1.000 SMS
    // 1. Founder adds the line (also after a request is resolved)
    const a = await business(versionId);
    const { lineId: la } = await addApplicationToSubscription({
      founderHeaders: founderHeaders(),
      organizationId: a,
      applicationId: 'crm',
    });
    // 2. bought from the Hub (core/billing, Lot 3.5), as commercial_rw on app_runtime
    const b = await business(versionId);
    const { lineId: lb } = await activatePurchasedApplication({
      organizationId: b,
      purchaseId: newUuid(),
      applicationId: 'crm',
      currency: 'RON',
      interval: 'month',
      amountMinor: 6900,
    });
    // 3. a line from a request (source `request`)
    const c = await business(versionId);
    const lc = await requestLine(c);

    // Lot 5.7 (GROWTH §2.7): the conversion event, once, in the same transaction as the line —
    // „request” when the team turns it on, „purchase” when bought from the Hub (no amount)
    const activated = await q(
      `SELECT organization_id, payload FROM commercial.outbox_events
        WHERE type = 'commercial.application.activated' AND organization_id = ANY($1::uuid[])`,
      [[a, b]],
    );
    expect(activated).toHaveLength(2);
    expect(activated.find((r) => r.organization_id === a)?.payload).toEqual({
      applicationId: 'crm',
      via: 'request',
    });
    expect(activated.find((r) => r.organization_id === b)?.payload).toEqual({
      applicationId: 'crm',
      via: 'purchase',
    });

    for (const org of [a, b, c]) expect(await sms(org)).toBe(1300);
    const snap = await q(
      `SELECT subscription_application_id AS line, quota_key, limit_value
         FROM commercial.subscription_application_quota
        WHERE subscription_application_id = ANY($1::uuid[]) ORDER BY 1`,
      [[la, lb, lc]],
    );
    expect(snap).toEqual(
      [la, lb, lc].sort().map((line) => ({ line, quota_key: 'messaging.sms', limit_value: '300' })),
    );

    // Founder lowers the limit, then raises it: the existing lines keep theirs (D3-26)
    await crmQuotas(50);
    for (const org of [a, b, c]) expect(await sms(org)).toBe(1300);
    await crmQuotas(900);
    for (const org of [a, b, c]) expect(await sms(org)).toBe(1300);
    // a line created afterwards gets the new one
    const d = await business(versionId);
    await addApplicationToSubscription({
      founderHeaders: founderHeaders(),
      organizationId: d,
      applicationId: 'crm',
    });
    expect(await sms(d)).toBe(1900);
  });

  it('on trial (no line, no contract yet) the limits are read as they are now', async () => {
    await crmQuotas(200);
    const { versionId } = await plan();
    const org = await business(versionId);
    await q(
      `INSERT INTO commercial.trial (organization_id, kind, application_id, source, started_by, ends_at)
       VALUES ($1, 'application', 'crm', 'founder', $2, now() + interval '14 days')`,
      [org, founderId],
    );
    expect(await sms(org)).toBe(1200);
    await crmQuotas(400);
    expect(await sms(org)).toBe(1400);
    expect(
      await q(
        `SELECT 1 FROM commercial.subscription_application_quota WHERE organization_id = $1`,
        [org],
      ),
    ).toEqual([]);
  });

  it('fixed in the database: no UPDATE, no writes for the module roles; one business sees only its own', async () => {
    await crmQuotas(300);
    const { versionId } = await plan();
    const a = await business(versionId);
    const b = await business(versionId);
    const { lineId } = await addApplicationToSubscription({
      founderHeaders: founderHeaders(),
      organizationId: a,
      applicationId: 'crm',
    });
    await expect(
      q(
        `UPDATE commercial.subscription_application_quota SET limit_value = 5000
          WHERE subscription_application_id = $1`,
        [lineId],
      ),
    ).rejects.toThrow(/fixed at its creation/);

    const count = async (c: PoolClient) =>
      Number(
        (
          await c.query(
            `SELECT count(*) AS n FROM commercial.subscription_application_quota
              WHERE subscription_application_id = $1`,
            [lineId],
          )
        ).rows[0].n,
      );
    // its own business sees the line's limits; another business sees nothing (T1/T2)
    await asRole(process.env.DATABASE_URL, 'commercial_rw', a, async (c) => {
      expect(await count(c)).toBe(1);
    });
    await asRole(process.env.DATABASE_URL, 'commercial_rw', b, async (c) => {
      expect(await count(c)).toBe(0);
    });
    await asRole(process.env.DATABASE_URL_FOUNDER, 'commercial_founder', a, async (c) => {
      expect(await count(c)).toBe(1);
    });
    // neither module role writes the snapshot itself: only the trigger does, at creation
    for (const [url, role] of [
      [process.env.DATABASE_URL, 'commercial_rw'],
      [process.env.DATABASE_URL_FOUNDER, 'commercial_founder'],
    ] as const) {
      await asRole(url, role, a, async (c) => {
        await expect(
          c.query(
            `INSERT INTO commercial.subscription_application_quota
               (subscription_application_id, organization_id, quota_key, limit_value)
             VALUES ($1, $2, 'messaging.sms', 1)`,
            [lineId, a],
          ),
        ).rejects.toThrow(/permission denied/);
      });
      await asRole(url, role, a, async (c) => {
        await expect(
          c.query(`UPDATE commercial.subscription_application_quota SET limit_value = 1`),
        ).rejects.toThrow(/permission denied/);
      });
    }
  });
});

describe('Lot 5.7 — the conversion events of a purchase (GROWTH §2.7)', () => {
  it('a pack bought: commercial.addon.purchased once, with the code and the packs, no amount', async () => {
    const { versionId } = await plan();
    const org = await business(versionId);
    const code = `l57-sms-${newUuid().slice(0, 6)}`;
    const { addonId } = await createAddon({
      founderHeaders: founderHeaders(),
      code,
      name: 'SMS în plus',
      quotaKey: 'platform.members',
      quantity: 5,
      validity: 'current_month',
      purchaseMode: 'direct',
      prices: [{ currency: 'RON', amountMinor: 4900, setupMinor: 0 }],
      eligiblePlanIds: [
        (await q(`SELECT plan_id FROM commercial.plan_version WHERE id = $1`, [versionId]))[0]!
          .plan_id,
      ],
    });
    const purchaseId = newUuid();
    const first = await activatePurchasedAddon({
      organizationId: org,
      purchaseId,
      addonId,
      packs: 2,
    });
    const again = await activatePurchasedAddon({
      organizationId: org,
      purchaseId,
      addonId,
      packs: 2,
    });
    expect(first.created).toBe(true);
    expect(again.created).toBe(false);
    const events = await q(
      `SELECT resource_id, payload FROM commercial.outbox_events
        WHERE type = 'commercial.addon.purchased' AND organization_id = $1`,
      [org],
    );
    expect(events).toEqual([
      { resource_id: first.grantId, payload: { purchaseId, addonCode: code, quantity: 2 } },
    ]);
  });
});
