import type { PoolClient } from 'pg';
import type { BillingInterval, Currency, PurchaseMode } from '@ventora/contracts';
import { SubscriptionVersionChangeScheduledV1 } from '@ventora/contracts';
import { Conflict, InvalidInput, ResourceNotFound } from '@ventora/errors';
import {
  AuditActions,
  appendAuditEventInTx,
  type AuditSqlExecutor,
  type AuditTargetType,
} from '@ventora/audit';
import { writeOutboxEvent } from '@ventora/db-kit';
import { requireFounderSession } from '@ventora/identity';
import { classifyChange, priceOf, type ChangeReason, type PriceKind } from './classify';
import { assertKnownKeys } from './contract';
import { withFounderRead, withFounderWrite } from './db';
import { anchorDayOf, calendarDate, quotaPeriod, startOfDay } from './period';
import { loadVersionTerms } from './terms';

/*
 * Lot 3.2: the Founder side of the commercial model — plans, versions, add-ons, the business's
 * currency, subscriptions, moves between versions, add-ons granted, exceptions. Every contract:
 * a Founder session with 2FA (requireFounderSession), checks on the server, then one transaction
 * as commercial_founder on founder_runtime with its audit row (required, §8.5). The hard rules
 * (immutable published versions, 30-day notice, exceptions ≤ 12 months) are also in the
 * database, so they hold whatever calls it. No screen yet: FounderPlans & co. come in Lot 3.4.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE_RE = /^[a-z][a-z0-9-]{0,63}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCIES: readonly Currency[] = ['RON', 'EUR'];
const PRICE_KINDS: readonly PriceKind[] = ['month', 'year', 'setup'];
const DAY_MS = 86_400_000;

/** D-COM-9: a move in the customer's disadvantage is announced at least 30 days ahead. */
export const DISADVANTAGE_NOTICE_DAYS = 30;
/** D-COM-8: an exception lasts at most 12 months from its creation or its last extension. */
export const OVERRIDE_MAX_MONTHS = 12;
/**
 * D3-2: RON for Romania, EUR elsewhere. Organizations have no country yet, so a business whose
 * currency Founder has not set (no billing_account row) is in RON.
 */
export const DEFAULT_CURRENCY: Currency = 'RON';

type FounderParams = { founderHeaders: Headers };

function uuid(field: string, value: string): string {
  if (!UUID_RE.test(value)) throw new InvalidInput(field);
  return value;
}

function text(field: string, value: string, max: number): string {
  const v = value?.trim();
  if (!v || v.length > max) throw new InvalidInput(field);
  return v;
}

function minor(field: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new InvalidInput(field);
  return value;
}

