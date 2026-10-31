import { Pool, type PoolClient } from 'pg';

/** `app`: app_runtime (DATABASE_URL), `founder`: founder_runtime (DATABASE_URL_FOUNDER). */
export type CommercialConnection = 'app' | 'founder';

// Raw pg, as in core/audit: the registry is read inside a transaction that runs
// SET LOCAL ROLE commercial_rw first (D-DB-1 C); there is no generated Prisma client.
const _pools = new Map<string, Pool>();

function connectionString(connection: CommercialConnection): string {
  const name = connection === 'founder' ? 'DATABASE_URL_FOUNDER' : 'DATABASE_URL';
  const url = process.env[name];
  if (!url) throw new Error(`[commercial] ${name} is not set`);
  return url;
}

function getPool(connection: CommercialConnection): Pool {
  const url = connectionString(connection);
  let pool = _pools.get(url);
  if (!pool) {
    // max: 1 — same serverless cap as the other modules (ARCHITECTURE §6.2)
    pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 10_000 });
    _pools.set(url, pool);
  }
  return pool;
}

export async function closeCommercialPools(): Promise<void> {
  const pools = [..._pools.values()];
  _pools.clear();
  await Promise.all(pools.map((p) => p.end()));
}

/** A read-only transaction on the registry, as commercial_rw (app) or founder_runtime. */
export async function withRegistryRead<T>(
  connection: CommercialConnection,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool(connection).connect();
  try {
    await client.query('BEGIN READ ONLY');
    if (connection === 'app') await client.query('SET LOCAL ROLE commercial_rw');
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
