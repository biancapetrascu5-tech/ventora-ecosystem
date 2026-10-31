import type { ApplicationManifest } from '@ventora/contracts';
import type { RegistryApplication } from './applications';
import { planRegistry } from './validate';

/** The minimal pg surface: a client on DIRECT_URL (the migration role), as at deploy. */
export interface RegistrySyncClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface TableSyncResult {
  inserted: string[];
  updated: string[];
  retired: string[];
}

export interface RegistrySyncResult {
  applications: TableSyncResult;
  features: TableSyncResult;
  quotas: TableSyncResult;
}

const empty = (): TableSyncResult => ({ inserted: [], updated: [], retired: [] });

/**
 * Lot 3.1: writes the manifests into the commercial registry, idempotently, in one transaction.
 * A row is written only when something differs, so a second run changes nothing (and reports
 * nothing). A key missing from every manifest is marked retired (retired_at), never deleted;
 * declared again, it comes back. Run at deploy, after `prisma migrate deploy`, never at runtime.
 */
export async function syncRegistry(
  client: RegistrySyncClient,
  applications: readonly RegistryApplication[],
  manifests: readonly ApplicationManifest[],
): Promise<RegistrySyncResult> {
  const plan = planRegistry(applications, manifests);
  const result: RegistrySyncResult = {
    applications: empty(),
    features: empty(),
    quotas: empty(),
  };

  await client.query('BEGIN');
  try {
    // Two deploys syncing at once wait for each other instead of interleaving
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('commercial.registry'))`);

    for (const app of plan.applications) {
      const { rows } = await client.query(
        `INSERT INTO commercial.application (id, name, is_platform) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE
           SET name = EXCLUDED.name, is_platform = EXCLUDED.is_platform,
               retired_at = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE (application.name, application.is_platform, application.retired_at)
                 IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.is_platform, NULL::timestamptz)
         RETURNING (xmax = 0) AS inserted`,
        [app.id, app.name, app.isPlatform],
      );
      track(result.applications, app.id, rows);
    }

    for (const f of plan.features) {
      const { rows } = await client.query(
        `INSERT INTO commercial.feature_key (key, application_id, description) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE
           SET application_id = EXCLUDED.application_id, description = EXCLUDED.description,
               retired_at = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE (feature_key.application_id, feature_key.description, feature_key.retired_at)
                 IS DISTINCT FROM (EXCLUDED.application_id, EXCLUDED.description, NULL::timestamptz)
         RETURNING (xmax = 0) AS inserted`,
        [f.key, f.applicationId, f.description ?? null],
      );
      track(result.features, f.key, rows);
    }

    for (const q of plan.quotas) {
      const { rows } = await client.query(
        `INSERT INTO commercial.quota_key
           (key, application_id, kind, unit, period, overflow, refundable, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (key) DO UPDATE
           SET application_id = EXCLUDED.application_id, kind = EXCLUDED.kind,
               unit = EXCLUDED.unit, period = EXCLUDED.period, overflow = EXCLUDED.overflow,
               refundable = EXCLUDED.refundable, description = EXCLUDED.description,
               retired_at = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE (quota_key.application_id, quota_key.kind, quota_key.unit, quota_key.period,
                  quota_key.overflow, quota_key.refundable, quota_key.description,
                  quota_key.retired_at)
                 IS DISTINCT FROM
                 (EXCLUDED.application_id, EXCLUDED.kind, EXCLUDED.unit, EXCLUDED.period,
                  EXCLUDED.overflow, EXCLUDED.refundable, EXCLUDED.description, NULL::timestamptz)
         RETURNING (xmax = 0) AS inserted`,
        [
          q.key,
          q.applicationId,
          q.kind,
          q.unit,
          q.period,
          q.overflow,
          q.refundable,
          q.description ?? null,
        ],
      );
      track(result.quotas, q.key, rows);
    }

    result.applications.retired = await retire(
      client,
      'application',
      'id',
      plan.applications.map((a) => a.id),
    );
    result.features.retired = await retire(
      client,
      'feature_key',
      'key',
      plan.features.map((f) => f.key),
    );
    result.quotas.retired = await retire(
      client,
      'quota_key',
      'key',
      plan.quotas.map((q) => q.key),
    );

    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  }
}

function track(table: TableSyncResult, id: string, rows: Record<string, unknown>[]) {
  if (!rows[0]) return; // unchanged
  (rows[0].inserted ? table.inserted : table.updated).push(id);
}

async function retire(
  client: RegistrySyncClient,
  table: 'application' | 'feature_key' | 'quota_key',
  column: 'id' | 'key',
  keep: string[],
): Promise<string[]> {
  const { rows } = await client.query(
    `UPDATE commercial.${table}
        SET retired_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE retired_at IS NULL AND NOT (${column} = ANY($1::text[]))
      RETURNING ${column} AS id`,
    [keep],
  );
  return rows.map((r) => String(r.id)).sort();
}

/** True when the sync wrote nothing. */
export function isNoop(result: RegistrySyncResult): boolean {
  return Object.values(result).every(
    (t) => t.inserted.length === 0 && t.updated.length === 0 && t.retired.length === 0,
  );
}
