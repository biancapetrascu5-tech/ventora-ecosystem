import type { PoolClient } from 'pg';
import type {
  BillingInterval,
  Currency,
  DiscountDuration,
  DiscountKind,
  InvoicePreview,
  PurchaseMode,
  QuotaKind,
  SubscriptionStatus,
} from '@ventora/contracts';
import { InvalidInput, ResourceNotFound } from '@ventora/errors';
import { requireFounderSession } from '@ventora/identity';
import type { VersionTerms } from './classify';
import { priceOf } from './classify';
import { withFounderModuleRead, withFounderRead } from './db';
import {
  computeEntitlements,
  currentVersionInTx,
  includedMembersInTx,
  previewInvoice,
} from './entitlements';
import { DEFAULT_CURRENCY } from './founder';
import {
  addMonthsAnchored,
  calendarDate,
  nextBillingDate,
  quotaPeriod,
  startOfDay,
} from './period';
import { firstDiscountedInvoice } from './pricing';
import { bigintOrNull, loadVersionTerms } from './terms';

/*
 * Lot 3.4: what the Founder screens read — FounderPlans / FounderPlanEditor, FounderPacks,
 * FounderApps, FounderUsage, FounderDiscounts, FounderBusinesses and the commercial part of
 * FounderBusiness, plus the exceptions that expire within 7 days („Prezentare”, §8.5). Every read:
 * a Founder session with 2FA, then the catalog or one business at a time as commercial_founder
 * (RLS), or — across businesses — the SECURITY DEFINER functions of founder_runtime, which carry
 * no personal data. Nothing here writes; the numbers are the stored ones, nothing is estimated
 * except the date a limit is reached, from the pace of the current period.
 */

type FounderParams = { founderHeaders: Headers };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;
/** FounderUsage / FounderStates: under 7 days of data in the period, the date is „Prea devreme”. */
export const USAGE_ESTIMATE_MIN_DAYS = 7;
/** FounderUsage: a business shows from 80% of a limit (QUOTA_THRESHOLDS). */
export const USAGE_ATTENTION_PCT = 80;
/** „Prezentare” (§8.5): an exception shows 7 days before it expires. */
export const OVERRIDE_NOTICE_DAYS = 7;

function uuid(field: string, value: string): string {
  if (!UUID_RE.test(value ?? '')) throw new InvalidInput(field);
  return value;
}

// ── Plans and versions ─────────────────────────────────────────────────────────────────────

export interface FounderVersionRow {
  id: string;
  number: number;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  terms: VersionTerms;
  /** Businesses whose subscription is on this version now. */
  businesses: number;
  /** The latest published version of its plan: new businesses start on it. */
  current: boolean;
  /** S117: the offer's sale period ('YYYY-MM-DD', null = open). */
  availableFrom: string | null;
  availableUntil: string | null;
}

export interface FounderPlanRow {
  id: string;
  code: string;
  name: string;
  createdAt: Date;
  /** D3-24: „Oprește vânzarea” on the bundle. */
  salesStoppedAt: Date | null;
  versions: FounderVersionRow[];
}

export interface FounderSubscriptionRow {
  organizationId: string;
  subscriptionId: string;
  /** D3-24: the bundle; all null for a subscription of applications à la carte only. */
  planId: string | null;
  planCode: string | null;
  planName: string | null;
  versionId: string | null;
  versionNumber: number | null;
  status: SubscriptionStatus;
  interval: BillingInterval;
  currency: Currency;
  startedOn: string;
  trialEndsAt: Date | null;
  /** The plan's price for the subscription's currency and interval. */
  priceMinor: number | null;
  pendingChange: { effectiveAt: Date; toVersionId: string } | null;
}

async function subscriptions(): Promise<FounderSubscriptionRow[]> {
  return withFounderRead(async (client) => {
    const { rows } = await client.query(
      `SELECT organization_id, subscription_id, plan_id, plan_code, plan_name, plan_version_id,
              version_number, status, interval, currency, started_on::text AS started_on,
              trial_ends_at, price_minor, pending_effective_at, pending_to_version_id
         FROM commercial.founder_list_subscriptions()`,
    );
    return rows.map((r) => ({
      organizationId: r.organization_id,
      subscriptionId: r.subscription_id,
      planId: r.plan_id,
      planCode: r.plan_code,
      planName: r.plan_name,
      versionId: r.plan_version_id,
      versionNumber: r.version_number,
      status: r.status,
      interval: r.interval,
      currency: r.currency,
      startedOn: r.started_on,
      trialEndsAt: r.trial_ends_at,
      priceMinor: bigintOrNull(r.price_minor),
      pendingChange: r.pending_effective_at
        ? { effectiveAt: r.pending_effective_at, toVersionId: r.pending_to_version_id }
        : null,
    }));
  });
}

