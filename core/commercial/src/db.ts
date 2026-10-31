import { Pool, type PoolClient } from 'pg';
import { pgExecutor, type AuditSqlExecutor } from '@ventora/audit';

/** `app`: app_runtime (DATABASE_URL), `founder`: founder_runtime (DATABASE_URL_FOUNDER). */
export type CommercialConnection = 'app' | 'founder';

// Raw pg, as in core/audit: every transaction runs SET LOCAL ROLE first (D-DB-1 C) —
// commercial_rw on app_runtime, commercial_founder on founder_runtime; there is no generated
// Prisma client.
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
    // max: 1 — same serverless cap as the other modules (ARCHITECTURE §6.2). COMMERCIAL_POOL_MAX
    // raises it only where real parallel transactions are needed (the T5 concurrency test).
    const max = Number(process.env.COMMERCIAL_POOL_MAX) || 1;
    pool = new Pool({ connectionString: url, max, connectionTimeoutMillis: 10_000 });
    _pools.set(url, pool);
  }
  return pool;
}

export async function closeCommercialPools(): Promise<void> {
  const pools = [..._pools.values()];
  _pools.clear();
  await Promise.all(pools.map((p) => p.end()));
}

async function inTransaction<T>(
  connection: CommercialConnection,
  begin: string,
  setup: (client: PoolClient) => Promise<void>,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool(connection).connect();
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

/** A read-only transaction on the registry, as commercial_rw (app) or founder_runtime. */
export async function withRegistryRead<T>(
  connection: CommercialConnection,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return inTransaction(
    connection,
    'BEGIN READ ONLY',
    async (client) => {
      if (connection === 'app') await client.query('SET LOCAL ROLE commercial_rw');
    },
    fn,
  );
}

/**
 * A read-only transaction in one organization's context, as commercial_rw: the RLS policies see
 * only that organization's subscription, add-ons, exceptions and trials (D-SEC-1).
 */
export async function withOrganizationRead<T>(
  organizationId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return inTransaction(
    'app',
    'BEGIN READ ONLY',
    async (client) => {
      await client.query('SET LOCAL ROLE commercial_rw');
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
    },
    fn,
  );
}

/**
 * Lot 3.3: a read-write transaction in one organization's context, as commercial_rw — the quota
 * operations (counter, reservation, history, outbox event) commit together or not at all.
 */
export async function withOrganizationWrite<T>(
  organizationId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return inTransaction(
    'app',
    'BEGIN',
    async (client) => {
      await client.query('SET LOCAL ROLE commercial_rw');
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
    },
    fn,
  );
}

/** Lot 3.3: a transaction as commercial_rw without an organization (only definer functions). */
export async function withModuleRead<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return inTransaction(
    'app',
    'BEGIN READ ONLY',
    async (client) => {
      await client.query('SET LOCAL ROLE commercial_rw');
    },
    fn,
  );
}

/**
 * A Founder read across businesses, as founder_runtime itself (no module role): only through
 * the SECURITY DEFINER functions granted to it (e.g. founder_list_forever_discounts).
 */
export async function withFounderRead<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return inTransaction('founder', 'BEGIN READ ONLY', async () => {}, fn);
}

/**
 * A Founder write, as commercial_founder on founder_runtime. With `organizationId`, the
 * transaction is in that organization's context (RLS, WITH CHECK): one business per transaction.
 * The audit row goes in the same transaction (required) through `exec`.
 */
export async function withFounderWrite<T>(
  organizationId: string | null,
  fn: (client: PoolClient, exec: AuditSqlExecutor) => Promise<T>,
): Promise<T> {
  return inTransaction(
    'founder',
    'BEGIN',
    async (client) => {
      await client.query('SET LOCAL ROLE commercial_founder');
      if (organizationId) {
        await client.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
      }
    },
    (client) => fn(client, pgExecutor(client)),
  );
}