function addMonths(at: Date, months: number): Date {
  const d = new Date(at);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/** Postgres refusals from the triggers and CHECKs, as the errors the screens know. */
function mapDbError(err: unknown, field: string): never {
  const e = err as { code?: string; hint?: string; message?: string };
  if (e.hint === 'published_plan_version_immutable') {
    throw new Conflict('A published version cannot be changed');
  }
  if (e.hint === 'bundle_not_on_sale') {
    throw new InvalidInput('versionId', 'The bundle is not on sale (D3-24)');
  }
  if (e.hint === 'setup_cost_on_request') {
    throw new Conflict('With a setup cost it stays on request (D3-23)');
  }
  if (e.code === '23514' || e.code === 'P0001') throw new InvalidInput(field, e.message);
  if (e.code === '23505') throw new Conflict(e.message);
  throw err;
}

async function audit(
  exec: AuditSqlExecutor,
  founderId: string,
  event: {
    action: string;
    targetType: AuditTargetType;
    targetId: string;
    organizationId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await appendAuditEventInTx(exec, {
    category: 'commercial',
    action: event.action,
    outcome: 'success',
    actorType: 'founder',
    actorId: founderId,
    founderId,
    organizationId: event.organizationId ?? null,
    targetType: event.targetType,
    targetId: event.targetId,
    metadata: event.metadata ?? {},
  });
}

// ── Plans and versions ─────────────────────────────────────────────────────────────────────

export async function createPlan(
  params: FounderParams & { code: string; name: string },
): Promise<{ planId: string }> {
  const founder = await requireFounderSession(params.founderHeaders);
  const code = text('code', params.code, 64);
  if (!CODE_RE.test(code)) throw new InvalidInput('code');
  const name = text('name', params.name, 128);
  return withFounderWrite(null, async (client, exec) => {
    const { rows } = await client
      .query<{ id: string }>(
        `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, $2, $3)
         RETURNING id`,
        [code, name, founder.userId],
      )
      .catch((err) => mapDbError(err, 'code'));
    const planId = rows[0]!.id;
    await audit(exec, founder.userId, {
      action: AuditActions.commercialPlanCreated,
      targetType: 'plan',
      targetId: planId,
      metadata: { code },
    });
    return { planId };
  });
}

export interface VersionTermsInput {
  applications: readonly string[];
  features: readonly string[];
  /** `null` = unlimited; a key left out is not included. */
  quotas: Readonly<Record<string, number | null>>;
  prices: ReadonlyArray<{ currency: Currency; kind: PriceKind; amountMinor: number }>;
}

/** A new draft of the plan, numbered after the last one, optionally copying another version. */
export async function createPlanVersion(
  params: FounderParams & { planId: string; copyFromVersionId?: string },
): Promise<{ versionId: string; versionNumber: number }> {
  const founder = await requireFounderSession(params.founderHeaders);
  const planId = uuid('planId', params.planId);
  const copyFrom = params.copyFromVersionId
    ? uuid('copyFromVersionId', params.copyFromVersionId)
    : null;
  return withFounderWrite(null, async (client, exec) => {
    const plan = await client.query(`SELECT id FROM commercial.plan WHERE id = $1 FOR UPDATE`, [
      planId,
    ]);
    if (!plan.rows[0]) throw new ResourceNotFound('Plan not found');
    const { rows } = await client.query<{ id: string; version_number: number }>(
      `INSERT INTO commercial.plan_version (plan_id, version_number, created_by_founder_id)
       SELECT $1, COALESCE(max(version_number), 0) + 1, $2
         FROM commercial.plan_version WHERE plan_id = $1
       RETURNING id, version_number`,
      [planId, founder.userId],
    );
    const version = rows[0]!;
    if (copyFrom) {
      const source = await client.query(
        `SELECT 1 FROM commercial.plan_version WHERE id = $1 AND plan_id = $2`,
        [copyFrom, planId],
      );
      if (!source.rows[0]) throw new InvalidInput('copyFromVersionId');
      for (const table of [
        ['plan_version_application', 'application_id'],
        ['plan_version_feature', 'feature_key'],
        ['plan_version_quota', 'quota_key, limit_value'],
        ['plan_version_price', 'currency, kind, amount_minor'],
      ] as const) {
        await client.query(
          `INSERT INTO commercial.${table[0]} (plan_version_id, ${table[1]})
           SELECT $1, ${table[1]} FROM commercial.${table[0]} WHERE plan_version_id = $2`,
          [version.id, copyFrom],
        );
      }
    }
    await audit(exec, founder.userId, {
      action: AuditActions.commercialVersionCreated,
      targetType: 'plan_version',
      targetId: version.id,
      metadata: { planId, versionNumber: version.version_number, copyFromVersionId: copyFrom },
    });
    return { versionId: version.id, versionNumber: version.version_number };
  });
}

/**
 * Rewrites a draft's terms: applications, features, limits, prices per currency and kind. Keys
 * are checked against the registry first (assertKnownKeys) and the foreign keys hold them too.
 * A published version is refused by the trigger (Conflict).
 */
export async function updateDraftVersion(
  params: FounderParams & { versionId: string; terms: VersionTermsInput },
): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  const versionId = uuid('versionId', params.versionId);
  const { terms } = params;
  await assertKnownKeys({ features: terms.features, quotas: terms.quotas });
  const seen = new Set<string>();
  for (const p of terms.prices) {
    if (!CURRENCIES.includes(p.currency)) throw new InvalidInput('prices.currency');
    if (!PRICE_KINDS.includes(p.kind)) throw new InvalidInput('prices.kind');
    minor('prices.amountMinor', p.amountMinor);
    const id = `${p.currency}:${p.kind}`;
    if (seen.has(id)) throw new InvalidInput('prices');
    seen.add(id);
  }
  const applications = [...new Set(terms.applications)];

  await withFounderWrite(null, async (client, exec) => {
    const version = await client.query<{ published_at: Date | null }>(
      `SELECT published_at FROM commercial.plan_version WHERE id = $1 FOR UPDATE`,
      [versionId],
    );
    if (!version.rows[0]) throw new ResourceNotFound('Version not found');
    if (version.rows[0].published_at) throw new Conflict('A published version cannot be changed');
    if (applications.length > 0) {
      const apps = await client.query<{ id: string }>(
        `SELECT id FROM commercial.application
          WHERE id = ANY($1::text[]) AND retired_at IS NULL AND NOT is_platform`,
        [applications],
      );
      if (apps.rows.length !== applications.length) throw new InvalidInput('applications');
    }
    try {
      for (const table of [
        'plan_version_application',
        'plan_version_feature',
        'plan_version_quota',
        'plan_version_price',
      ]) {
        await client.query(`DELETE FROM commercial.${table} WHERE plan_version_id = $1`, [
          versionId,
        ]);
      }
      for (const app of applications) {
        await client.query(
          `INSERT INTO commercial.plan_version_application (plan_version_id, application_id)
           VALUES ($1, $2)`,
          [versionId, app],
        );
      }
      for (const key of new Set(terms.features)) {
        await client.query(
          `INSERT INTO commercial.plan_version_feature (plan_version_id, feature_key)
           VALUES ($1, $2)`,
          [versionId, key],
        );
      }
      for (const [key, limit] of Object.entries(terms.quotas)) {
        await client.query(
          `INSERT INTO commercial.plan_version_quota (plan_version_id, quota_key, limit_value)
           VALUES ($1, $2, $3)`,
          [versionId, key, limit],
        );
      }
      for (const p of terms.prices) {
        await client.query(
          `INSERT INTO commercial.plan_version_price (plan_version_id, currency, kind, amount_minor)
           VALUES ($1, $2, $3, $4)`,
          [versionId, p.currency, p.kind, p.amountMinor],
        );
      }
      await client.query(
        `UPDATE commercial.plan_version SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [versionId],
      );
    } catch (err) {
      mapDbError(err, 'terms');
    }
    await audit(exec, founder.userId, {
      action: AuditActions.commercialVersionUpdated,
      targetType: 'plan_version',
      targetId: versionId,
      metadata: {
        applications,
        features: [...new Set(terms.features)],
        quotas: terms.quotas,
        prices: terms.prices,
      },
    });
  });
}

/**
 * Publishing is separate from moving businesses (§8.5). A version needs a monthly price in at
 * least one currency; from now on nothing in it changes (trigger).
 */
export async function publishVersion(params: FounderParams & { versionId: string }): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  const versionId = uuid('versionId', params.versionId);
  await withFounderWrite(null, async (client, exec) => {
    const version = await client.query<{ published_at: Date | null }>(
      `SELECT published_at FROM commercial.plan_version WHERE id = $1 FOR UPDATE`,
      [versionId],
    );
    if (!version.rows[0]) throw new ResourceNotFound('Version not found');
    if (version.rows[0].published_at) throw new Conflict('The version is already published');
    const monthly = await client.query(
      `SELECT 1 FROM commercial.plan_version_price WHERE plan_version_id = $1 AND kind = 'month'`,
      [versionId],
    );
    if (!monthly.rows[0]) throw new InvalidInput('prices', 'A monthly price is required');
    await client.query(
      `UPDATE commercial.plan_version
          SET published_at = CURRENT_TIMESTAMP, published_by_founder_id = $2,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [versionId, founder.userId],
    );
    await audit(exec, founder.userId, {
      action: AuditActions.commercialVersionPublished,
      targetType: 'plan_version',
      targetId: versionId,
    });
  });
}

/** D3-9: „direct / la cerere” on an application (those that need configuration stay on request). */
export async function setApplicationActivationMode(
  params: FounderParams & { applicationId: string; mode: PurchaseMode },
): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  if (params.mode !== 'direct' && params.mode !== 'on_request') throw new InvalidInput('mode');
  await withFounderWrite(null, async (client, exec) => {
    const before = await client.query<{ activation_mode: string }>(
      `SELECT activation_mode FROM commercial.application
        WHERE id = $1 AND retired_at IS NULL AND NOT is_platform`,
      [params.applicationId],
    );
    if (!before.rows[0]) throw new ResourceNotFound('Application not found');
    await client
      .query(`UPDATE commercial.application SET activation_mode = $2 WHERE id = $1`, [
        params.applicationId,
        params.mode,
      ])
      .catch((err) => mapDbError(err, 'mode'));
    await audit(exec, founder.userId, {
      action: AuditActions.commercialApplicationModeChanged,
      targetType: 'application',
      targetId: params.applicationId,
      metadata: { from: before.rows[0].activation_mode, to: params.mode },
    });
  });
}

// ── Add-ons ────────────────────────────────────────────────────────────────────────────────

export interface AddonPriceInput {
  currency: Currency;
  amountMinor: number;
  setupMinor?: number;
}

/** D3-23: an add-on or an application with a setup cost is always on request. */
const hasSetupCost = (prices: ReadonlyArray<{ setupMinor?: number }>) =>
  prices.some((p) => (p.setupMinor ?? 0) > 0);

function checkAddonPrices(prices: readonly AddonPriceInput[]): void {
  const seen = new Set<string>();
  for (const p of prices) {
    if (!CURRENCIES.includes(p.currency)) throw new InvalidInput('prices.currency');
    minor('prices.amountMinor', p.amountMinor);
    minor('prices.setupMinor', p.setupMinor ?? 0);
    if (seen.has(p.currency)) throw new InvalidInput('prices');
    seen.add(p.currency);
  }
}

async function writeAddonPrices(
  client: PoolClient,
  addonId: string,
  prices: readonly AddonPriceInput[],
): Promise<void> {
  await client.query(`DELETE FROM commercial.addon_price WHERE addon_id = $1`, [addonId]);
  for (const p of prices) {
    await client.query(
      `INSERT INTO commercial.addon_price (addon_id, currency, amount_minor, setup_minor)
       VALUES ($1, $2, $3, $4)`,
      [addonId, p.currency, p.amountMinor, p.setupMinor ?? 0],
    );
  }
}

async function writeEligiblePlans(
  client: PoolClient,
  addonId: string,
  planIds: readonly string[],
): Promise<void> {
  await client.query(`DELETE FROM commercial.addon_eligible_plan WHERE addon_id = $1`, [addonId]);
  for (const planId of new Set(planIds)) {
    await client
      .query(`INSERT INTO commercial.addon_eligible_plan (addon_id, plan_id) VALUES ($1, $2)`, [
        addonId,
        uuid('eligiblePlanIds', planId),
      ])
      .catch((err: { code?: string }) => {
        if (err.code === '23503') throw new InvalidInput('eligiblePlanIds');
        throw err;
      });
  }
}

/**
 * An add-on: `quantity` units of one quota, for the current month or monthly (a recurring line of
 * the subscription, D3-7), prices per currency (D3-2), its „direct / la cerere” switch.
 */
export async function createAddon(
  params: FounderParams & {
    code: string;
    name: string;
    quotaKey: string;
    quantity: number;
    validity: 'current_month' | 'monthly';
    purchaseMode: PurchaseMode;
    prices: readonly AddonPriceInput[];
    eligiblePlanIds: readonly string[];
  },
): Promise<{ addonId: string }> {
  const founder = await requireFounderSession(params.founderHeaders);
  const code = text('code', params.code, 64);
  if (!CODE_RE.test(code)) throw new InvalidInput('code');
  const name = text('name', params.name, 128);
  if (!Number.isSafeInteger(params.quantity) || params.quantity <= 0) {
    throw new InvalidInput('quantity');
  }
  if (params.validity !== 'current_month' && params.validity !== 'monthly') {
    throw new InvalidInput('validity');
  }
  if (params.purchaseMode !== 'direct' && params.purchaseMode !== 'on_request') {
    throw new InvalidInput('purchaseMode');
  }
  checkAddonPrices(params.prices);
  if (params.purchaseMode === 'direct' && hasSetupCost(params.prices)) {
    throw new InvalidInput('purchaseMode', 'With a setup cost it stays on request (D3-23)');
  }
  await assertKnownKeys({ quotas: { [params.quotaKey]: params.quantity } });

  return withFounderWrite(null, async (client, exec) => {
    const { rows } = await client
      .query<{ id: string }>(
        `INSERT INTO commercial.addon
           (code, name, quota_key, quantity, validity, purchase_mode, created_by_founder_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          code,
          name,
          params.quotaKey,
          params.quantity,
          params.validity,
          params.purchaseMode,
          founder.userId,
        ],
      )
      .catch((err) => mapDbError(err, 'code'));
    const addonId = rows[0]!.id;
    await writeAddonPrices(client, addonId, params.prices).catch((err) =>
      mapDbError(err, 'prices'),
    );
    await writeEligiblePlans(client, addonId, params.eligiblePlanIds);
    await audit(exec, founder.userId, {
      action: AuditActions.commercialAddonCreated,
      targetType: 'addon',
      targetId: addonId,
      metadata: {
        code,
        quotaKey: params.quotaKey,
        quantity: params.quantity,
        validity: params.validity,
        purchaseMode: params.purchaseMode,
        prices: params.prices,
        eligiblePlanIds: params.eligiblePlanIds,
      },
    });
    return { addonId };
  });
}

/**
 * FounderPacks (3.4) is the only place for add-on prices; each change is audited. A setup cost
 * puts the add-on on request (D3-23): asked for together with „direct”, it is refused; with prices
 * that add one to a direct add-on, the switch moves to „la cerere” in the same transaction (in the
 * audit row). `validity` („Se plătește”): the add-ons already granted keep theirs.
 */
export async function updateAddon(
  params: FounderParams & {
    addonId: string;
    name?: string;
    purchaseMode?: PurchaseMode;
    validity?: 'current_month' | 'monthly';
    prices?: readonly AddonPriceInput[];
    eligiblePlanIds?: readonly string[];
  },
): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  const addonId = uuid('addonId', params.addonId);
  const name = params.name === undefined ? undefined : text('name', params.name, 128);
  if (
    params.purchaseMode !== undefined &&
    params.purchaseMode !== 'direct' &&
    params.purchaseMode !== 'on_request'
  ) {
    throw new InvalidInput('purchaseMode');
  }
  if (
    params.validity !== undefined &&
    params.validity !== 'current_month' &&
    params.validity !== 'monthly'
  ) {
    throw new InvalidInput('validity');
  }
  if (params.prices) checkAddonPrices(params.prices);
  if (params.purchaseMode === 'direct' && params.prices && hasSetupCost(params.prices)) {
    throw new InvalidInput('purchaseMode', 'With a setup cost it stays on request (D3-23)');
  }
  await withFounderWrite(null, async (client, exec) => {
    const found = await client.query<{ purchase_mode: PurchaseMode }>(
      `SELECT purchase_mode FROM commercial.addon WHERE id = $1 FOR UPDATE`,
      [addonId],
    );
    if (!found.rows[0]) throw new ResourceNotFound('Add-on not found');
    const forcedOnRequest =
      params.purchaseMode === undefined &&
      found.rows[0].purchase_mode === 'direct' &&
      !!params.prices &&
      hasSetupCost(params.prices);
    const mode = forcedOnRequest ? 'on_request' : (params.purchaseMode ?? null);
    await client
      .query(
        `UPDATE commercial.addon
            SET name = COALESCE($2, name), purchase_mode = COALESCE($3, purchase_mode),
                validity = COALESCE($4, validity), updated_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [addonId, name ?? null, mode, params.validity ?? null],
      )
      .catch((err) => mapDbError(err, 'purchaseMode'));
    if (params.prices) {
      await writeAddonPrices(client, addonId, params.prices).catch((err) =>
        mapDbError(err, 'prices'),
      );
    }
    if (params.eligiblePlanIds) await writeEligiblePlans(client, addonId, params.eligiblePlanIds);
    await audit(exec, founder.userId, {
      action: AuditActions.commercialAddonUpdated,
      targetType: 'addon',
      targetId: addonId,
      metadata: {
        name,
        purchaseMode: mode ?? undefined,
        purchaseModeForcedBySetup: forcedOnRequest || undefined,
        validity: params.validity,
        prices: params.prices,
        eligiblePlanIds: params.eligiblePlanIds,
      },
    });
  });
}

/** „Oprește vânzarea”: no new purchases; the add-ons already granted stay. */
export async function stopAddonSales(params: FounderParams & { addonId: string }): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  const addonId = uuid('addonId', params.addonId);
  await withFounderWrite(null, async (client, exec) => {
    const { rowCount } = await client.query(
      `UPDATE commercial.addon SET sales_stopped_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND sales_stopped_at IS NULL`,
      [addonId],
    );
    if (!rowCount) throw new Conflict('The add-on is not on sale');
    await audit(exec, founder.userId, {
      action: AuditActions.commercialAddonSalesStopped,
      targetType: 'addon',
      targetId: addonId,
    });
  });
}

