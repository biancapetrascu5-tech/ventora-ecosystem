import { Pool, type PoolClient } from 'pg';

/*
 * Raw pg, as in core/workflows (D-DB-1 C): every transaction switches to the module role first,
 * then sets the organization (RLS, D-SEC-1, T1 / T2).
 *
 *   app     → app_runtime (DATABASE_URL), growth_rw: the Hub slots, the signal consumer, the jobs
 *   founder → founder_runtime (DATABASE_URL_FOUNDER), growth_founder: Founder · Growth
 */

export type GrowthConnection = 'app' | 'founder';

const ENV: Record<GrowthConnection, string> = {
  app: 'DATABASE_URL',
  founder: 'DATABASE_URL_FOUNDER',
};
const ROLE: Record<GrowthConnection, string> = {
  app: 'growth_rw',
  founder: 'growth_founder',
};

const _pools = new Map<GrowthConnection, Pool>();

function getPool(connection: GrowthConnection): Pool {
  let pool = _pools.get(connection);
  if (!pool) {
    const url = process.env[ENV[connection]];
    if (!url) throw new Error(`[growth] ${ENV[connection]} is not set`);
    // max: 1 — the serverless cap of every module (ARCHITECTURE §6.2)
    pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 10_000 });
    _pools.set(connection, pool);
  }
  return pool;
}

export async function closeGrowthPools(): Promise<void> {
  const pools = [..._pools.values()];
  _pools.clear();
  await Promise.all(pools.map((p) => p.end()));
}

async function inTransaction<T>(
  connection: GrowthConnection,
  options: { organizationId: string | null; readOnly?: boolean },
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool(connection).connect();
  try {
    await client.query(options.readOnly ? 'BEGIN READ ONLY' : 'BEGIN');
    await client.query(`SET LOCAL ROLE ${ROLE[connection]}`);
    if (options.organizationId) {
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [
        options.organizationId,
      ]);
    }
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** The Hub and the jobs: one organization, as growth_rw. */
export function withAppTx<T>(
  organizationId: string,
  fn: (client: PoolClient) => Promise<T>,
  readOnly = false,
): Promise<T> {
  return inTransaction('app', { organizationId, readOnly }, fn);
}

/** The catalog (offers, campaigns, slots, the global control), as growth_rw, no organization. */
export function withAppCatalogTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return inTransaction('app', { organizationId: null, readOnly: true }, fn);
}

/**
 * The jobs across businesses (the automatic stop, Lot 5.8), as growth_rw, no organization: they
 * see only the catalog and act through the SECURITY DEFINER functions granted to growth_rw.
 */
export function withAppJobTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return inTransaction('app', { organizationId: null }, fn);
}

/** Founder: the catalog (null) or one business, as growth_founder. */
export function withFounderTx<T>(
  organizationId: string | null,
  fn: (client: PoolClient) => Promise<T>,
  readOnly = false,
): Promise<T> {
  return inTransaction('founder', { organizationId, readOnly }, fn);
}
