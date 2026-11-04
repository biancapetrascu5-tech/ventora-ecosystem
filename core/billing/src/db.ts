import { Pool, type PoolClient } from 'pg';
import { pgExecutor, type AuditSqlExecutor } from '@ventora/audit';

// Raw pg, as in core/commercial: every transaction runs SET LOCAL ROLE billing_rw first (D-DB-1 C)
// on app_runtime (DATABASE_URL). No generated Prisma client.
const _pools = new Map<string, Pool>();

function getPool(env: 'DATABASE_URL' | 'DATABASE_URL_FOUNDER' = 'DATABASE_URL'): Pool {
  const url = process.env[env];
  if (!url) throw new Error(`[billing] ${env} is not set`);
  let pool = _pools.get(url);
  if (!pool) {
    // max: 1 — the serverless cap of every module (ARCHITECTURE §6.2)
    pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 10_000 });
    _pools.set(url, pool);
  }
  return pool;
}

export async function closeBillingPools(): Promise<void> {
  const pools = [..._pools.values()];
  _pools.clear();
  await Promise.all(pools.map((p) => p.end()));
}

async function inTransaction<T>(
  begin: string,
  organizationId: string | null,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query(begin);
    await client.query('SET LOCAL ROLE billing_rw');
    if (organizationId) {
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
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

/**
 * A transaction in one organization's context, as billing_rw: the RLS policies see only that
 * organization's customer, cards, purchases and payments (D-SEC-1). The audit row goes in the
 * same transaction through `exec`.
 */
export async function withBillingWrite<T>(
  organizationId: string,
  fn: (client: PoolClient, exec: AuditSqlExecutor) => Promise<T>,
): Promise<T> {
  return inTransaction('BEGIN', organizationId, (client) => fn(client, pgExecutor(client)));
}

export async function withBillingRead<T>(
  organizationId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return inTransaction('BEGIN READ ONLY', organizationId, fn);
}

/**
 * Lot 3.6 — Founder · Prezentare across businesses: founder_runtime itself (DATABASE_URL_FOUNDER),
 * no module role, read only — it can only call the SECURITY DEFINER functions granted to it
 * (billing.founder_*), as in core/commercial and core/support.
 */
export async function withBillingFounderList<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool('DATABASE_URL_FOUNDER').connect();
  try {
    await client.query('BEGIN READ ONLY');
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

/**
 * As billing_rw without an organization: only the SECURITY DEFINER functions (which business a
 * Stripe customer is, the businesses with a card) and the events of no business.
 */
export async function withBillingModule<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return inTransaction('BEGIN', null, fn);
}