/** Every live subscription, on the version in effect now (FounderBusinesses, „Mută afaceri”). */
export async function listSubscriptionsForFounder(
  params: FounderParams,
): Promise<FounderSubscriptionRow[]> {
  await requireFounderSession(params.founderHeaders);
  return subscriptions();
}

async function versionRows(
  client: PoolClient,
  where: string,
  args: unknown[],
  counts: Map<string, number>,
): Promise<Array<FounderVersionRow & { planId: string }>> {
  const { rows } = await client.query<{
    id: string;
    plan_id: string;
    version_number: number;
    published_at: Date | null;
    created_at: Date;
    updated_at: Date;
    available_from: string | null;
    available_until: string | null;
  }>(
    `SELECT id, plan_id, version_number, published_at, created_at, updated_at,
            available_from::text AS available_from, available_until::text AS available_until
       FROM commercial.plan_version WHERE ${where} ORDER BY plan_id, version_number`,
    args,
  );
  const latestPublished = new Map<string, number>();
  for (const r of rows) {
    if (r.published_at) {
      latestPublished.set(
        r.plan_id,
        Math.max(latestPublished.get(r.plan_id) ?? 0, r.version_number),
      );
    }
  }
  const out: Array<FounderVersionRow & { planId: string }> = [];
  for (const r of rows) {
    out.push({
      id: r.id,
      planId: r.plan_id,
      number: r.version_number,
      publishedAt: r.published_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      terms: await loadVersionTerms(client, r.id),
      businesses: counts.get(r.id) ?? 0,
      current: !!r.published_at && latestPublished.get(r.plan_id) === r.version_number,
      availableFrom: r.available_from,
      availableUntil: r.available_until,
    });
  }
  return out;
}

const countByVersion = (subs: readonly FounderSubscriptionRow[]) => {
  const m = new Map<string, number>();
  for (const s of subs) if (s.versionId) m.set(s.versionId, (m.get(s.versionId) ?? 0) + 1);
  return m;
};

/** FounderPlans: every plan with its versions — prices, limits, applications, businesses. */
export async function listPlansForFounder(params: FounderParams): Promise<FounderPlanRow[]> {
  await requireFounderSession(params.founderHeaders);
  const counts = countByVersion(await subscriptions());
  return withFounderModuleRead(null, async (client) => {
    const plans = await client.query<{
      id: string;
      code: string;
      name: string;
      created_at: Date;
      sales_stopped_at: Date | null;
    }>(
      `SELECT id, code, name, created_at, sales_stopped_at
         FROM commercial.plan ORDER BY created_at, code`,
    );
    const versions = await versionRows(client, 'true', [], counts);
    return plans.rows.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      createdAt: p.created_at,
      salesStoppedAt: p.sales_stopped_at,
      versions: versions.filter((v) => v.planId === p.id).map(({ planId: _, ...v }) => v),
    }));
  });
}

export interface FounderAddonRow {
  id: string;
  code: string;
  name: string;
  quotaKey: string;
  quantity: number;
  validity: 'current_month' | 'monthly';
  purchaseMode: PurchaseMode;
  salesStoppedAt: Date | null;
  prices: Array<{ currency: Currency; amountMinor: number; setupMinor: number }>;
  eligiblePlanIds: string[];
  /** S117 „Disponibil pentru”: the application of its quota; null = every business (platform). */
  applicationId: string | null;
}