// ── A business: currency, subscription, moves, add-ons, exceptions ─────────────────────────

async function businessCurrency(client: PoolClient): Promise<Currency> {
  const { rows } = await client.query<{ currency: Currency }>(
    `SELECT currency FROM commercial.billing_account`,
  );
  return rows[0]?.currency ?? DEFAULT_CURRENCY;
}

type FounderLiveSubscription = {
  id: string;
  plan_version_id: string | null;
  interval: BillingInterval;
  currency: Currency;
  started_on: string;
};

async function liveSubscriptionForUpdate(
  client: PoolClient,
): Promise<FounderLiveSubscription | null> {
  const { rows } = await client.query<FounderLiveSubscription>(
    `SELECT id, plan_version_id, interval, currency, started_on::text AS started_on
       FROM commercial.subscription WHERE canceled_at IS NULL FOR UPDATE`,
  );
  return rows[0] ?? null;
}

/** The version in effect now (the latest move already in effect, else the subscription's own). */
async function currentVersion(
  client: PoolClient,
  sub: FounderLiveSubscription,
): Promise<string | null> {
  const { rows } = await client.query<{ to_version_id: string }>(
    `SELECT to_version_id FROM commercial.subscription_change
      WHERE subscription_id = $1 AND canceled_at IS NULL AND effective_at <= now()
      ORDER BY effective_at DESC, created_at DESC LIMIT 1`,
    [sub.id],
  );
  return rows[0]?.to_version_id ?? sub.plan_version_id;
}

