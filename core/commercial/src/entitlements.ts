import type { PoolClient } from 'pg';
import type {
  AddonOffer,
  BillingInterval,
  Currency,
  EffectiveEntitlements,
  EntitlementProvider,
  SubscriptionStatus,
  SubscriptionSummary,
} from '@ventora/contracts';
import { FeatureNotIncluded, InvalidInput } from '@ventora/errors';
import { priceOf } from './classify';
import { withOrganizationRead } from './db';
import { calendarDate, nextBillingDate, quotaPeriod } from './period';
import { bigintOrNull, loadVersionTerms } from './terms';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertOrganizationId(organizationId: string): void {
  if (!UUID_RE.test(organizationId)) throw new InvalidInput('organizationId');
}

type LiveSubscription = NonNullable<EffectiveEntitlements['subscription']>;

/** The subscription that is not canceled (one per business), in the read transaction (RLS). */
async function liveSubscription(client: PoolClient): Promise<LiveSubscription | null> {
  const { rows } = await client.query(
    `SELECT id, plan_version_id, status, interval, currency, started_on::text AS started_on,
            anchor_day, trial_ends_at
       FROM commercial.subscription WHERE canceled_at IS NULL`,
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    planVersionId: r.plan_version_id,
    status: r.status as SubscriptionStatus,
    interval: r.interval as BillingInterval,
    currency: r.currency as Currency,
    startedOn: r.started_on,
    anchorDay: r.anchor_day,
    trialEndsAt: r.trial_ends_at ? (r.trial_ends_at as Date).toISOString() : null,
  };
}

/**
 * The version that applies at `at`: the latest move already in effect (not canceled), else the
 * version the subscription was created on. A move scheduled 30 days ahead takes effect by itself
 * when its time comes, at the next request — no job needed to read it right.
 */
async function versionAt(client: PoolClient, sub: LiveSubscription, at: Date): Promise<string> {
  const { rows } = await client.query<{ to_version_id: string }>(
    `SELECT to_version_id FROM commercial.subscription_change
      WHERE subscription_id = $1 AND canceled_at IS NULL AND effective_at <= $2
      ORDER BY effective_at DESC, created_at DESC LIMIT 1`,
    [sub.id, at],
  );
  return rows[0]?.to_version_id ?? sub.planVersionId;
}

/** A trial on the whole subscription that has ended includes nothing until Lot 3.8 decides. */
function planIncluded(sub: LiveSubscription, at: Date): boolean {
  if (sub.status === 'canceled') return false;
  if (sub.status === 'trialing') return !!sub.trialEndsAt && new Date(sub.trialEndsAt) > at;
  return true;
}

async function computeEntitlements(
  client: PoolClient,
  organizationId: string,
  at: Date,
): Promise<{ entitlements: EffectiveEntitlements; versionId: string | null }> {
  const sub = await liveSubscription(client);
  const versionId = sub && planIncluded(sub, at) ? await versionAt(client, sub, at) : null;
  const terms = versionId
    ? await loadVersionTerms(client, versionId)
    : { applications: [], features: [], quotas: {}, prices: [] };

  const applications = new Set(terms.applications);
  const features = new Set(terms.features);

  // Active trials (D3-5): an application or a feature, for 14 days, without a card
  const trials = await client.query<{ kind: string; application_id: string; feature_key: string }>(
    `SELECT kind, application_id, feature_key FROM commercial.trial
      WHERE ended_at IS NULL AND starts_at <= $1 AND ends_at > $1`,
    [at],
  );
  for (const t of trials.rows) {
    if (t.kind === 'application') applications.add(t.application_id);
    else features.add(t.feature_key);
  }

  // Active exceptions (D-COM-8): a feature turned on, or a limit that replaces the version's
  const overrides = await client.query<{
    kind: string;
    quota_key: string | null;
    feature_key: string | null;
    limit_value: string | null;
  }>(
    `SELECT kind, quota_key, feature_key, limit_value FROM commercial.override
      WHERE ended_at IS NULL AND created_at <= $1 AND expires_at > $1
      ORDER BY created_at`,
    [at],
  );
  const quotaOverrides = new Map<string, number | null>();
  for (const o of overrides.rows) {
    if (o.kind === 'feature') features.add(o.feature_key!);
    else quotaOverrides.set(o.quota_key!, bigintOrNull(o.limit_value)); // the newest wins
  }

  // Active add-ons (D3-7): their capacity adds to the limit
  const grants = await client.query<{ quota_key: string; units: string }>(
    `SELECT a.quota_key, sum(a.quantity * g.packs)::text AS units
       FROM commercial.addon_grant g JOIN commercial.addon a ON a.id = g.addon_id
      WHERE g.ended_at IS NULL AND g.starts_at <= $1 AND (g.ends_at IS NULL OR g.ends_at > $1)
      GROUP BY a.quota_key`,
    [at],
  );
  const extra = new Map(grants.rows.map((g) => [g.quota_key, Number(g.units)]));

  // Every active key of the registry: missing from the version = not included (0)
  const keys = await client.query<{ key: string }>(
    `SELECT key FROM commercial.quota_key WHERE retired_at IS NULL ORDER BY key`,
  );
  const quotas: Record<string, number | null> = {};
  for (const { key } of keys.rows) {
    const base = quotaOverrides.has(key)
      ? quotaOverrides.get(key)!
      : key in terms.quotas
        ? terms.quotas[key]!
        : 0;
    quotas[key] = base === null ? null : base + (extra.get(key) ?? 0);
  }

  return {
    entitlements: {
      organizationId,
      subscription: sub,
      applications: [...applications].sort(),
      features: [...features].sort(),
      quotas,
    },
    versionId,
  };
}

