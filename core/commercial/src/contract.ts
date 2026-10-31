import { InvalidInput, UnknownCommercialKey } from '@ventora/errors';
import type { QuotaKind, QuotaPeriod } from '@ventora/contracts';
import { withRegistryRead, type CommercialConnection } from './db';

export interface RegistryApplicationRow {
  id: string;
  name: string;
  isPlatform: boolean;
}

export interface RegistryFeatureRow {
  key: string;
  applicationId: string;
  description: string | null;
}

export interface RegistryQuotaRow {
  key: string;
  applicationId: string;
  kind: QuotaKind;
  unit: string;
  period: QuotaPeriod | null;
  overflow: 'block';
  refundable: boolean;
  description: string | null;
}

export interface CommercialRegistry {
  applications: RegistryApplicationRow[];
  features: RegistryFeatureRow[];
  quotas: RegistryQuotaRow[];
}

/** Lot 3.1: the active registry (retired rows left out), ordered by application and key. */
export async function getRegistry(
  connection: CommercialConnection = 'app',
): Promise<CommercialRegistry> {
  return withRegistryRead(connection, async (client) => {
    const apps = await client.query(
      `SELECT id, name, is_platform FROM commercial.application
        WHERE retired_at IS NULL ORDER BY is_platform DESC, id`,
    );
    const features = await client.query(
      `SELECT key, application_id, description FROM commercial.feature_key
        WHERE retired_at IS NULL ORDER BY application_id, key`,
    );
    const quotas = await client.query(
      `SELECT key, application_id, kind, unit, period, overflow, refundable, description
         FROM commercial.quota_key WHERE retired_at IS NULL ORDER BY application_id, key`,
    );
    return {
      applications: apps.rows.map((r) => ({
        id: r.id,
        name: r.name,
        isPlatform: r.is_platform,
      })),
      features: features.rows.map((r) => ({
        key: r.key,
        applicationId: r.application_id,
        description: r.description,
      })),
      quotas: quotas.rows.map((r) => ({
        key: r.key,
        applicationId: r.application_id,
        kind: r.kind,
        unit: r.unit,
        period: r.period,
        overflow: r.overflow,
        refundable: r.refundable,
        description: r.description,
      })),
    };
  });
}

export interface CommercialValues {
  /** Feature keys a plan version, add-on or exception turns on. */
  features?: readonly string[];
  /** Quota limits: a whole number ≥ 0, or `null` for unlimited (D3-14). */
  quotas?: Readonly<Record<string, number | null>>;
}

/**
 * Lot 3.1 (ARCHITECTURE §8.4): Founder sets values only for keys that exist in the registry and
 * are not retired. Every Founder write of plans, add-ons and exceptions (Lot 3.2) calls this
 * first, on the server, inside its own checks. Throws UnknownCommercialKey with every bad key,
 * or InvalidInput for a limit that is not a whole number ≥ 0 or null.
 */
export async function assertKnownKeys(
  values: CommercialValues,
  connection: CommercialConnection = 'founder',
): Promise<void> {
  const features = [...new Set(values.features ?? [])];
  const quotaEntries = Object.entries(values.quotas ?? {});
  for (const [key, limit] of quotaEntries) {
    if (limit !== null && !(Number.isSafeInteger(limit) && limit >= 0)) {
      throw new InvalidInput(`quotas.${key}`, `Quota ${key}: a whole number ≥ 0, or null`);
    }
  }
  const quotas = quotaEntries.map(([key]) => key);
  if (features.length === 0 && quotas.length === 0) return;

  const known = await withRegistryRead(connection, async (client) => {
    const f = await client.query<{ key: string }>(
      `SELECT key FROM commercial.feature_key WHERE retired_at IS NULL AND key = ANY($1::text[])`,
      [features],
    );
    const q = await client.query<{ key: string }>(
      `SELECT key FROM commercial.quota_key WHERE retired_at IS NULL AND key = ANY($1::text[])`,
      [quotas],
    );
    return {
      features: new Set(f.rows.map((r) => r.key)),
      quotas: new Set(q.rows.map((r) => r.key)),
    };
  });

  const unknown = [
    ...features.filter((k) => !known.features.has(k)),
    ...quotas.filter((k) => !known.quotas.has(k)),
  ].sort();
  if (unknown.length > 0) throw new UnknownCommercialKey(unknown);
}
