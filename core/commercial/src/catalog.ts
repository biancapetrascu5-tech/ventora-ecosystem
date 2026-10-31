import type { PoolClient } from 'pg';
import type { BillingInterval, Currency, PurchaseMode } from '@ventora/contracts';
import { InvalidInput } from '@ventora/errors';
import { withOrganizationRead } from './db';
import {
  computeEntitlementsInTx,
  currentVersionInTx,
  includedMembersInTx,
  liveSubscription,
  MEMBERS_KEY,
} from './entitlements';
import { DEFAULT_CURRENCY } from './founder';
import { calendarDate } from './period';
import { bigintOrNull, loadVersionTerms } from './terms';

/*
 * D3-24 / S117: the catalog in the Hub (HubCatalogBundles, HubCatalogApp, HubAppActivation) —
 * the bundles on sale now (their current offer: the published version whose sale period holds
 * today, the bundle's sales not stopped), priced in the business's currency (D3-2, no
 * conversion), against the same applications bought separately; the business's own bundle
 * („Ai acest bundle”, kept at its price); and the applications à la carte (maintenance,
 * implementation, the limits they include). Read in the business's context (RLS), as
 * commercial_rw; `organizationId` comes from authorize(), never from client input.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CatalogBundle {
  planId: string;
  name: string;
  versionId: string;
  versionNumber: number;
  /** The offer's last sale day ('YYYY-MM-DD'), null = open. */
  availableUntil: string | null;
  applications: string[];
  /** In the business's currency; null when the offer has no price in it (not offered). */
  monthMinor: number;
  yearMinor: number | null;
  setupMinor: number;
  /** The same applications à la carte, monthly, in the same currency. */
  separateMonthMinor: number;
  /** The bundle's limits (null = unlimited), team seats left out. */
  quotas: Record<string, number | null>;
  /** The team seats the bundle adds to the ones every account includes. */
  seats: number;
  /** The business has this bundle (maybe on an older offer): it keeps its price. */
  have: { versionNumber: number; priceMinor: number | null } | null;
}

export interface CatalogApplication {
  id: string;
  activationMode: PurchaseMode;
  monthMinor: number | null;
  yearMinor: number | null;
  setupMinor: number;
  quotas: Record<string, number | null>;
  /** Already active for the business (in its bundle, à la carte or on trial). */
  active: boolean;
}

export interface Catalog {
  currency: Currency;
  interval: BillingInterval;
  includedMembers: number;
  bundles: CatalogBundle[];
  applications: CatalogApplication[];
}

async function appPrices(client: PoolClient, currency: Currency) {
  const { rows } = await client.query<{
    application_id: string;
    kind: 'month' | 'year' | 'setup';
    amount_minor: string;
  }>(
    `SELECT application_id, kind, amount_minor FROM commercial.application_price WHERE currency = $1`,
    [currency],
  );
  const out = new Map<string, { month: number | null; year: number | null; setup: number }>();
  for (const r of rows) {
    const p = out.get(r.application_id) ?? { month: null, year: null, setup: 0 };
    p[r.kind] = Number(r.amount_minor);
    out.set(r.application_id, p);
  }
  return out;
}

export async function getCatalogForOrg(organizationId: string): Promise<Catalog> {
  if (!UUID_RE.test(organizationId ?? '')) throw new InvalidInput('organizationId');
  return withOrganizationRead(organizationId, async (client) => {
    const sub = await liveSubscription(client);
    const account = await client.query<{ currency: Currency }>(
      `SELECT currency FROM commercial.billing_account`,
    );
    const currency = sub?.currency ?? account.rows[0]?.currency ?? DEFAULT_CURRENCY;
    const interval = sub?.interval ?? 'month';
    const today = calendarDate(new Date());
    const entitlements = await computeEntitlementsInTx(client, organizationId, null);
    const versionNow = await currentVersionInTx(client);
    const prices = await appPrices(client, currency);

    const own = versionNow
      ? (
          await client.query<{ plan_id: string; version_number: number }>(
            `SELECT plan_id, version_number FROM commercial.plan_version WHERE id = $1`,
            [versionNow],
          )
        ).rows[0]
      : undefined;
    const ownTerms = versionNow ? await loadVersionTerms(client, versionNow) : null;

    // the current offer of every bundle on sale today
    const offers = await client.query<{
      plan_id: string;
      name: string;
      id: string;
      version_number: number;
      available_until: string | null;
    }>(
      `SELECT DISTINCT ON (p.id) p.id AS plan_id, p.name, v.id, v.version_number,
              v.available_until::text AS available_until
         FROM commercial.plan p
         JOIN commercial.plan_version v ON v.plan_id = p.id
        WHERE p.sales_stopped_at IS NULL AND v.published_at IS NOT NULL
          AND (v.available_from IS NULL OR v.available_from <= $1::date)
          AND (v.available_until IS NULL OR v.available_until >= $1::date)
        ORDER BY p.id, v.version_number DESC`,
      [today],
    );
    const bundles: CatalogBundle[] = [];
    for (const o of offers.rows) {
      const terms = await loadVersionTerms(client, o.id);
      const price = (kind: 'month' | 'year' | 'setup') =>
        terms.prices.find((p) => p.currency === currency && p.kind === kind)?.amountMinor ?? null;
      const month = price('month');
      if (month === null) continue; // no price in the business's currency: not offered (D3-2)
      const { [MEMBERS_KEY]: seats, ...quotas } = terms.quotas;
      bundles.push({
        planId: o.plan_id,
        name: o.name,
        versionId: o.id,
        versionNumber: o.version_number,
        availableUntil: o.available_until,
        applications: [...terms.applications],
        monthMinor: month,
        yearMinor: price('year'),
        setupMinor: price('setup') ?? 0,
        separateMonthMinor: terms.applications.reduce(
          (sum, a) => sum + (prices.get(a)?.month ?? 0),
          0,
        ),
        quotas,
        seats: seats ?? 0,
        have:
          own && own.plan_id === o.plan_id
            ? {
                versionNumber: own.version_number,
                priceMinor:
                  ownTerms?.prices.find((p) => p.currency === currency && p.kind === interval)
                    ?.amountMinor ?? null,
              }
            : null,
      });
    }
    bundles.sort((a, b) => a.monthMinor - b.monthMinor || a.name.localeCompare(b.name));

    const apps = await client.query<{ id: string; activation_mode: PurchaseMode }>(
      `SELECT id, activation_mode FROM commercial.application
        WHERE retired_at IS NULL AND NOT is_platform ORDER BY id`,
    );
    const appQuotas = await client.query<{
      application_id: string;
      quota_key: string;
      limit_value: string | null;
    }>(`SELECT application_id, quota_key, limit_value FROM commercial.application_quota`);
    return {
      currency,
      interval,
      includedMembers: await includedMembersInTx(client),
      bundles,
      applications: apps.rows.map((a) => ({
        id: a.id,
        activationMode: a.activation_mode,
        monthMinor: prices.get(a.id)?.month ?? null,
        yearMinor: prices.get(a.id)?.year ?? null,
        setupMinor: prices.get(a.id)?.setup ?? 0,
        quotas: Object.fromEntries(
          appQuotas.rows
            .filter((q) => q.application_id === a.id)
            .map((q) => [q.quota_key, bigintOrNull(q.limit_value)]),
        ),
        active: entitlements.applications.includes(a.id),
      })),
    };
  });
}