async function addonRows(client: PoolClient): Promise<FounderAddonRow[]> {
  const { rows } = await client.query(
    `SELECT a.id, a.code, a.name, a.quota_key, a.quantity, a.validity, a.purchase_mode,
            a.sales_stopped_at, CASE WHEN ap.is_platform THEN NULL ELSE k.application_id END AS app
       FROM commercial.addon a
       JOIN commercial.quota_key k ON k.key = a.quota_key
       JOIN commercial.application ap ON ap.id = k.application_id
      ORDER BY a.sales_stopped_at NULLS FIRST, a.quota_key, a.quantity, a.code`,
  );
  const prices = await client.query<{
    addon_id: string;
    currency: Currency;
    amount_minor: string;
    setup_minor: string;
  }>(
    `SELECT addon_id, currency, amount_minor, setup_minor FROM commercial.addon_price ORDER BY currency DESC`,
  );
  const plans = await client.query<{ addon_id: string; plan_id: string }>(
    `SELECT addon_id, plan_id FROM commercial.addon_eligible_plan`,
  );
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    quotaKey: r.quota_key,
    quantity: Number(r.quantity),
    validity: r.validity,
    purchaseMode: r.purchase_mode,
    salesStoppedAt: r.sales_stopped_at,
    prices: prices.rows
      .filter((p) => p.addon_id === r.id)
      .map((p) => ({
        currency: p.currency,
        amountMinor: Number(p.amount_minor),
        setupMinor: Number(p.setup_minor),
      })),
    eligiblePlanIds: plans.rows.filter((p) => p.addon_id === r.id).map((p) => p.plan_id),
    applicationId: r.app,
  }));
}

/** FounderPacks: every add-on, its prices in lei and euro, setup, plans, switch, on sale or not. */
export async function listAddonsForFounder(params: FounderParams): Promise<FounderAddonRow[]> {
  await requireFounderSession(params.founderHeaders);
  return withFounderModuleRead(null, addonRows);
}

export interface FounderVersionDetail {
  plan: { id: string; code: string; name: string };
  version: FounderVersionRow;
  /** What the draft is compared with: the current published version of the plan (not itself). */
  base: FounderVersionRow | null;
  /** The businesses on the plan's other versions (they stay there until moved). */
  businessesOnPlan: number;
  /** The add-ons, with the ones the plan can take (eligibility is per plan, for every version). */
  addons: FounderAddonRow[];
}

/** FounderPlanEditor: a version, the one it is compared with, and the add-ons of the plan. */
export async function getPlanVersionForFounder(
  params: FounderParams & { versionId: string },
): Promise<FounderVersionDetail> {
  await requireFounderSession(params.founderHeaders);
  const versionId = uuid('versionId', params.versionId);
  const subs = await subscriptions();
  const counts = countByVersion(subs);
  return withFounderModuleRead(null, async (client) => {
    const plan = await client.query<{ id: string; code: string; name: string }>(
      `SELECT p.id, p.code, p.name FROM commercial.plan p
         JOIN commercial.plan_version v ON v.plan_id = p.id WHERE v.id = $1`,
      [versionId],
    );
    const p = plan.rows[0];
    if (!p) throw new ResourceNotFound('Version not found');
    const versions = await versionRows(client, 'plan_id = $1', [p.id], counts);
    const version = versions.find((v) => v.id === versionId)!;
    const base =
      versions.find((v) => v.current && v.id !== versionId) ??
      [...versions].reverse().find((v) => v.publishedAt && v.number < version.number) ??
      null;
    const strip = (v: FounderVersionRow & { planId: string }): FounderVersionRow => {
      const { planId: _, ...rest } = v;
      return rest;
    };
    return {
      plan: p,
      version: strip(version),
      base: base ? strip(base) : null,
      businessesOnPlan: subs.filter((s) => s.planId === p.id && s.versionId !== versionId).length,
      addons: await addonRows(client),
    };
  });
}

// ── Applications ───────────────────────────────────────────────────────────────────────────

export interface FounderApplicationRow {
  id: string;
  name: string;
  activationMode: PurchaseMode;
  /** Setup (once) and maintenance (monthly / yearly), in lei and euro (D3-24). */
  prices: Array<{ currency: Currency; kind: BillingInterval | 'setup'; amountMinor: number }>;
  /** D3-24: the limits the application includes à la carte (null = unlimited). */
  quotas: Record<string, number | null>;
}

/** FounderApps: the applications a business can add, their prices, setup cost and switch. */
export async function listApplicationsForFounder(
  params: FounderParams,
): Promise<FounderApplicationRow[]> {
  await requireFounderSession(params.founderHeaders);
  return withFounderModuleRead(null, async (client) => {
    const apps = await client.query<{ id: string; name: string; activation_mode: PurchaseMode }>(
      `SELECT id, name, activation_mode FROM commercial.application
        WHERE retired_at IS NULL AND NOT is_platform ORDER BY id`,
    );
    const prices = await client.query<{
      application_id: string;
      currency: Currency;
      kind: BillingInterval | 'setup';
      amount_minor: string;
    }>(`SELECT application_id, currency, kind, amount_minor FROM commercial.application_price`);
    const quotas = await client.query<{
      application_id: string;
      quota_key: string;
      limit_value: string | null;
    }>(`SELECT application_id, quota_key, limit_value FROM commercial.application_quota`);
    return apps.rows.map((a) => ({
      id: a.id,
      name: a.name,
      activationMode: a.activation_mode,
      prices: prices.rows
        .filter((p) => p.application_id === a.id)
        .map((p) => ({ currency: p.currency, kind: p.kind, amountMinor: Number(p.amount_minor) })),
      quotas: Object.fromEntries(
        quotas.rows
          .filter((q) => q.application_id === a.id)
          .map((q) => [q.quota_key, bigintOrNull(q.limit_value)]),
      ),
    }));
  });
}

