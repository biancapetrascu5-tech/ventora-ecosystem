import type { PoolClient } from 'pg';
import type {
  AddonOffer,
  BillingInterval,
  Currency,
  EffectiveEntitlements,
  EntitlementProvider,
  InvoiceLinePreview,
  InvoicePreview,
  SubscriptionStatus,
  SubscriptionSummary,
} from '@ventora/contracts';
import { discountApplies, priceInvoice, type DiscountTerms } from './pricing';
import { reconcileOrganization } from './quota';
import { FeatureNotIncluded, InvalidInput } from '@ventora/errors';
import { priceOf } from './classify';
import { withOrganizationRead } from './db';
import { calendarDate, nextBillingDate, quotaPeriod } from './period';
import { bigintOrNull, loadVersionTerms } from './terms';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertOrganizationId(organizationId: string): void {
  if (!UUID_RE.test(organizationId)) throw new InvalidInput('organizationId');
}

export type LiveSubscription = NonNullable<EffectiveEntitlements['subscription']>;

/**
 * The instant the entitlements are read at. 
ull = the database's now(): what Founder or a
 * purchase wrote a moment ago counts at once, whatever the app server's clock says (Lot 3.3).
 * A Date is for computing ahead or back (tests, previews).
 */
export type At = Date | null;