/**
 * ARCHITECTURE §8.5 (L15): the effective entitlements of an organization — the plan version (or
 * the move already in effect) + active add-ons + active exceptions + active trials, `null` =
 * unlimited. One function, read fresh on every call: a change from Founder shows at the next
 * request, without a deploy. `organizationId` comes from authorize() (OrgContext), never from
 * client input.
 */
export async function getEffectiveEntitlements(
  organizationId: string,
  at: Date = new Date(),
): Promise<EffectiveEntitlements> {
  assertOrganizationId(organizationId);
  return withOrganizationRead(organizationId, async (client) => {
    return (await computeEntitlements(client, organizationId, at)).entitlements;
  });
}

/**
 * The real EntitlementProvider for authorize() (step 3): an application is enabled when the
 * effective entitlements include it. Replaces allAppsEnabledProvider outside tests.
 */
export const commercialEntitlementProvider: EntitlementProvider = {
  isEnabled: async (organizationId, applicationId) =>
    (await getEffectiveEntitlements(organizationId)).applications.includes(applicationId),
};

/**
 * ARCHITECTURE §8.1: the feature is in the organization's effective plan, else FeatureNotIncluded.
 * Never consumes a quota. `ctx` is the TenantContext from authorize().
 */
export async function requireFeature(
  ctx: { organizationId: string },
  featureKey: string,
): Promise<void> {
  const { features } = await getEffectiveEntitlements(ctx.organizationId);
  if (!features.includes(featureKey)) throw new FeatureNotIncluded(featureKey);
}

/**
 * The add-ons the organization's plan can take, still on sale, priced in its currency (D3-2):
 * an add-on without a price in that currency is not offered. `purchaseMode` is the add-on's own
 * switch (D3-7); a business without a card or with manual payment sees every one as a request
 * (Lot 3.5 / 3.7 combine it with the payment method).
 */
export async function listAddonsForOrg(organizationId: string): Promise<AddonOffer[]> {
  assertOrganizationId(organizationId);
  return withOrganizationRead(organizationId, async (client) => {
    const sub = await liveSubscription(client);
    if (!sub) return [];
    const versionId = await versionAt(client, sub, new Date());
    const { rows } = await client.query(
      `SELECT a.id, a.code, a.name, a.quota_key, a.quantity, a.validity, a.purchase_mode,
              p.amount_minor, p.setup_minor
         FROM commercial.addon a
         JOIN commercial.addon_price p ON p.addon_id = a.id AND p.currency = $2
         JOIN commercial.addon_eligible_plan e ON e.addon_id = a.id
         JOIN commercial.plan_version v ON v.plan_id = e.plan_id AND v.id = $1
        WHERE a.sales_stopped_at IS NULL
        ORDER BY a.quota_key, a.quantity, a.code`,
      [versionId, sub.currency],
    );
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      quotaKey: r.quota_key,
      quantity: Number(r.quantity),
      validity: r.validity,
      purchaseMode: r.purchase_mode,
      currency: sub.currency,
      priceMinor: Number(r.amount_minor),
      setupMinor: Number(r.setup_minor),
    }));
  });
}

/** HubAdminPlan (Lot 3.7): the subscription, its price, its dates and the limited quotas. */
export async function getSubscriptionSummary(
  organizationId: string,
  at: Date = new Date(),
): Promise<SubscriptionSummary | null> {
  assertOrganizationId(organizationId);
  return withOrganizationRead(organizationId, async (client) => {
    const { entitlements, versionId } = await computeEntitlements(client, organizationId, at);
    const sub = entitlements.subscription;
    if (!sub) return null;
    const shownVersion = versionId ?? (await versionAt(client, sub, at));
    const terms = await loadVersionTerms(client, shownVersion);
    const { rows } = await client.query<{ code: string; name: string; version_number: number }>(
      `SELECT p.code, p.name, v.version_number
         FROM commercial.plan_version v JOIN commercial.plan p ON p.id = v.plan_id
        WHERE v.id = $1`,
      [shownVersion],
    );
    const pending = await client.query<{ effective_at: Date; classification: string }>(
      `SELECT effective_at, classification FROM commercial.subscription_change
        WHERE subscription_id = $1 AND canceled_at IS NULL AND effective_at > $2
        ORDER BY effective_at LIMIT 1`,
      [sub.id, at],
    );
    const today = calendarDate(at);
    return {
      planCode: rows[0]!.code,
      planName: rows[0]!.name,
      versionNumber: rows[0]!.version_number,
      status: sub.status,
      interval: sub.interval,
      currency: sub.currency,
      priceMinor: priceOf(terms, sub.currency, sub.interval) ?? 0,
      startedOn: sub.startedOn,
      nextBillingDate: nextBillingDate(sub, today),
      quotaPeriod: quotaPeriod(sub.startedOn, today),
      trialEndsAt: sub.trialEndsAt,
      pendingChange: pending.rows[0]
        ? {
            effectiveAt: pending.rows[0].effective_at.toISOString(),
            classification: pending.rows[0].classification as 'advantage' | 'disadvantage',
          }
        : null,
      applications: entitlements.applications,
      quotas: Object.entries(entitlements.quotas)
        .filter((e): e is [string, number] => e[1] !== null && e[1] > 0)
        .map(([key, limit]) => ({ key, limit })),
    };
  });
}
