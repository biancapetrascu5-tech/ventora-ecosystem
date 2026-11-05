import { Pool, type PoolClient } from 'pg';

const _pools = new Map<string, Pool>();

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('[ai] DATABASE_URL is not set');
  return url;
}

function getPool(): Pool {
  const url = connectionString();
  let pool = _pools.get(url);
  if (!pool) {
    const max = Number(process.env.AI_POOL_MAX) || 1;
    pool = new Pool({ connectionString: url, max, connectionTimeoutMillis: 10_000 });
    _pools.set(url, pool);
  }
  return pool;
}

export async function closeAiPools(): Promise<void> {
  const pools = [..._pools.values()];
  _pools.clear();
  await Promise.all(pools.map((p) => p.end()));
}

async function inTransaction<T>(
  begin: string,
  setup: (client: PoolClient) => Promise<void>,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query(begin);
    await setup(client);
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

export async function withOrganizationRead<T>(
  organizationId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return inTransaction(
    'BEGIN READ ONLY',
    async (client) => {
      await client.query('SET LOCAL ROLE ai_rw');
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
    },
    fn,
  );
}

export async function withOrganizationWrite<T>(
  organizationId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return inTransaction(
    'BEGIN',
    async (client) => {
      await client.query('SET LOCAL ROLE ai_rw');
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
    },
    fn,
  );
}

export async function withModuleRead<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return inTransaction(
    'BEGIN READ ONLY',
    async (client) => {
      await client.query('SET LOCAL ROLE ai_rw');
    },
    fn,
  );
}