// ── One business: subscription, usage against limits, exceptions, discounts ───────────────

export type UsageEstimate =
  | { state: 'reached' }
  | { state: 'date'; date: string }
  | { state: 'too_early' }
  /** Not reached at this pace in the period, or a stock below its limit. */
  | { state: 'none' };

export interface FounderQuotaUsage {
  key: string;
  kind: QuotaKind;
  unit: string;
  /** The effective limit (exceptions and add-ons included); null = unlimited. */
  limit: number | null;
  /**
   * D3-24: what the account includes before exceptions and add-ons — the included seats, the
   * bundle and the applications à la carte (null = unlimited).
   */
  planLimit: number | null;
  used: number;
  estimate: UsageEstimate;
}

/**
 * The date a flow limit is reached at the pace of the current period (used so far ÷ days so far),
 * „Prea devreme” under 7 days of data, „Atinsă” at the limit; a stock has no pace.
 */
export function estimateLimitDate(p: {
  kind: QuotaKind;
  used: number;
  limit: number | null;
  periodStart: string;
  periodEnd: string;
  now: Date;
}): UsageEstimate {
  if (p.limit === null) return { state: 'none' };
  if (p.used >= p.limit) return { state: 'reached' };
  if (p.kind === 'stock') return { state: 'none' };
  const elapsed = (p.now.getTime() - startOfDay(p.periodStart).getTime()) / DAY_MS;
  if (elapsed < USAGE_ESTIMATE_MIN_DAYS) return { state: 'too_early' };
  if (p.used <= 0) return { state: 'none' };
  const rate = p.used / elapsed;
  const at = new Date(p.now.getTime() + ((p.limit - p.used) / rate) * DAY_MS);
  const date = calendarDate(at);
  return date < p.periodEnd ? { state: 'date', date } : { state: 'none' };
}

async function quotaUsage(
  client: PoolClient,
  organizationId: string,
  now: Date,
): Promise<{
  quotas: FounderQuotaUsage[];
  applications: string[];
  included: Record<string, number | null>;
  versionId: string | null;
  period: { start: string; end: string } | null;
  sub: Awaited<ReturnType<typeof computeEntitlements>>['entitlements']['subscription'];
}> {
  const { entitlements, versionId, included } = await computeEntitlements(
    client,
    organizationId,
    null,
  );
  const sub = entitlements.subscription;
  const period = sub ? quotaPeriod(sub.startedOn, calendarDate(now)) : null;
  const keys = await client.query<{ key: string; kind: QuotaKind; unit: string }>(
    `SELECT key, kind, unit FROM commercial.quota_key WHERE retired_at IS NULL ORDER BY key`,
  );
  const counters = await client.query<{
    quota_key: string;
    period_start: string | null;
    used: string;
  }>(`SELECT quota_key, period_start::text AS period_start, used FROM commercial.usage_counter`);
  const quotas: FounderQuotaUsage[] = [];
  for (const k of keys.rows) {
    const limit = entitlements.quotas[k.key];
    if (limit === undefined || limit === 0) continue;
    const counter = counters.rows.find(
      (c) =>
        c.quota_key === k.key &&
        (k.kind === 'stock' ? c.period_start === null : c.period_start === period?.start),
    );
    const used = Number(counter?.used ?? 0);
    quotas.push({
      key: k.key,
      kind: k.kind,
      unit: k.unit,
      limit,
      planLimit: included[k.key] ?? null,
      used,
      estimate: period
        ? estimateLimitDate({
            kind: k.kind,
            used,
            limit,
            periodStart: period.start,
            periodEnd: period.end,
            now,
          })
        : { state: 'none' },
    });
  }
  return { quotas, applications: entitlements.applications, included, versionId, period, sub };
}