/**
 * D3-2: the business's currency, from Founder (RON for Romania, EUR elsewhere). It cannot change
 * under a live subscription in the other currency: its prices and invoices are in that one.
 */
export async function setBusinessCurrency(
  params: FounderParams & { organizationId: string; currency: Currency },
): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  if (!CURRENCIES.includes(params.currency)) throw new InvalidInput('currency');
  await withFounderWrite(organizationId, async (client, exec) => {
    const sub = await liveSubscriptionForUpdate(client);
    if (sub && sub.currency !== params.currency) {
      throw new Conflict('The business has a live subscription in another currency');
    }
    await client.query(
      `INSERT INTO commercial.billing_account (organization_id, currency, set_by_founder_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (organization_id) DO UPDATE
         SET currency = EXCLUDED.currency, set_by_founder_id = EXCLUDED.set_by_founder_id,
             updated_at = CURRENT_TIMESTAMP`,
      [organizationId, params.currency, founder.userId],
    );
    await audit(exec, founder.userId, {
      action: AuditActions.commercialCurrencySet,
      targetType: 'billing_account',
      targetId: organizationId,
      organizationId,
      metadata: { currency: params.currency },
    });
  });
}

/**
 * Puts a business on a published version, monthly or yearly, in the business's currency. The
 * version must have the price of that currency and interval (D3-2: no conversion). The anchor
 * day is the start day (D3-3). `trialEndsAt`: a trial on the whole subscription, only from
 * Founder (D3-5). D3-24: `versionId` (the bundle) is optional — without it the subscription holds
 * only applications à la carte (addApplicationToSubscription); a bundle sells only in its sale
 * period and while its sales are not stopped (checked in the database too).
 */
export async function assignSubscription(
  params: FounderParams & {
    organizationId: string;
    versionId?: string | null;
    interval: BillingInterval;
    /** 'YYYY-MM-DD', default today (platform time zone). */
    startedOn?: string;
    trialEndsAt?: Date;
  },
): Promise<{ subscriptionId: string }> {
  const founder = await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  const versionId = params.versionId ? uuid('versionId', params.versionId) : null;
  if (params.interval !== 'month' && params.interval !== 'year') {
    throw new InvalidInput('interval');
  }
  const startedOn = params.startedOn ?? calendarDate(new Date());
  if (!DATE_RE.test(startedOn)) throw new InvalidInput('startedOn');
  if (params.trialEndsAt && !(params.trialEndsAt.getTime() > Date.now())) {
    throw new InvalidInput('trialEndsAt');
  }

  return withFounderWrite(organizationId, async (client, exec) => {
    const currency = await businessCurrency(client);
    if (versionId) {
      const version = await client.query<{ published_at: Date | null }>(
        `SELECT published_at FROM commercial.plan_version WHERE id = $1`,
        [versionId],
      );
      if (!version.rows[0]) throw new ResourceNotFound('Version not found');
      if (!version.rows[0].published_at) throw new InvalidInput('versionId', 'Not published');
      const terms = await loadVersionTerms(client, versionId);
      if (priceOf(terms, currency, params.interval) === null) {
        throw new InvalidInput(
          'versionId',
          `The version has no ${params.interval} price in ${currency}`,
        );
      }
    }
    if (await liveSubscriptionForUpdate(client)) {
      throw new Conflict('The business already has a subscription');
    }
    const { rows } = await client
      .query<{ id: string }>(
        `INSERT INTO commercial.subscription
           (organization_id, plan_version_id, interval, currency, started_on, anchor_day, status,
            trial_ends_at, created_by_founder_id)
         VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9) RETURNING id`,
        [
          organizationId,
          versionId,
          params.interval,
          currency,
          startedOn,
          anchorDayOf(startedOn),
          params.trialEndsAt ? 'trialing' : 'active',
          params.trialEndsAt ?? null,
          founder.userId,
        ],
      )
      .catch((err) => mapDbError(err, 'subscription'));
    const subscriptionId = rows[0]!.id;
    await audit(exec, founder.userId, {
      action: AuditActions.commercialSubscriptionAssigned,
      targetType: 'subscription',
      targetId: subscriptionId,
      organizationId,
      metadata: {
        versionId,
        interval: params.interval,
        currency,
        startedOn,
        trialEndsAt: params.trialEndsAt?.toISOString() ?? null,
      },
    });
    return { subscriptionId };
  });
}

export interface ScheduledChange {
  organizationId: string;
  subscriptionChangeId: string;
  classification: 'advantage' | 'disadvantage';
  effectiveAt: Date;
  reasons: ChangeReason[];
}

/**
 * §8.5: moves businesses to another published version — a separate action from publishing.
 * Each move is classified automatically for that subscription's currency and interval; Founder
 * cannot choose it. In the customer's advantage: applies now (or at `effectiveAt`). In their
 * disadvantage: only at least 30 days ahead (D-COM-9) — refused otherwise, for every business,
 * before anything is written; the database refuses it too. The announcement leaves through the
 * outbox (subscription.version_change_scheduled), delivered by core/notifications in F4.
 */
