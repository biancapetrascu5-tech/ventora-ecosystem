import type { PoolClient } from 'pg';
import type { Currency } from '@ventora/contracts';
import type { PriceKind, VersionTerms } from './classify';

/** pg returns BIGINT as a string; limits and prices fit in a safe integer. */
export const bigintOrNull = (v: unknown): number | null => (v === null ? null : Number(v));

/** What a plan version includes and costs, read in the caller's transaction. */
export async function loadVersionTerms(
  client: PoolClient,
  versionId: string,
): Promise<VersionTerms> {
  // one client, one query at a time
  const apps = await client.query<{ application_id: string }>(
    `SELECT application_id FROM commercial.plan_version_application
      WHERE plan_version_id = $1 ORDER BY application_id`,
    [versionId],
  );
  const features = await client.query<{ feature_key: string }>(
    `SELECT feature_key FROM commercial.plan_version_feature
      WHERE plan_version_id = $1 ORDER BY feature_key`,
    [versionId],
  );
  const quotas = await client.query<{ quota_key: string; limit_value: string | null }>(
    `SELECT quota_key, limit_value FROM commercial.plan_version_quota
      WHERE plan_version_id = $1 ORDER BY quota_key`,
    [versionId],
  );
  const prices = await client.query<{ currency: Currency; kind: PriceKind; amount_minor: string }>(
    `SELECT currency, kind, amount_minor FROM commercial.plan_version_price
      WHERE plan_version_id = $1 ORDER BY currency, kind`,
    [versionId],
  );
  return {
    applications: apps.rows.map((r) => r.application_id),
    features: features.rows.map((r) => r.feature_key),
    quotas: Object.fromEntries(quotas.rows.map((r) => [r.quota_key, bigintOrNull(r.limit_value)])),
    prices: prices.rows.map((r) => ({
      currency: r.currency,
      kind: r.kind,
      amountMinor: Number(r.amount_minor),
    })),
  };
}