export interface FounderOverrideRow {
  id: string;
  kind: 'quota' | 'feature';
  quotaKey: string | null;
  featureKey: string | null;
  /** The exception's limit (null = unlimited); null for a feature. */
  limit: number | null;
  /** The version's limit it replaces, for „12 în loc de 10”. */
  planLimit: number | null;
  reason: string;
  expiresAt: Date;
  createdAt: Date;
  createdByFounderId: string;
  extendedAt: Date | null;
  extendedByFounderId: string | null;
}

export interface FounderDiscountRow {
  id: string;
  scope: 'subscription' | 'application' | 'addon';
  lineId: string | null;
  kind: DiscountKind;
  percentOff: number | null;
  amountOffMinor: number | null;
  currency: Currency;
  duration: DiscountDuration;
  durationMonths: number | null;
  /** The last invoice it reaches, for „N luni, până pe {date}” (repeating only). */
  lastInvoiceOn: string | null;
  /** The first invoice it reaches (`once`: the only one). */
  firstInvoiceOn: string;
  reason: string;
  createdAt: Date;
  createdByFounderId: string;
}

export interface FounderLineRow {
  id: string;
  type: 'application' | 'addon';
  /** The application id or the add-on code. */
  key: string;
  name: string;
  amountMinor: number;
  interval: BillingInterval;
}

export interface FounderBusinessCommercial {
  /** D3-2: the business's currency (RON unless Founder set it). */
  currency: Currency;
  subscription: null | {
    id: string;
    /** D3-24: the bundle; all null for applications à la carte only. */
    planId: string | null;
    planCode: string | null;
    planName: string | null;
    versionId: string | null;
    versionNumber: number | null;
    status: SubscriptionStatus;
    interval: BillingInterval;
    currency: Currency;
    priceMinor: number;
    startedOn: string;
    anchorDay: number;
    nextBillingDate: string;
    /** The current monthly period of flow quotas (D3-3), „Consum: 17 oct. – 16 nov.”. */
    quotaPeriod: { start: string; end: string };
    trialEndsAt: string | null;
    pendingChange: { effectiveAt: string; toVersionNumber: number | null } | null;
  };
  applications: string[];
  quotas: FounderQuotaUsage[];
  overrides: FounderOverrideRow[];
  discounts: FounderDiscountRow[];
  lines: FounderLineRow[];
  nextInvoice: InvoicePreview | null;
}