export async function scheduleVersionChange(
  params: FounderParams & {
    organizationIds: readonly string[];
    toVersionId: string;
    effectiveAt?: Date;
  },
): Promise<ScheduledChange[]> {
  const founder = await requireFounderSession(params.founderHeaders);
  const toVersionId = uuid('toVersionId', params.toVersionId);
  const organizationIds = [...new Set(params.organizationIds)].map((id) =>
    uuid('organizationIds', id),
  );
  if (organizationIds.length === 0) throw new InvalidInput('organizationIds');
  const now = Date.now();
  if (params.effectiveAt && params.effectiveAt.getTime() < now - 60_000) {
    throw new InvalidInput('effectiveAt', 'In the past');
  }

  // First pass, read only: classify every move; one refusal stops them all.
  const planned: Array<
    Omit<ScheduledChange, 'subscriptionChangeId'> & {
      sub: FounderLiveSubscription;
      fromVersionId: string;
    }
  > = [];
  for (const organizationId of organizationIds) {
    planned.push(
      await withFounderWrite(organizationId, async (client) => {
        const sub = await liveSubscriptionForUpdate(client);
        if (!sub) throw new InvalidInput('organizationIds', 'A business has no subscription');
        const version = await client.query<{ published_at: Date | null }>(
          `SELECT published_at FROM commercial.plan_version WHERE id = $1`,
          [toVersionId],
        );
        if (!version.rows[0]) throw new ResourceNotFound('Version not found');
        if (!version.rows[0].published_at) throw new InvalidInput('toVersionId', 'Not published');
        const fromVersionId = await currentVersion(client, sub);
        // D3-24: a subscription of applications à la carte only has no bundle to move from
        if (!fromVersionId) {
          throw new InvalidInput('organizationIds', 'A business has no bundle to move');
        }
        if (fromVersionId === toVersionId) {
          throw new InvalidInput('toVersionId', 'A business is already on this version');
        }
        const pending = await client.query(
          `SELECT 1 FROM commercial.subscription_change
            WHERE subscription_id = $1 AND canceled_at IS NULL AND effective_at > now()`,
          [sub.id],
        );
        if (pending.rows[0]) throw new Conflict('A business already has a move scheduled');
        const to = await loadVersionTerms(client, toVersionId);
        if (priceOf(to, sub.currency, sub.interval) === null) {
          throw new InvalidInput(
            'toVersionId',
            `The version has no ${sub.interval} price in ${sub.currency}`,
          );
        }
        const from = await loadVersionTerms(client, fromVersionId);
        const { classification, reasons } = classifyChange(from, to, {
          currency: sub.currency,
          interval: sub.interval,
        });
        const effectiveAt =
          params.effectiveAt ??
          (classification === 'disadvantage'
            ? new Date(now + DISADVANTAGE_NOTICE_DAYS * DAY_MS + 60_000)
            : new Date(now));
        if (
          classification === 'disadvantage' &&
          effectiveAt.getTime() < now + DISADVANTAGE_NOTICE_DAYS * DAY_MS
        ) {
          throw new InvalidInput(
            'effectiveAt',
            `A move in the customer's disadvantage needs at least ${DISADVANTAGE_NOTICE_DAYS} days' notice`,
          );
        }
        return { organizationId, classification, reasons, effectiveAt, sub, fromVersionId };
      }),
    );
  }

  // Second pass: one transaction per business (RLS), each with its event and audit row.
  const out: ScheduledChange[] = [];
  for (const p of planned) {
    out.push(
      await withFounderWrite(p.organizationId, async (client, exec) => {
        const { rows } = await client
          .query<{ id: string }>(
            `INSERT INTO commercial.subscription_change
               (subscription_id, organization_id, from_version_id, to_version_id, classification,
                effective_at, created_by_founder_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [
              p.sub.id,
              p.organizationId,
              p.fromVersionId,
              toVersionId,
              p.classification,
              p.effectiveAt,
              founder.userId,
            ],
          )
          .catch((err) => mapDbError(err, 'effectiveAt'));
        const subscriptionChangeId = rows[0]!.id;
        await writeOutboxEvent(client, 'commercial', SubscriptionVersionChangeScheduledV1, {
          organizationId: p.organizationId,
          sourceApp: SubscriptionVersionChangeScheduledV1.sourceApp,
          resourceId: subscriptionChangeId,
          payload: {
            subscriptionChangeId,
            subscriptionId: p.sub.id,
            fromVersionId: p.fromVersionId,
            toVersionId,
            classification: p.classification,
            effectiveAt: p.effectiveAt.toISOString(),
          },
        });
        await audit(exec, founder.userId, {
          action: AuditActions.commercialVersionChangeScheduled,
          targetType: 'subscription_change',
          targetId: subscriptionChangeId,
          organizationId: p.organizationId,
          metadata: {
            fromVersionId: p.fromVersionId,
            toVersionId,
            classification: p.classification,
            effectiveAt: p.effectiveAt.toISOString(),
            reasons: p.reasons,
          },
        });
        return {
          organizationId: p.organizationId,
          subscriptionChangeId,
          classification: p.classification,
          effectiveAt: p.effectiveAt,
          reasons: p.reasons,
        };
      }),
    );
  }
  return out;
}

/**
 * An add-on granted by Founder (a gift, or a request handled). Monthly: a recurring line of the
 * live subscription (D3-7). Current month: until the next monthly reset (D3-3). The add-on must
 * be eligible for the subscription's plan.
 */
export async function grantAddon(
  params: FounderParams & { organizationId: string; addonId: string; packs?: number },
): Promise<{ grantId: string }> {
  const founder = await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  const addonId = uuid('addonId', params.addonId);
  const packs = params.packs ?? 1;
  if (!Number.isSafeInteger(packs) || packs <= 0) throw new InvalidInput('packs');

  return withFounderWrite(organizationId, async (client, exec) => {
    const sub = await liveSubscriptionForUpdate(client);
    if (!sub) throw new InvalidInput('organizationId', 'The business has no subscription');
    const version = await currentVersion(client, sub);
    if (!version) throw new InvalidInput('addonId', 'Add-ons are eligible per bundle (D3-24)');
    const addon = await client.query<{ validity: string }>(
      `SELECT a.validity FROM commercial.addon a
         JOIN commercial.addon_eligible_plan e ON e.addon_id = a.id
         JOIN commercial.plan_version v ON v.plan_id = e.plan_id AND v.id = $2
        WHERE a.id = $1`,
      [addonId, version],
    );
    if (!addon.rows[0]) throw new InvalidInput('addonId', 'Not available on this plan');
    const recurring = addon.rows[0].validity === 'monthly';
    const endsAt = recurring
      ? null
      : startOfDay(quotaPeriod(sub.started_on, calendarDate(new Date())).end);
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO commercial.addon_grant
         (organization_id, addon_id, subscription_id, packs, recurring, source, ends_at,
          created_by_founder_id)
       VALUES ($1, $2, $3, $4, $5, 'founder', $6, $7) RETURNING id`,
      [
        organizationId,
        addonId,
        recurring ? sub.id : null,
        packs,
        recurring,
        endsAt,
        founder.userId,
      ],
    );
    const grantId = rows[0]!.id;
    await audit(exec, founder.userId, {
      action: AuditActions.commercialAddonGranted,
      targetType: 'addon_grant',
      targetId: grantId,
      organizationId,
      metadata: { addonId, packs, recurring, endsAt: endsAt?.toISOString() ?? null },
    });
    return { grantId };
  });
}

export async function endAddonGrant(
  params: FounderParams & { organizationId: string; grantId: string },
): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  const grantId = uuid('grantId', params.grantId);
  await withFounderWrite(organizationId, async (client, exec) => {
    const { rowCount } = await client.query(
      `UPDATE commercial.addon_grant SET ended_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND ended_at IS NULL`,
      [grantId],
    );
    if (!rowCount) throw new ResourceNotFound('Active add-on not found');
    await audit(exec, founder.userId, {
      action: AuditActions.commercialAddonGrantEnded,
      targetType: 'addon_grant',
      targetId: grantId,
      organizationId,
    });
  });
}

function checkOverrideExpiry(expiresAt: Date | undefined): Date {
  if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())) {
    throw new InvalidInput('expiresAt', 'An exception needs an end date');
  }
  const now = new Date();
  if (expiresAt <= now) throw new InvalidInput('expiresAt', 'The end date is in the past');
  if (expiresAt > addMonths(now, OVERRIDE_MAX_MONTHS)) {
    throw new InvalidInput('expiresAt', `An exception lasts at most ${OVERRIDE_MAX_MONTHS} months`);
  }
  return expiresAt;
}

/**
 * „Adaugă o excepție” (D-COM-8): a limit that replaces the plan's (null = unlimited; add-ons add on
 * top) or a feature turned on, with a reason and an end date at most 12 months away — required,
 * here and in the database.
 */
