import type { PoolClient } from 'pg';
import type { BillingInterval, Currency, PurchaseMode } from '@ventora/contracts';
import { Conflict, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { priceOf } from './classify';
import { withOrganizationRead, withOrganizationWrite } from './db';
import {
  addonAvailableInTx,
  computeEntitlementsInTx,
  currentVersionInTx,
  liveSubscription,
} from './entitlements';
import { calendarDate, quotaPeriod, startOfDay } from './period';
import { bigintOrNull, loadVersionTerms } from './terms';

/*
 * Lot 3.5 — what core/billing needs from the commercial model (ARCHITECTURE §8.6, D-COM-6):
 *
 *   - the quote: what a direct purchase costs, read on the server in the business's currency
 *     (D3-2) — never the price the client sends;
 *   - the activation after the payment: a pack (addon_grant) or an application à la carte
 *     (subscription_application, D3-24), once per purchase (`purchase_id` is unique: the dialog
 *     and the webhook may both report the success);
 *   - the terms the Stripe subscription mirrors (D3-4): the bundle, the applications added, the
 *     monthly packs bought and the discounts (D3-21).
 *
 * Read and written as commercial_rw, in the organization's context (RLS). `organizationId` comes
 * from authorize() (the Hub) or from the Stripe customer the payment belongs to (the webhook).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APP_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const MAX_PACKS = 100;

function uuid(field: string, value: string): string {
  if (!UUID_RE.test(value ?? '')) throw new InvalidInput(field);
  return value;
}

export type PurchaseItem =
  | { kind: 'addon'; addonId: string; packs?: number }
  | { kind: 'application'; applicationId: string };

export interface PurchaseQuote {
  kind: 'addon' | 'application';
  /** The add-on's id or the application's id. */
  itemId: string;
  /** The add-on's name as Founder wrote it; for an application, its id (the Hub has its name). */
  name: string;
  subscriptionId: string;
  /** The subscription's start (D3-3): a line bought mid-period is charged for the days left. */
  startedOn: string;
  currency: Currency;
  /** The subscription's interval: an application's maintenance is billed on it. */
  interval: BillingInterval;
  packs: number;
  /** For the period: a pack × packs, or the application's maintenance for the interval. */
  priceMinor: number;
  /** Once, at the purchase (D3-24): the pack's setup × packs, or the application's. */
  setupMinor: number;
  /** A line of the subscription (a monthly pack, D3-7; an application, D3-9), else once. */
  recurring: boolean;
  purchaseMode: PurchaseMode;
  /** The pack's quota and units per pack; null for an application. */
  quotaKey: string | null;
  quantity: number | null;
}

/**
 * The price of a direct purchase for the organization, now. Refused when it cannot be bought:
 * no live subscription, the pack is not available to the business (S117) or has no price in its
 * currency, the application is already active or has no maintenance price for the interval.
 * „La cerere” is returned as is: the caller decides (billing refuses a direct payment for it).
 */
export async function getPurchaseQuote(
  organizationId: string,
  item: PurchaseItem,
): Promise<PurchaseQuote> {
  uuid('organizationId', organizationId);
  return withOrganizationRead(organizationId, async (client) => {
    const sub = await liveSubscription(client);
    if (!sub) throw new InvalidInput('organizationId', 'The business has no subscription');
    if (item.kind === 'addon') return addonQuote(client, organizationId, sub, item);
    return applicationQuote(client, organizationId, sub, item);
  });
}

type LiveSub = NonNullable<Awaited<ReturnType<typeof liveSubscription>>>;