/** The subscription that is not canceled (one per business), in the read transaction (RLS). */
export async function liveSubscription(client: PoolClient): Promise<LiveSubscription | null> {
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
async function versionAt(
  client: PoolClient,
  sub: LiveSubscription,
  at: At,
): Promise<string | null> {
  const { rows } = await client.query<{ to_version_id: string }>(
    `SELECT to_version_id FROM commercial.subscription_change
      WHERE subscription_id = $1 AND canceled_at IS NULL AND effective_at <= COALESCE($2::timestamptz, now())
      ORDER BY effective_at DESC, created_at DESC LIMIT 1`,
    [sub.id, at],
  );
  return rows[0]?.to_version_id ?? sub.planVersionId;
}

/**
 * D3-24: the seats every account includes (setting `included_members`, default 3), on top of the
 * bundle's and the add-ons'.
 */
export const DEFAULT_INCLUDED_MEMBERS = 3;
export const MEMBERS_KEY = 'platform.members';

export async function includedMembersInTx(client: PoolClient): Promise<number> {
  const { rows } = await client.query<{ int_value: string }>(
    `SELECT int_value FROM commercial.setting WHERE key = 'included_members'`,
  );
  return rows[0] ? Number(rows[0].int_value) : DEFAULT_INCLUDED_MEMBERS;
}

/** A trial on the whole subscription that has ended includes nothing until Lot 3.8 decides. */
function planIncluded(sub: LiveSubscription, at: At): boolean {
  if (sub.status === 'canceled') return false;
  if (sub.status === 'trialing') {
    return !!sub.trialEndsAt && new Date(sub.trialEndsAt) > (at ?? new Date());
  }
  return true;
}

/**
 * Lot 3.4: the plan version in effect now for the organization of the transaction (RLS), or
 * null without a live subscription — the version a move already applied, not the original one.
 */
export async function currentVersionInTx(client: PoolClient): Promise<string | null> {
  const sub = await liveSubscription(client);
  return sub ? versionAt(client, sub, null) : null;
}

/** Lot 3.3: the same computation inside the caller's transaction (the quota operations). */
export async function computeEntitlementsInTx(
  client: PoolClient,
  organizationId: string,
  at: At,
): Promise<EffectiveEntitlements> {
  return (await computeEntitlements(client, organizationId, at)).entitlements;
}

export async function computeEntitlements(
  client: PoolClient,
  organizationId: string,
  at: At,
): Promise<{
  entitlements: EffectiveEntitlements;
  versionId: string | null;
  /** D3-24: per key, what the account includes before exceptions and add-ons (Founder). */
  included: Record<string, number | null>;
}> {
  const sub = await liveSubscription(client);
  // D3-24: a subscription has a bundle (a plan version), applications à la carte, or both
  const included = !!sub && planIncluded(sub, at);
  const versionId = sub && included ? await versionAt(client, sub, at) : null;
  const terms = versionId
    ? await loadVersionTerms(client, versionId)
    : { applications: [], features: [], quotas: {}, prices: [] };

  const applications = new Set(terms.applications);
  const features = new Set(terms.features);
  /** The applications à la carte whose included limits count (D3-24). */
  const alaCarte = new Set<string>();

  // Applications added to the subscription (D3-9, D3-24): recurring lines, with their limits
  if (sub && included) {
    const lines = await client.query<{ application_id: string }>(
      `SELECT application_id FROM commercial.subscription_application
        WHERE subscription_id = $1 AND ended_at IS NULL AND starts_at <= COALESCE($2::timestamptz, now())`,
      [sub.id, at],
    );
    for (const l of lines.rows) {
      applications.add(l.application_id);
      if (!terms.applications.includes(l.application_id)) alaCarte.add(l.application_id);
    }
  }

  // Active trials (D3-5): an application or a feature, for 14 days, without a card; an
  // application on trial brings its own limits, as one à la carte (D3-24)
  const trials = await client.query<{ kind: string; application_id: string; feature_key: string }>(
    `SELECT kind, application_id, feature_key FROM commercial.trial
      WHERE ended_at IS NULL AND starts_at <= COALESCE($1::timestamptz, now())
        AND ends_at > COALESCE($1::timestamptz, now())`,
    [at],
  );
  for (const t of trials.rows) {
    if (t.kind === 'application') {
      if (!applications.has(t.application_id)) alaCarte.add(t.application_id);
      applications.add(t.application_id);
    } else features.add(t.feature_key);
  }

  // D3-24: the limits each application à la carte includes (null = unlimited)
  const appQuotas = new Map<string, Array<number | null>>();
  if (alaCarte.size > 0) {
    const { rows } = await client.query<{ quota_key: string; limit_value: string | null }>(
      `SELECT quota_key, limit_value FROM commercial.application_quota
        WHERE application_id = ANY($1::text[])`,
      [[...alaCarte]],
    );
    for (const r of rows) {
      appQuotas.set(r.quota_key, [
        ...(appQuotas.get(r.quota_key) ?? []),
        bigintOrNull(r.limit_value),
      ]);
    }
  }
  const includedMembers = await includedMembersInTx(client);

  // Active exceptions (D-COM-8): a feature turned on, or a limit that replaces the version's
  const overrides = await client.query<{
    kind: string;
    quota_key: string | null;
    feature_key: string | null;
    limit_value: string | null;
  }>(
    `SELECT kind, quota_key, feature_key, limit_value FROM commercial.override
      WHERE ended_at IS NULL AND created_at <= COALESCE($1::timestamptz, now())
        AND expires_at > COALESCE($1::timestamptz, now())
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
      WHERE g.ended_at IS NULL AND g.starts_at <= COALESCE($1::timestamptz, now())
        AND (g.ends_at IS NULL OR g.ends_at > COALESCE($1::timestamptz, now()))
      GROUP BY a.quota_key`,
    [at],
  );
  const extra = new Map(grants.rows.map((g) => [g.quota_key, Number(g.units)]));

  // Every active key of the registry (D3-24): the seats every account includes + the bundle's
  // limit + the limits of the applications à la carte (null anywhere = unlimited); an exception
  // replaces that sum; add-ons add on top (D3-22). A key nothing includes is 0.
  const keys = await client.query<{ key: string }>(
    `SELECT key FROM commercial.quota_key WHERE retired_at IS NULL ORDER BY key`,
  );
  const quotas: Record<string, number | null> = {};
  const includedByKey: Record<string, number | null> = {};
  for (const { key } of keys.rows) {
    const parts: Array<number | null> = [
      key === MEMBERS_KEY ? includedMembers : 0,
      key in terms.quotas ? terms.quotas[key]! : 0,
      ...(appQuotas.get(key) ?? []),
    ];
    const included = parts.some((p) => p === null)
      ? null
      : parts.reduce<number>((sum, p) => sum + (p ?? 0), 0);
    includedByKey[key] = included;
    const base = quotaOverrides.has(key) ? quotaOverrides.get(key)! : included;
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
    included: includedByKey,
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
  at?: Date,
): Promise<EffectiveEntitlements> {
  assertOrganizationId(organizationId);
  return withOrganizationRead(organizationId, async (client) => {
    return (await computeEntitlements(client, organizationId, at ?? null)).entitlements;
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
 * S117 („Disponibil pentru”): an add-on is available to a business that has the application of
 * its quota (a key of the platform — members, SMS… — to every business), whatever its bundle.
 * `addon_eligible_plan` (per plan, Lot 3.2) is no longer what decides (raportul 3.4).
 */
export async function addonAvailableInTx(
  client: PoolClient,
  organizationId: string,
  addonId: string,
): Promise<{ validity: string } | null> {
  const { rows } = await client.query<{
    validity: string;
    application_id: string;
    is_platform: boolean;
  }>(
    `SELECT a.validity, k.application_id, ap.is_platform
       FROM commercial.addon a
       JOIN commercial.quota_key k ON k.key = a.quota_key
       JOIN commercial.application ap ON ap.id = k.application_id
      WHERE a.id = $1 AND a.sales_stopped_at IS NULL`,
    [addonId],
  );
  const r = rows[0];
  if (!r) return null;
  if (r.is_platform) return { validity: r.validity };
  const { applications } = await computeEntitlementsInTx(client, organizationId, null);
  return applications.includes(r.application_id) ? { validity: r.validity } : null;
}

/**
 * The add-ons the organization can take (S117: by the application of their quota), still on
 * sale, priced in its currency (D3-2):
 * an add-on without a price in that currency is not offered. `purchaseMode` is the add-on's own
 * switch (D3-7); a business without a card or with manual payment sees every one as a request
 * (Lot 3.5 / 3.7 combine it with the payment method).
 */
export async function listAddonsForOrg(organizationId: string): Promise<AddonOffer[]> {
  assertOrganizationId(organizationId);
  return withOrganizationRead(organizationId, async (client) => {
    const sub = await liveSubscription(client);
    if (!sub) return [];
    const { applications } = await computeEntitlementsInTx(client, organizationId, null);
    const { rows } = await client.query(
      `SELECT a.id, a.code, a.name, a.quota_key, a.quantity, a.validity, a.purchase_mode,
              p.amount_minor, p.setup_minor, k.application_id, ap.is_platform
         FROM commercial.addon a
         JOIN commercial.addon_price p ON p.addon_id = a.id AND p.currency = $1
         JOIN commercial.quota_key k ON k.key = a.quota_key
         JOIN commercial.application ap ON ap.id = k.application_id
        WHERE a.sales_stopped_at IS NULL
        ORDER BY a.quota_key, a.quantity, a.code`,
      [sub.currency],
    );
    return rows
      .filter((r) => r.is_platform || applications.includes(r.application_id))
      .map((r) => ({
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

/**
 * D3-21: the next invoice — the plan, the applications added (D3-9) and, on a monthly
 * subscription, the monthly add-ons (D3-7), each at full price; the discounts that reach that
 * invoice as separate lines; the total. A monthly add-on on a yearly subscription is not on the
 * yearly invoice (Stripe bills one interval per subscription; see the Lot 3.2 report).
 */
export async function previewInvoice(
  client: PoolClient,
  sub: LiveSubscription,
  /** `planCode` null: no bundle, only applications à la carte (D3-24) — no plan line. */
  p: { planCode: string | null; planPriceMinor: number; invoiceDate: string; at: At; now: Date },
): Promise<InvoicePreview> {
  const lines: InvoiceLinePreview[] = p.planCode
    ? [{ kind: 'plan', key: p.planCode, lineId: null, amountMinor: p.planPriceMinor }]
    : [];
  const apps = await client.query<{ id: string; application_id: string; amount_minor: string }>(
    `SELECT id, application_id, amount_minor FROM commercial.subscription_application
      WHERE subscription_id = $1 AND ended_at IS NULL AND interval = $2
      ORDER BY application_id`,
    [sub.id, sub.interval],
  );
  for (const a of apps.rows) {
    lines.push({
      kind: 'application',
      key: a.application_id,
      lineId: a.id,
      amountMinor: Number(a.amount_minor),
    });
  }
  if (sub.interval === 'month') {
    const addons = await client.query<{ id: string; code: string; amount: string | null }>(
      `SELECT g.id, a.code, (p.amount_minor * g.packs)::text AS amount
         FROM commercial.addon_grant g
         JOIN commercial.addon a ON a.id = g.addon_id
         LEFT JOIN commercial.addon_price p ON p.addon_id = a.id AND p.currency = $2
        WHERE g.subscription_id = $1 AND g.recurring AND g.ended_at IS NULL
        ORDER BY a.code, g.created_at`,
      [sub.id, sub.currency],
    );
    for (const a of addons.rows) {
      lines.push({ kind: 'addon', key: a.code, lineId: a.id, amountMinor: Number(a.amount ?? 0) });
    }
  }

  const { rows } = await client.query(
    `SELECT id, scope, subscription_application_id, addon_grant_id, kind, percent_off,
            amount_off_minor, duration, duration_months, created_at, ended_at
       FROM commercial.discount WHERE subscription_id = $1 AND (ended_at IS NULL OR ended_at > COALESCE($2::timestamptz, now()))
      ORDER BY created_at`,
    [sub.id, p.at],
  );
  const discounts: DiscountTerms[] = rows
    .map((r) => ({
      id: r.id,
      scope: r.scope,
      lineId: r.subscription_application_id ?? r.addon_grant_id ?? null,
      kind: r.kind,
      percentOff: r.percent_off,
      amountOffMinor: bigintOrNull(r.amount_off_minor),
      duration: r.duration,
      durationMonths: r.duration_months,
      createdAt: r.created_at,
      endedAt: r.ended_at,
    }))
    .filter((d) => discountApplies(d, sub, p.invoiceDate, p.now));

  return { date: p.invoiceDate, currency: sub.currency, lines, ...priceInvoice(lines, discounts) };
}

/** HubAdminPlan (Lot 3.7): the subscription, its price, its dates and the limited quotas. */
export async function getSubscriptionSummary(
  organizationId: string,
  atArg?: Date,
): Promise<SubscriptionSummary | null> {
  // SQL compares with the database's now() unless an instant is given; calendar dates use the
  // app's clock (they are days, a few ms of skew do not move them)
  const at: At = atArg ?? null;
  const now = atArg ?? new Date();
  assertOrganizationId(organizationId);
  // raportul 3.3: until the job of Lot 4.2, reading the consumption reconciles first
  await reconcileOrganization({ organizationId }, { now: atArg });
  return withOrganizationRead(organizationId, async (client) => {
    const { entitlements, versionId } = await computeEntitlements(client, organizationId, at);
    const sub = entitlements.subscription;
    if (!sub) return null;
    const shownVersion = versionId ?? (await versionAt(client, sub, at));
    const terms = shownVersion
      ? await loadVersionTerms(client, shownVersion)
      : { applications: [], features: [], quotas: {}, prices: [] };
    const { rows } = shownVersion
      ? await client.query<{ code: string; name: string; version_number: number }>(
          `SELECT p.code, p.name, v.version_number
             FROM commercial.plan_version v JOIN commercial.plan p ON p.id = v.plan_id
            WHERE v.id = $1`,
          [shownVersion],
        )
      : { rows: [] as Array<{ code: string; name: string; version_number: number }> };
    const pending = await client.query<{ effective_at: Date; classification: string }>(
      `SELECT effective_at, classification FROM commercial.subscription_change
        WHERE subscription_id = $1 AND canceled_at IS NULL AND effective_at > COALESCE($2::timestamptz, now())
        ORDER BY effective_at LIMIT 1`,
      [sub.id, at],
    );
    const today = calendarDate(now);
    // the consumption of the current monthly period (flow, D3-3) and of the stock counters
    const usage = await client.query<{ quota_key: string; used: string }>(
      `SELECT c.quota_key, c.used FROM commercial.usage_counter c
         JOIN commercial.quota_key k ON k.key = c.quota_key
        WHERE (k.kind = 'stock' AND c.period_start IS NULL)
           OR (k.kind = 'flow' AND c.period_start = $1::date)`,
      [quotaPeriod(sub.startedOn, today).start],
    );
    const usedNow = new Map(usage.rows.map((u) => [u.quota_key, Number(u.used)]));
    const invoiceDate = nextBillingDate(sub, today);
    const priceMinor = priceOf(terms, sub.currency, sub.interval) ?? 0;
    const nextInvoice = await previewInvoice(client, sub, {
      planCode: rows[0]?.code ?? null,
      planPriceMinor: priceMinor,
      invoiceDate,
      at,
      now,
    });
    return {
      planCode: rows[0]?.code ?? null,
      planName: rows[0]?.name ?? null,
      versionNumber: rows[0]?.version_number ?? null,
      status: sub.status,
      interval: sub.interval,
      currency: sub.currency,
      priceMinor,
      nextInvoice,
      startedOn: sub.startedOn,
      nextBillingDate: invoiceDate,
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
        .map(([key, limit]) => ({ key, limit, used: usedNow.get(key) ?? 0 })),
    };
  });
}