export async function createOverride(
  params: FounderParams & {
    organizationId: string;
    reason: string;
    expiresAt: Date;
  } & (
      | { kind: 'quota'; quotaKey: string; limit: number | null }
      | { kind: 'feature'; featureKey: string }
    ),
): Promise<{ overrideId: string }> {
  const founder = await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  const reason = text('reason', params.reason, 2000);
  const expiresAt = checkOverrideExpiry(params.expiresAt);
  if (params.kind === 'quota') {
    await assertKnownKeys({ quotas: { [params.quotaKey]: params.limit } });
  } else if (params.kind === 'feature') {
    await assertKnownKeys({ features: [params.featureKey] });
  } else {
    throw new InvalidInput('kind');
  }

  return withFounderWrite(organizationId, async (client, exec) => {
    const { rows } = await client
      .query<{ id: string }>(
        `INSERT INTO commercial.override
           (organization_id, kind, quota_key, feature_key, limit_value, reason,
            created_by_founder_id, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [
          organizationId,
          params.kind,
          params.kind === 'quota' ? params.quotaKey : null,
          params.kind === 'feature' ? params.featureKey : null,
          params.kind === 'quota' ? params.limit : null,
          reason,
          founder.userId,
          expiresAt,
        ],
      )
      .catch((err) => mapDbError(err, 'expiresAt'));
    const overrideId = rows[0]!.id;
    await audit(exec, founder.userId, {
      action: AuditActions.commercialOverrideCreated,
      targetType: 'override',
      targetId: overrideId,
      organizationId,
      metadata: {
        kind: params.kind,
        key: params.kind === 'quota' ? params.quotaKey : params.featureKey,
        limit: params.kind === 'quota' ? params.limit : null,
        expiresAt: expiresAt.toISOString(),
      },
    });
    return { overrideId };
  });
}

/** The explicit, audited extension (D-COM-8): again at most 12 months from now. */
export async function extendOverride(
  params: FounderParams & { organizationId: string; overrideId: string; expiresAt: Date },
): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  const overrideId = uuid('overrideId', params.overrideId);
  const expiresAt = checkOverrideExpiry(params.expiresAt);
  await withFounderWrite(organizationId, async (client, exec) => {
    const before = await client.query<{ expires_at: Date }>(
      `SELECT expires_at FROM commercial.override WHERE id = $1 AND ended_at IS NULL FOR UPDATE`,
      [overrideId],
    );
    if (!before.rows[0]) throw new ResourceNotFound('Active exception not found');
    await client
      .query(
        `UPDATE commercial.override SET expires_at = $2, extended_by_founder_id = $3 WHERE id = $1`,
        [overrideId, expiresAt, founder.userId],
      )
      .catch((err) => mapDbError(err, 'expiresAt'));
    await audit(exec, founder.userId, {
      action: AuditActions.commercialOverrideExtended,
      targetType: 'override',
      targetId: overrideId,
      organizationId,
      metadata: {
        from: before.rows[0].expires_at.toISOString(),
        to: expiresAt.toISOString(),
      },
    });
  });
}

/** An exception ends; it stays in the history (never deleted). */
export async function endOverride(
  params: FounderParams & { organizationId: string; overrideId: string },
): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  const overrideId = uuid('overrideId', params.overrideId);
  await withFounderWrite(organizationId, async (client, exec) => {
    const { rowCount } = await client.query(
      `UPDATE commercial.override SET ended_at = CURRENT_TIMESTAMP, ended_by_founder_id = $2
        WHERE id = $1 AND ended_at IS NULL`,
      [overrideId, founder.userId],
    );
    if (!rowCount) throw new ResourceNotFound('Active exception not found');
    await audit(exec, founder.userId, {
      action: AuditActions.commercialOverrideEnded,
      targetType: 'override',
      targetId: overrideId,
      organizationId,
    });
  });
}

// ── D3-21: applications added to a subscription, discounts ──────────────────────────────────

/**
 * The price of an application added to a subscription (D3-9), per currency and interval, and its
 * setup cost (`setup`, FounderApps, S113). A setup cost keeps the application on request (D3-23):
 * a direct application moves to „la cerere” in the same transaction (in the audit row).
 */
export async function setApplicationPrices(
  params: FounderParams & {
    applicationId: string;
    prices: ReadonlyArray<{
      currency: Currency;
      kind: BillingInterval | 'setup';
      amountMinor: number;
    }>;
  },
): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  const seen = new Set<string>();
  for (const p of params.prices) {
    if (!CURRENCIES.includes(p.currency)) throw new InvalidInput('prices.currency');
    if (p.kind !== 'month' && p.kind !== 'year' && p.kind !== 'setup') {
      throw new InvalidInput('prices.kind');
    }
    minor('prices.amountMinor', p.amountMinor);
    if (seen.has(`${p.currency}:${p.kind}`)) throw new InvalidInput('prices');
    seen.add(`${p.currency}:${p.kind}`);
  }
  const setup = params.prices.some((p) => p.kind === 'setup' && p.amountMinor > 0);
  await withFounderWrite(null, async (client, exec) => {
    const app = await client.query<{ activation_mode: PurchaseMode }>(
      `SELECT activation_mode FROM commercial.application
        WHERE id = $1 AND retired_at IS NULL AND NOT is_platform`,
      [params.applicationId],
    );
    if (!app.rows[0]) throw new ResourceNotFound('Application not found');
    const forcedOnRequest = setup && app.rows[0].activation_mode === 'direct';
    if (forcedOnRequest) {
      await client.query(
        `UPDATE commercial.application SET activation_mode = 'on_request' WHERE id = $1`,
        [params.applicationId],
      );
    }
    await client.query(`DELETE FROM commercial.application_price WHERE application_id = $1`, [
      params.applicationId,
    ]);
    for (const p of params.prices) {
      await client
        .query(
          `INSERT INTO commercial.application_price (application_id, currency, kind, amount_minor)
           VALUES ($1, $2, $3, $4)`,
          [params.applicationId, p.currency, p.kind, p.amountMinor],
        )
        .catch((err) => mapDbError(err, 'prices'));
    }
    await audit(exec, founder.userId, {
      action: AuditActions.commercialApplicationPricesSet,
      targetType: 'application',
      targetId: params.applicationId,
      metadata: {
        prices: params.prices,
        activationModeForcedBySetup: forcedOnRequest || undefined,
      },
    });
  });
}

/**
 * D3-9: an application added to the live subscription, as a recurring line (like a monthly
 * add-on), at the application's price for the subscription's currency and interval, copied now.
 * An application already in the plan version is not added again.
 */
export async function addApplicationToSubscription(
  params: FounderParams & { organizationId: string; applicationId: string },
): Promise<{ lineId: string }> {
  const founder = await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  return withFounderWrite(organizationId, async (client, exec) => {
    const sub = await liveSubscriptionForUpdate(client);
    if (!sub) throw new InvalidInput('organizationId', 'The business has no subscription');
    const version = await currentVersion(client, sub);
    const terms = version ? await loadVersionTerms(client, version) : null;
    if (terms?.applications.includes(params.applicationId)) {
      throw new Conflict('The application is already in the plan');
    }
    const price = await client.query<{ amount_minor: string }>(
      `SELECT p.amount_minor FROM commercial.application_price p
         JOIN commercial.application a ON a.id = p.application_id
        WHERE p.application_id = $1 AND p.currency = $2 AND p.kind = $3
          AND a.retired_at IS NULL AND NOT a.is_platform`,
      [params.applicationId, sub.currency, sub.interval],
    );
    if (!price.rows[0]) {
      throw new InvalidInput(
        'applicationId',
        `The application has no ${sub.interval} price in ${sub.currency}`,
      );
    }
    const { rows } = await client
      .query<{ id: string }>(
        `INSERT INTO commercial.subscription_application
           (organization_id, subscription_id, application_id, currency, interval, amount_minor,
            source, created_by_founder_id)
         VALUES ($1, $2, $3, $4, $5, $6, 'founder', $7) RETURNING id`,
        [
          organizationId,
          sub.id,
          params.applicationId,
          sub.currency,
          sub.interval,
          price.rows[0].amount_minor,
          founder.userId,
        ],
      )
      .catch((err) => mapDbError(err, 'applicationId'));
    const lineId = rows[0]!.id;
    await audit(exec, founder.userId, {
      action: AuditActions.commercialApplicationLineAdded,
      targetType: 'subscription_application',
      targetId: lineId,
      organizationId,
      metadata: {
        applicationId: params.applicationId,
        currency: sub.currency,
        interval: sub.interval,
        amountMinor: Number(price.rows[0].amount_minor),
      },
    });
    return { lineId };
  });
}

/** The line ends (stays in the history); a discount on it ends with it. */
export async function endApplicationLine(
  params: FounderParams & { organizationId: string; lineId: string },
): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  const lineId = uuid('lineId', params.lineId);
  await withFounderWrite(organizationId, async (client, exec) => {
    const { rowCount } = await client.query(
      `UPDATE commercial.subscription_application
          SET ended_at = CURRENT_TIMESTAMP, ended_by_founder_id = $2
        WHERE id = $1 AND ended_at IS NULL`,
      [lineId, founder.userId],
    );
    if (!rowCount) throw new ResourceNotFound('Active application line not found');
    const ended = await client.query<{ id: string }>(
      `UPDATE commercial.discount SET ended_at = CURRENT_TIMESTAMP, ended_by_founder_id = $2
        WHERE subscription_application_id = $1 AND ended_at IS NULL RETURNING id`,
      [lineId, founder.userId],
    );
    await audit(exec, founder.userId, {
      action: AuditActions.commercialApplicationLineEnded,
      targetType: 'subscription_application',
      targetId: lineId,
      organizationId,
      metadata: { discountsEnded: ended.rows.map((r) => r.id) },
    });
  });
}

export const DISCOUNT_REASON_MIN = 10;
export const DISCOUNT_REASON_MAX = 1000;

export type DiscountTarget =
  | { scope: 'subscription' }
  | { scope: 'application'; lineId: string }
  | { scope: 'addon'; lineId: string };

export type DiscountValue =
  { kind: 'percent'; percentOff: number } | { kind: 'amount'; amountOffMinor: number };

export type DiscountDurationInput =
  | { duration: 'once' }
  | { duration: 'repeating'; durationMonths: number }
  | { duration: 'forever' };

function discountReason(reason: string): string {
  const v = reason?.trim() ?? '';
  if (v.length < DISCOUNT_REASON_MIN || v.length > DISCOUNT_REASON_MAX) {
    throw new InvalidInput(
      'reason',
      `A reason of ${DISCOUNT_REASON_MIN}–${DISCOUNT_REASON_MAX} characters is required`,
    );
  }
  return v;
}

function discountValue(value: DiscountValue): { percent: number | null; amount: number | null } {
  if (value.kind === 'percent') {
    if (!Number.isInteger(value.percentOff) || value.percentOff < 1 || value.percentOff > 100) {
      throw new InvalidInput('percentOff', 'A percentage from 1 to 100');
    }
    return { percent: value.percentOff, amount: null };
  }
  if (value.kind === 'amount') {
    if (!Number.isSafeInteger(value.amountOffMinor) || value.amountOffMinor <= 0) {
      throw new InvalidInput('amountOffMinor', 'An amount above zero');
    }
    return { percent: null, amount: value.amountOffMinor };
  }
  throw new InvalidInput('kind');
}

/**
 * D3-21: a discount on a business — on the whole subscription or on one line (an application
 * added, a monthly add-on); a percentage (1–100, 100 = free) or a fixed amount in the business's
 * currency; once (the next invoice), N months, or forever; with a reason (10–1,000 characters).
 * One active discount per target. Audited (required) on the Founder.
 */
export async function createDiscount(
  params: FounderParams & {
    organizationId: string;
    target: DiscountTarget;
    value: DiscountValue;
    duration: DiscountDurationInput;
    reason: string;
  },
): Promise<{ discountId: string }> {
  const founder = await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  const reason = discountReason(params.reason);
  const { percent, amount } = discountValue(params.value);
  const target = params.target;
  if (!['subscription', 'application', 'addon'].includes(target.scope)) {
    throw new InvalidInput('target');
  }
  const lineId = target.scope === 'subscription' ? null : uuid('target.lineId', target.lineId);
  const d = params.duration;
  if (!['once', 'repeating', 'forever'].includes(d.duration)) throw new InvalidInput('duration');
  const months = d.duration === 'repeating' ? d.durationMonths : null;
  if (months !== null && (!Number.isInteger(months) || months < 1 || months > 120)) {
    throw new InvalidInput('durationMonths', 'From 1 to 120 months');
  }

  return withFounderWrite(organizationId, async (client, exec) => {
    const sub = await liveSubscriptionForUpdate(client);
    if (!sub) throw new InvalidInput('organizationId', 'The business has no subscription');
    const { rows } = await client
      .query<{ id: string }>(
        `INSERT INTO commercial.discount
           (organization_id, subscription_id, scope, subscription_application_id, addon_grant_id,
            kind, percent_off, amount_off_minor, currency, duration, duration_months, reason,
            created_by_founder_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [
          organizationId,
          sub.id,
          target.scope,
          target.scope === 'application' ? lineId : null,
          target.scope === 'addon' ? lineId : null,
          params.value.kind,
          percent,
          amount,
          sub.currency,
          d.duration,
          months,
          reason,
          founder.userId,
        ],
      )
      .catch((err: { code?: string }) => {
        if (err.code === '23505') throw new Conflict('The target already has an active discount');
        return mapDbError(err, 'target');
      });
    const discountId = rows[0]!.id;
    await audit(exec, founder.userId, {
      action: AuditActions.commercialDiscountCreated,
      targetType: 'discount',
      targetId: discountId,
      organizationId,
      metadata: {
        scope: target.scope,
        lineId,
        kind: params.value.kind,
        percentOff: percent,
        amountOffMinor: amount,
        currency: sub.currency,
        duration: d.duration,
        durationMonths: months,
        reason,
      },
    });
    return { discountId };
  });
}

/** D3-21 „modificare”: the value and / or the reason; scope, kind and duration stay. Audited. */
export async function updateDiscount(
  params: FounderParams & {
    organizationId: string;
    discountId: string;
    value?: DiscountValue;
    reason?: string;
  },
): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  const discountId = uuid('discountId', params.discountId);
  const reason = params.reason === undefined ? undefined : discountReason(params.reason);
  const value = params.value ? discountValue(params.value) : undefined;
  if (!reason && !value) throw new InvalidInput('value');
  await withFounderWrite(organizationId, async (client, exec) => {
    const before = await client.query<{
      kind: string;
      percent_off: number | null;
      amount_off_minor: string | null;
      reason: string;
    }>(
      `SELECT kind, percent_off, amount_off_minor, reason FROM commercial.discount
        WHERE id = $1 AND ended_at IS NULL FOR UPDATE`,
      [discountId],
    );
    const row = before.rows[0];
    if (!row) throw new ResourceNotFound('Active discount not found');
    if (params.value && params.value.kind !== row.kind) {
      throw new InvalidInput('kind', 'A discount keeps its kind; end it and add another');
    }
    await client
      .query(
        `UPDATE commercial.discount
            SET percent_off = $2, amount_off_minor = $3, reason = $4, updated_by_founder_id = $5
          WHERE id = $1`,
        [
          discountId,
          value ? value.percent : row.percent_off,
          value ? value.amount : row.amount_off_minor,
          reason ?? row.reason,
          founder.userId,
        ],
      )
      .catch((err) => mapDbError(err, 'value'));
    await audit(exec, founder.userId, {
      action: AuditActions.commercialDiscountUpdated,
      targetType: 'discount',
      targetId: discountId,
      organizationId,
      metadata: {
        from: {
          percentOff: row.percent_off,
          amountOffMinor: row.amount_off_minor === null ? null : Number(row.amount_off_minor),
          reason: row.reason,
        },
        to: {
          percentOff: value ? value.percent : row.percent_off,
          amountOffMinor: value
            ? value.amount
            : row.amount_off_minor === null
              ? null
              : Number(row.amount_off_minor),
          reason: reason ?? row.reason,
        },
      },
    });
  });
}