async function addonQuote(
  client: PoolClient,
  organizationId: string,
  sub: LiveSub,
  item: Extract<PurchaseItem, { kind: 'addon' }>,
): Promise<PurchaseQuote> {
  const addonId = uuid('addonId', item.addonId);
  const packs = item.packs ?? 1;
  if (!Number.isSafeInteger(packs) || packs <= 0 || packs > MAX_PACKS) {
    throw new InvalidInput('packs');
  }
  const available = await addonAvailableInTx(client, organizationId, addonId);
  if (!available) throw new ResourceNotFound('Add-on not available to this business');
  const { rows } = await client.query<{
    name: string;
    quota_key: string;
    quantity: string;
    validity: 'current_month' | 'monthly';
    purchase_mode: PurchaseMode;
    amount_minor: string;
    setup_minor: string;
  }>(
    `SELECT a.name, a.quota_key, a.quantity, a.validity, a.purchase_mode,
            p.amount_minor, p.setup_minor
       FROM commercial.addon a
       JOIN commercial.addon_price p ON p.addon_id = a.id AND p.currency = $2
      WHERE a.id = $1`,
    [addonId, sub.currency],
  );
  const a = rows[0];
  if (!a) throw new InvalidInput('currency', `The add-on has no price in ${sub.currency}`);
  const recurring = a.validity === 'monthly';
  return {
    kind: 'addon',
    itemId: addonId,
    name: a.name,
    subscriptionId: sub.id,
    startedOn: sub.startedOn,
    currency: sub.currency,
    interval: sub.interval,
    packs,
    priceMinor: Number(a.amount_minor) * packs,
    setupMinor: Number(a.setup_minor) * packs,
    recurring,
    purchaseMode: a.purchase_mode,
    quotaKey: a.quota_key,
    quantity: Number(a.quantity),
  };
}

async function applicationQuote(
  client: PoolClient,
  organizationId: string,
  sub: LiveSub,
  item: Extract<PurchaseItem, { kind: 'application' }>,
): Promise<PurchaseQuote> {
  const applicationId = item.applicationId;
  if (!APP_RE.test(applicationId ?? '')) throw new InvalidInput('applicationId');
  const app = await client.query<{ activation_mode: PurchaseMode }>(
    `SELECT activation_mode FROM commercial.application
      WHERE id = $1 AND retired_at IS NULL AND NOT is_platform`,
    [applicationId],
  );
  if (!app.rows[0]) throw new ResourceNotFound('Application not found');
  const { applications } = await computeEntitlementsInTx(client, organizationId, null);
  if (applications.includes(applicationId)) {
    throw new Conflict('The application is already active for the business');
  }
  const prices = await client.query<{ kind: string; amount_minor: string }>(
    `SELECT kind, amount_minor FROM commercial.application_price
      WHERE application_id = $1 AND currency = $2 AND kind IN ($3, 'setup')`,
    [applicationId, sub.currency, sub.interval],
  );
  const price = prices.rows.find((p) => p.kind === sub.interval);
  if (!price) {
    throw new InvalidInput('currency', `No ${sub.interval} price in ${sub.currency}`);
  }
  const setup = prices.rows.find((p) => p.kind === 'setup');
  return {
    kind: 'application',
    itemId: applicationId,
    name: applicationId,
    subscriptionId: sub.id,
    startedOn: sub.startedOn,
    currency: sub.currency,
    interval: sub.interval,
    packs: 1,
    priceMinor: Number(price.amount_minor),
    setupMinor: setup ? Number(setup.amount_minor) : 0,
    recurring: true,
    purchaseMode: app.rows[0].activation_mode,
    quotaKey: null,
    quantity: null,
  };
}

/**
 * After the payment succeeded (core/billing): the pack bought, for the current month (until the
 * next reset, D3-3) or monthly (a recurring line of the live subscription, D3-7). Once per
 * purchase: a second call returns the same grant (`created` false). A pack whose sales stopped
 * after the payment is still granted — it is paid.
 */