/** FounderBusiness (commercial part) and FounderBusinessBilling, without what needs Stripe (3.5). */
export async function getBusinessCommercialForFounder(
  params: FounderParams & { organizationId: string; now?: Date },
): Promise<FounderBusinessCommercial> {
  await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  const now = params.now ?? new Date();
  return withFounderModuleRead(organizationId, async (client) => {
    const account = await client.query<{ currency: Currency }>(
      `SELECT currency FROM commercial.billing_account`,
    );
    const usage = await quotaUsage(client, organizationId, now);
    const sub = usage.sub;
    const overrides = await client.query(
      `SELECT id, kind, quota_key, feature_key, limit_value, reason, expires_at, created_at,
              created_by_founder_id, extended_at, extended_by_founder_id
         FROM commercial.override
        WHERE ended_at IS NULL AND expires_at > now() ORDER BY expires_at, created_at`,
    );
    const terms = usage.versionId ? await loadVersionTerms(client, usage.versionId) : null;

    let subscription: FounderBusinessCommercial['subscription'] = null;
    let nextInvoice: InvoicePreview | null = null;
    const lines: FounderLineRow[] = [];
    const discounts: FounderDiscountRow[] = [];
    if (sub) {
      // a trial on the whole subscription that has ended includes nothing, but has a version
      const shown = usage.versionId ?? (await currentVersionInTx(client)) ?? sub.planVersionId;
      // D3-24: without a bundle (applications à la carte only) there is no plan to show
      const plan = await client.query<{
        plan_id: string;
        code: string;
        name: string;
        version_number: number;
      }>(
        `SELECT p.id AS plan_id, p.code, p.name, v.version_number
           FROM commercial.plan_version v JOIN commercial.plan p ON p.id = v.plan_id WHERE v.id = $1`,
        [shown],
      );
      const pending = await client.query<{ effective_at: Date; version_number: number | null }>(
        `SELECT c.effective_at, v.version_number FROM commercial.subscription_change c
           LEFT JOIN commercial.plan_version v ON v.id = c.to_version_id
          WHERE c.subscription_id = $1 AND c.canceled_at IS NULL AND c.effective_at > now()
          ORDER BY c.effective_at LIMIT 1`,
        [sub.id],
      );
      const priceTerms = terms ?? (shown ? await loadVersionTerms(client, shown) : null);
      const priceMinor = priceTerms ? (priceOf(priceTerms, sub.currency, sub.interval) ?? 0) : 0;
      const bundle = plan.rows[0] ?? null;
      const today = calendarDate(now);
      const invoiceDate = nextBillingDate(sub, today);
      subscription = {
        id: sub.id,
        planId: bundle?.plan_id ?? null,
        planCode: bundle?.code ?? null,
        planName: bundle?.name ?? null,
        versionId: shown,
        versionNumber: bundle?.version_number ?? null,
        status: sub.status,
        interval: sub.interval,
        currency: sub.currency,
        priceMinor,
        startedOn: sub.startedOn,
        anchorDay: sub.anchorDay,
        nextBillingDate: invoiceDate,
        quotaPeriod: quotaPeriod(sub.startedOn, today),
        trialEndsAt: sub.trialEndsAt,
        pendingChange: pending.rows[0]
          ? {
              effectiveAt: pending.rows[0].effective_at.toISOString(),
              toVersionNumber: pending.rows[0].version_number,
            }
          : null,
      };
      nextInvoice = await previewInvoice(client, sub, {
        planCode: bundle?.code ?? null,
        planPriceMinor: priceMinor,
        invoiceDate,
        at: null,
        now,
      });
      const apps = await client.query<{
        id: string;
        application_id: string;
        name: string;
        amount_minor: string;
        interval: BillingInterval;
      }>(
        `SELECT l.id, l.application_id, a.name, l.amount_minor, l.interval
           FROM commercial.subscription_application l
           JOIN commercial.application a ON a.id = l.application_id
          WHERE l.subscription_id = $1 AND l.ended_at IS NULL ORDER BY a.name`,
        [sub.id],
      );
      for (const a of apps.rows) {
        lines.push({
          id: a.id,
          type: 'application',
          key: a.application_id,
          name: a.name,
          amountMinor: Number(a.amount_minor),
          interval: a.interval,
        });
      }
      const addons = await client.query<{
        id: string;
        code: string;
        name: string;
        amount: string | null;
      }>(
        `SELECT g.id, a.code, a.name, (p.amount_minor * g.packs)::text AS amount
           FROM commercial.addon_grant g
           JOIN commercial.addon a ON a.id = g.addon_id
           LEFT JOIN commercial.addon_price p ON p.addon_id = a.id AND p.currency = $2
          WHERE g.subscription_id = $1 AND g.recurring AND g.ended_at IS NULL
          ORDER BY a.name, g.created_at`,
        [sub.id, sub.currency],
      );
      for (const a of addons.rows) {
        lines.push({
          id: a.id,
          type: 'addon',
          key: a.code,
          name: a.name,
          amountMinor: Number(a.amount ?? 0),
          interval: 'month',
        });
      }
      const ds = await client.query(
        `SELECT id, scope, subscription_application_id, addon_grant_id, kind, percent_off,
                amount_off_minor, currency, duration, duration_months, reason, created_at,
                created_by_founder_id
           FROM commercial.discount WHERE subscription_id = $1 AND ended_at IS NULL
          ORDER BY created_at`,
        [sub.id],
      );
      for (const d of ds.rows) {
        const first = firstDiscountedInvoice(sub, d.created_at);
        discounts.push({
          id: d.id,
          scope: d.scope,
          lineId: d.subscription_application_id ?? d.addon_grant_id ?? null,
          kind: d.kind,
          percentOff: d.percent_off,
          amountOffMinor: bigintOrNull(d.amount_off_minor),
          currency: d.currency,
          duration: d.duration,
          durationMonths: d.duration_months,
          firstInvoiceOn: first,
          lastInvoiceOn:
            d.duration === 'repeating'
              ? addMonthsAnchored(first, (d.duration_months ?? 1) - 1, sub.anchorDay)
              : null,
          reason: d.reason,
          createdAt: d.created_at,
          createdByFounderId: d.created_by_founder_id,
        });
      }
    }

    return {
      currency: account.rows[0]?.currency ?? sub?.currency ?? DEFAULT_CURRENCY,
      subscription,
      applications: usage.applications,
      quotas: usage.quotas,
      overrides: overrides.rows.map((o) => ({
        id: o.id,
        kind: o.kind,
        quotaKey: o.quota_key,
        featureKey: o.feature_key,
        limit: bigintOrNull(o.limit_value),
        planLimit: o.kind === 'quota' ? (usage.included[o.quota_key] ?? null) : null,
        reason: o.reason,
        expiresAt: o.expires_at,
        createdAt: o.created_at,
        createdByFounderId: o.created_by_founder_id,
        extendedAt: o.extended_at,
        extendedByFounderId: o.extended_by_founder_id,
      })),
      discounts,
      lines,
      nextInvoice,
    };
  });
}