/** The discount ends: no invoice from now on gets it; it stays in the history. */
export async function endDiscount(
  params: FounderParams & { organizationId: string; discountId: string },
): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  const discountId = uuid('discountId', params.discountId);
  await withFounderWrite(organizationId, async (client, exec) => {
    const { rowCount } = await client.query(
      `UPDATE commercial.discount SET ended_at = CURRENT_TIMESTAMP, ended_by_founder_id = $2
        WHERE id = $1 AND ended_at IS NULL`,
      [discountId, founder.userId],
    );
    if (!rowCount) throw new ResourceNotFound('Active discount not found');
    await audit(exec, founder.userId, {
      action: AuditActions.commercialDiscountEnded,
      targetType: 'discount',
      targetId: discountId,
      organizationId,
    });
  });
}

export interface ForeverDiscountRow {
  discountId: string;
  organizationId: string;
  subscriptionId: string;
  scope: 'subscription' | 'application' | 'addon';
  lineId: string | null;
  kind: 'percent' | 'amount';
  percentOff: number | null;
  amountOffMinor: number | null;
  currency: Currency;
  reason: string;
  createdByFounderId: string;
  createdAt: Date;
}

/** D3-21: every permanent discount still active, across businesses (the list in Founder). */
export async function listForeverDiscounts(params: FounderParams): Promise<ForeverDiscountRow[]> {
  await requireFounderSession(params.founderHeaders);
  return withFounderRead(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM commercial.founder_list_forever_discounts()`,
    );
    return rows.map((r) => ({
      discountId: r.id,
      organizationId: r.organization_id,
      subscriptionId: r.subscription_id,
      scope: r.scope,
      lineId: r.subscription_application_id ?? r.addon_grant_id ?? null,
      kind: r.kind,
      percentOff: r.percent_off,
      amountOffMinor: r.amount_off_minor === null ? null : Number(r.amount_off_minor),
      currency: r.currency,
      reason: r.reason,
      createdByFounderId: r.created_by_founder_id,
      createdAt: r.created_at,
    }));
  });
}

// ── D3-24 (31.10.2026): applications à la carte, bundles, the seats every account includes ─────

/**
 * The limits an application à la carte includes (FounderApps), e.g. EasyBook: 1.000
 * booking.appointments a month. `null` = unlimited; a key left out is not included. They count
 * for the businesses that have the application as a line (or on trial), not inside a bundle.
 */
export async function setApplicationQuotas(
  params: FounderParams & {
    applicationId: string;
    quotas: Readonly<Record<string, number | null>>;
  },
): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  await assertKnownKeys({ quotas: params.quotas });
  await withFounderWrite(null, async (client, exec) => {
    const app = await client.query(
      `SELECT 1 FROM commercial.application WHERE id = $1 AND retired_at IS NULL AND NOT is_platform`,
      [params.applicationId],
    );
    if (!app.rows[0]) throw new ResourceNotFound('Application not found');
    await client.query(`DELETE FROM commercial.application_quota WHERE application_id = $1`, [
      params.applicationId,
    ]);
    for (const [key, limit] of Object.entries(params.quotas)) {
      await client
        .query(
          `INSERT INTO commercial.application_quota (application_id, quota_key, limit_value)
           VALUES ($1, $2, $3)`,
          [params.applicationId, key, limit],
        )
        .catch((err) => mapDbError(err, 'quotas'));
    }
    await audit(exec, founder.userId, {
      action: AuditActions.commercialApplicationQuotasSet,
      targetType: 'application',
      targetId: params.applicationId,
      metadata: { quotas: params.quotas },
    });
  });
}

/**
 * D3-24: a bundle (plan) sells in its sale period — from / until, 'YYYY-MM-DD', null = open — so
 * the offers can change month to month. Who bought it keeps its version and price.
 */
export async function setBundleSalePeriod(
  params: FounderParams & {
    planId: string;
    availableFrom: string | null;
    availableUntil: string | null;
  },
): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  const planId = uuid('planId', params.planId);
  for (const [field, v] of [
    ['availableFrom', params.availableFrom],
    ['availableUntil', params.availableUntil],
  ] as const) {
    if (v !== null && !DATE_RE.test(v)) throw new InvalidInput(field);
  }
  if (
    params.availableFrom &&
    params.availableUntil &&
    params.availableUntil < params.availableFrom
  ) {
    throw new InvalidInput('availableUntil', 'The end is before the start');
  }
  await withFounderWrite(null, async (client, exec) => {
    const { rowCount } = await client
      .query(
        `UPDATE commercial.plan SET available_from = $2::date, available_until = $3::date,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [planId, params.availableFrom, params.availableUntil],
      )
      .catch((err) => mapDbError(err, 'availableUntil'));
    if (!rowCount) throw new ResourceNotFound('Bundle not found');
    await audit(exec, founder.userId, {
      action: AuditActions.commercialBundleSalePeriodSet,
      targetType: 'plan',
      targetId: planId,
      metadata: { availableFrom: params.availableFrom, availableUntil: params.availableUntil },
    });
  });
}