export async function activatePurchasedAddon(params: {
  organizationId: string;
  purchaseId: string;
  addonId: string;
  packs: number;
}): Promise<{ grantId: string; created: boolean }> {
  const organizationId = uuid('organizationId', params.organizationId);
  const purchaseId = uuid('purchaseId', params.purchaseId);
  const addonId = uuid('addonId', params.addonId);
  if (!Number.isSafeInteger(params.packs) || params.packs <= 0) throw new InvalidInput('packs');
  return withOrganizationWrite(organizationId, async (client) => {
    const existing = await grantOf(client, purchaseId);
    if (existing) return { grantId: existing, created: false };
    const sub = await liveSubscription(client);
    if (!sub) throw new InvalidInput('organizationId', 'The business has no subscription');
    const addon = await client.query<{ validity: string }>(
      `SELECT validity FROM commercial.addon WHERE id = $1`,
      [addonId],
    );
    if (!addon.rows[0]) throw new ResourceNotFound('Add-on not found');
    const recurring = addon.rows[0].validity === 'monthly';
    const endsAt = recurring
      ? null
      : startOfDay(quotaPeriod(sub.startedOn, calendarDate(new Date())).end);
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO commercial.addon_grant
         (organization_id, addon_id, subscription_id, packs, recurring, source, ends_at, purchase_id)
       VALUES ($1, $2, $3, $4, $5, 'purchase', $6, $7)
       ON CONFLICT (purchase_id) DO NOTHING
       RETURNING id`,
      [
        organizationId,
        addonId,
        recurring ? sub.id : null,
        params.packs,
        recurring,
        endsAt,
        purchaseId,
      ],
    );
    if (rows[0]) return { grantId: rows[0].id, created: true };
    return { grantId: (await grantOf(client, purchaseId))!, created: false };
  });
}

async function grantOf(client: PoolClient, purchaseId: string): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM commercial.addon_grant WHERE purchase_id = $1`,
    [purchaseId],
  );
  return rows[0]?.id ?? null;
}

/**
 * After the payment succeeded: the application à la carte bought on „Direct” (D3-24) becomes a
 * recurring line of the live subscription (D3-9) at the maintenance price paid, and is active
 * at once with its own limits. Once per purchase.
 */
export async function activatePurchasedApplication(params: {
  organizationId: string;
  purchaseId: string;
  applicationId: string;
  currency: Currency;
  interval: BillingInterval;
  amountMinor: number;
}): Promise<{ lineId: string; created: boolean }> {
  const organizationId = uuid('organizationId', params.organizationId);
  const purchaseId = uuid('purchaseId', params.purchaseId);
  if (!APP_RE.test(params.applicationId ?? '')) throw new InvalidInput('applicationId');
  if (!Number.isSafeInteger(params.amountMinor) || params.amountMinor < 0) {
    throw new InvalidInput('amountMinor');
  }
  return withOrganizationWrite(organizationId, async (client) => {
    const existing = await lineOf(client, purchaseId);
    if (existing) return { lineId: existing, created: false };
    const sub = await liveSubscription(client);
    if (!sub) throw new InvalidInput('organizationId', 'The business has no subscription');
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO commercial.subscription_application
         (organization_id, subscription_id, application_id, currency, interval, amount_minor,
          source, purchase_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'purchase', $7)
       ON CONFLICT (purchase_id) DO NOTHING
       RETURNING id`,
      [
        organizationId,
        sub.id,
        params.applicationId,
        params.currency,
        params.interval,
        params.amountMinor,
        purchaseId,
      ],
    );
    if (rows[0]) return { lineId: rows[0].id, created: true };
    return { lineId: (await lineOf(client, purchaseId))!, created: false };
  });
}

async function lineOf(client: PoolClient, purchaseId: string): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM commercial.subscription_application WHERE purchase_id = $1`,
    [purchaseId],
  );
  return rows[0]?.id ?? null;
}

export interface BillingDiscount {
  id: string;
  /** `subscription`: on the whole invoice; else on one line (its id in `lineId`). */
  scope: 'subscription' | 'application' | 'addon';
  lineId: string | null;
  kind: 'percent' | 'amount';
  percentOff: number | null;
  amountOffMinor: number | null;
  currency: Currency;
  duration: 'once' | 'repeating' | 'forever';
  durationMonths: number | null;
}

/** What the Stripe subscription mirrors (D3-4): built from the commercial model, never edited. */
export interface BillingTerms {
  subscription: {
    id: string;
    status: string;
    interval: BillingInterval;
    currency: Currency;
    startedOn: string;
    anchorDay: number;
    trialEndsAt: string | null;
  };
  /** The bundle in effect now and its price for the interval and currency (null: none). */
  bundle: { versionId: string; planName: string; priceMinor: number } | null;
  /** The applications added (D3-9): Founder's, the requests handled and those bought. */
  applications: Array<{
    lineId: string;
    applicationId: string;
    interval: BillingInterval;
    amountMinor: number;
    /** Bought from the Hub: the days left of the period were paid at the purchase. */
    purchased: boolean;
  }>;
  /** The monthly packs bought from the Hub (Founder's grants are not billed, see the report). */
  packs: Array<{ grantId: string; addonId: string; purchaseId: string; packs: number }>;
  discounts: BillingDiscount[];
}

/** The terms of the organization's live subscription for Stripe, or null without one. */
export async function getBillingTerms(organizationId: string): Promise<BillingTerms | null> {
  uuid('organizationId', organizationId);
  return withOrganizationRead(organizationId, async (client) => {
    const sub = await liveSubscription(client);
    if (!sub) return null;
    const versionId = await currentVersionInTx(client);
    let bundle: BillingTerms['bundle'] = null;
    if (versionId) {
      const terms = await loadVersionTerms(client, versionId);
      const price = priceOf(terms, sub.currency, sub.interval);
      const { rows } = await client.query<{ name: string }>(
        `SELECT p.name FROM commercial.plan_version v JOIN commercial.plan p ON p.id = v.plan_id
          WHERE v.id = $1`,
        [versionId],
      );
      if (price !== null) bundle = { versionId, planName: rows[0]?.name ?? '', priceMinor: price };
    }
    const apps = await client.query<{
      id: string;
      application_id: string;
      interval: BillingInterval;
      amount_minor: string;
      source: string;
    }>(
      `SELECT id, application_id, interval, amount_minor, source
         FROM commercial.subscription_application
        WHERE subscription_id = $1 AND ended_at IS NULL ORDER BY created_at, id`,
      [sub.id],
    );
    const packs = await client.query<{
      id: string;
      addon_id: string;
      purchase_id: string;
      packs: number;
    }>(
      `SELECT id, addon_id, purchase_id, packs FROM commercial.addon_grant
        WHERE subscription_id = $1 AND recurring AND ended_at IS NULL AND source = 'purchase'
        ORDER BY created_at, id`,
      [sub.id],
    );
    const discounts = await client.query(
      `SELECT id, scope, subscription_application_id, addon_grant_id, kind, percent_off,
              amount_off_minor, currency, duration, duration_months
         FROM commercial.discount
        WHERE subscription_id = $1 AND ended_at IS NULL
        ORDER BY created_at, id`,
      [sub.id],
    );
    return {
      subscription: {
        id: sub.id,
        status: sub.status,
        interval: sub.interval,
        currency: sub.currency,
        startedOn: sub.startedOn,
        anchorDay: sub.anchorDay,
        trialEndsAt: sub.trialEndsAt,
      },
      bundle,
      applications: apps.rows.map((a) => ({
        lineId: a.id,
        applicationId: a.application_id,
        interval: a.interval,
        amountMinor: Number(a.amount_minor),
        purchased: a.source === 'purchase',
      })),
      packs: packs.rows.map((p) => ({
        grantId: p.id,
        addonId: p.addon_id,
        purchaseId: p.purchase_id,
        packs: p.packs,
      })),
      discounts: discounts.rows.map((d) => ({
        id: d.id,
        scope: d.scope,
        lineId: d.subscription_application_id ?? d.addon_grant_id ?? null,
        kind: d.kind,
        percentOff: d.percent_off,
        amountOffMinor: bigintOrNull(d.amount_off_minor),
        currency: d.currency,
        duration: d.duration,
        durationMonths: d.duration_months,
      })),
    };
  });
}