// ── Across businesses: usage, discounts, expiring exceptions ──────────────────────────────

export interface FounderBusinessUsage {
  organizationId: string;
  quotas: FounderQuotaUsage[];
  /** The highest share of a limit (%, unlimited quotas left out), null without limits. */
  top: { key: string; pct: number } | null;
}

/**
 * The usage of every business with a subscription, one business per transaction (RLS) —
 * FounderBusinesses („Consum maxim”) and FounderUsage (the businesses above 80%).
 */
export async function listBusinessUsageForFounder(
  params: FounderParams & { now?: Date },
): Promise<FounderBusinessUsage[]> {
  await requireFounderSession(params.founderHeaders);
  const now = params.now ?? new Date();
  const out: FounderBusinessUsage[] = [];
  for (const s of await subscriptions()) {
    const { quotas } = await withFounderModuleRead(s.organizationId, (client) =>
      quotaUsage(client, s.organizationId, now),
    );
    let top: FounderBusinessUsage['top'] = null;
    for (const q of quotas) {
      if (q.limit === null || q.limit <= 0) continue;
      const pct = Math.round((q.used / q.limit) * 100);
      if (!top || pct > top.pct) top = { key: q.key, pct };
    }
    out.push({ organizationId: s.organizationId, quotas, top });
  }
  return out;
}

export interface FounderUsageTotals {
  /** The calendar month so far (platform time zone): „în octombrie, până azi”. */
  from: string;
  to: string;
  /** Per quota key: this month so far, and the same days of the month before. */
  totals: Array<{ key: string; amount: number; previous: number }>;
  /** Per day of the month so far, for one quota (the line chart). */
  daily: Array<{ day: string; amount: number }>;
  /** Add-ons bought this month (Lot 3.5 records the purchases). */
  addonsSold: number;
}

function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** FounderUsage: what was consumed this month across businesses, and the daily series of one key. */
export async function getUsageTotalsForFounder(
  params: FounderParams & { dailyKey: string; now?: Date },
): Promise<FounderUsageTotals> {
  await requireFounderSession(params.founderHeaders);
  const now = params.now ?? new Date();
  const today = calendarDate(now);
  const from = monthStart(today);
  const fromAt = startOfDay(from);
  const prevFrom = startOfDay(addMonthsAnchored(from, -1, 1));
  // the same span of the month before: from its first day, as many days as this month so far
  const prevTo = new Date(prevFrom.getTime() + (now.getTime() - fromAt.getTime()));
  // the month so far ends at the next month's start: the database's clock may run a moment ahead
  const monthEnd = startOfDay(addMonthsAnchored(from, 1, 1));
  return withFounderRead(async (client) => {
    const cur = await client.query<{ quota_key: string; amount: string }>(
      `SELECT * FROM commercial.founder_usage_totals($1, $2)`,
      [fromAt, monthEnd],
    );
    const prev = await client.query<{ quota_key: string; amount: string }>(
      `SELECT * FROM commercial.founder_usage_totals($1, $2)`,
      [prevFrom, prevTo],
    );
    const daily = await client.query<{ day: string; amount: string }>(
      `SELECT day::text AS day, amount FROM commercial.founder_usage_daily($1, $2, $3)`,
      [params.dailyKey, fromAt, monthEnd],
    );
    const sold = await client.query<{ n: string }>(
      `SELECT commercial.founder_addon_grants_count($1, $2) AS n`,
      [fromAt, monthEnd],
    );
    const keys = [...new Set([...cur.rows, ...prev.rows].map((r) => r.quota_key))].sort();
    return {
      from,
      to: today,
      totals: keys.map((key) => ({
        key,
        amount: Number(cur.rows.find((r) => r.quota_key === key)?.amount ?? 0),
        previous: Number(prev.rows.find((r) => r.quota_key === key)?.amount ?? 0),
      })),
      daily: daily.rows.map((d) => ({ day: d.day, amount: Number(d.amount) })),
      addonsSold: Number(sold.rows[0]?.n ?? 0),
    };
  });
}