/** D3-24: „Oprește vânzarea” on a bundle — no new subscription on it; the existing ones stay. */
export async function stopBundleSales(params: FounderParams & { planId: string }): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  const planId = uuid('planId', params.planId);
  await withFounderWrite(null, async (client, exec) => {
    const { rowCount } = await client.query(
      `UPDATE commercial.plan SET sales_stopped_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND sales_stopped_at IS NULL`,
      [planId],
    );
    if (!rowCount) throw new Conflict('The bundle is not on sale');
    await audit(exec, founder.userId, {
      action: AuditActions.commercialBundleSalesStopped,
      targetType: 'plan',
      targetId: planId,
    });
  });
}

/** D3-24: the seats in the team every account includes (default 3), set globally from Founder. */
export async function setIncludedMembers(
  params: FounderParams & { members: number },
): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  if (!Number.isSafeInteger(params.members) || params.members < 0 || params.members > 10_000) {
    throw new InvalidInput('members');
  }
  await withFounderWrite(null, async (client, exec) => {
    const before = await client.query<{ int_value: string }>(
      `SELECT int_value FROM commercial.setting WHERE key = 'included_members' FOR UPDATE`,
    );
    await client.query(
      `UPDATE commercial.setting SET int_value = $1, updated_by_founder_id = $2,
              updated_at = CURRENT_TIMESTAMP
        WHERE key = 'included_members'`,
      [params.members, founder.userId],
    );
    await audit(exec, founder.userId, {
      action: AuditActions.commercialSettingChanged,
      targetType: 'setting',
      targetId: 'included_members',
      metadata: {
        from: before.rows[0] ? Number(before.rows[0].int_value) : null,
        to: params.members,
      },
    });
  });
}