export interface FounderActiveDiscountRow {
  discountId: string;
  organizationId: string;
  subscriptionId: string;
  scope: 'subscription' | 'application' | 'addon';
  lineId: string | null;
  kind: DiscountKind;
  percentOff: number | null;
  amountOffMinor: number | null;
  currency: Currency;
  duration: DiscountDuration;
  durationMonths: number | null;
  reason: string;
  createdByFounderId: string;
  createdAt: Date;
}

/** „Reduceri”: every active discount across businesses (the page filters the permanent ones). */
export async function listActiveDiscountsForFounder(
  params: FounderParams,
): Promise<FounderActiveDiscountRow[]> {
  await requireFounderSession(params.founderHeaders);
  return withFounderRead(async (client) => {
    const { rows } = await client.query(`SELECT * FROM commercial.founder_list_active_discounts()`);
    return rows.map((r) => ({
      discountId: r.id,
      organizationId: r.organization_id,
      subscriptionId: r.subscription_id,
      scope: r.scope,
      lineId: r.subscription_application_id ?? r.addon_grant_id ?? null,
      kind: r.kind,
      percentOff: r.percent_off,
      amountOffMinor: bigintOrNull(r.amount_off_minor),
      currency: r.currency,
      duration: r.duration,
      durationMonths: r.duration_months,
      reason: r.reason,
      createdByFounderId: r.created_by_founder_id,
      createdAt: r.created_at,
    }));
  });
}

/** The names of the lines a discount is on (an application added, a monthly add-on). */
export async function getDiscountLineNamesForFounder(
  params: FounderParams & { lines: ReadonlyArray<{ organizationId: string; lineId: string }> },
): Promise<Record<string, string>> {
  await requireFounderSession(params.founderHeaders);
  const out: Record<string, string> = {};
  const byOrg = new Map<string, string[]>();
  for (const l of params.lines) {
    byOrg.set(l.organizationId, [...(byOrg.get(l.organizationId) ?? []), uuid('lineId', l.lineId)]);
  }
  for (const [organizationId, ids] of byOrg) {
    await withFounderModuleRead(uuid('organizationId', organizationId), async (client) => {
      const { rows } = await client.query<{ id: string; name: string; type: string }>(
        `SELECT l.id, a.name, 'application' AS type FROM commercial.subscription_application l
           JOIN commercial.application a ON a.id = l.application_id WHERE l.id = ANY($1::uuid[])
         UNION ALL
         SELECT g.id, a.name, 'addon' AS type FROM commercial.addon_grant g
           JOIN commercial.addon a ON a.id = g.addon_id WHERE g.id = ANY($1::uuid[])`,
        [ids],
      );
      for (const r of rows) out[r.id] = r.name;
    });
  }
  return out;
}

export interface FounderExpiringOverride {
  id: string;
  organizationId: string;
  kind: 'quota' | 'feature';
  quotaKey: string | null;
  featureKey: string | null;
  limit: number | null;
  expiresAt: Date;
  createdByFounderId: string;
}

/** „Prezentare” (ARCHITECTURE §8.5): the exceptions that expire within 7 days. */
export async function listExpiringOverridesForFounder(
  params: FounderParams & { withinDays?: number },
): Promise<FounderExpiringOverride[]> {
  await requireFounderSession(params.founderHeaders);
  const until = new Date(Date.now() + (params.withinDays ?? OVERRIDE_NOTICE_DAYS) * DAY_MS);
  return withFounderRead(async (client) => {
    const { rows } = await client.query(`SELECT * FROM commercial.founder_expiring_overrides($1)`, [
      until,
    ]);
    return rows.map((r) => ({
      id: r.id,
      organizationId: r.organization_id,
      kind: r.kind,
      quotaKey: r.quota_key,
      featureKey: r.feature_key,
      limit: bigintOrNull(r.limit_value),
      expiresAt: r.expires_at,
      createdByFounderId: r.created_by_founder_id,
    }));
  });
}

/** D3-24: the seats in the team every account includes (FounderApps / settings). */
export async function getIncludedMembersForFounder(params: FounderParams): Promise<number> {
  await requireFounderSession(params.founderHeaders);
  return withFounderModuleRead(null, (client) => includedMembersInTx(client));
}
