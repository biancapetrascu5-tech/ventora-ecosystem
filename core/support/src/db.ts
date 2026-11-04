import { Pool, type PoolClient } from 'pg';
import { pgExecutor, type AuditSqlExecutor } from '@ventora/audit';

/*
 * Raw pg, as in core/files and core/commercial (D-DB-1 C): every transaction switches to the
 * module role first, then sets the organization (RLS, D-SEC-1, T1 / T2).
 *
 *   app     → app_runtime (DATABASE_URL), support_rw: the Hub and the jobs
 *   founder → founder_runtime (DATABASE_URL_FOUNDER), support_founder: Founder · Suport, one
 *             business per transaction; the list across businesses only through the SECURITY
 *             DEFINER functions granted to founder_runtime itself
 */

export type SupportConnection = 'app' | 'founder';

const ENV: Record<SupportConnection, string> = {
  app: 'DATABASE_URL',
  founder: 'DATABASE_URL_FOUNDER',
};
const ROLE: Record<SupportConnection, string> = {
  app: 'support_rw',
  founder: 'support_founder',
};

const _pools = new Map<SupportConnection, Pool>();

function getPool(connection: SupportConnection): Pool {
  let pool = _pools.get(connection);
  if (!pool) {
    const url = process.env[ENV[connection]];
    if (!url) throw new Error(`[support] ${ENV[connection]} is not set`);
    // max: 1 — the serverless cap of every module (ARCHITECTURE §6.2)
    pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 10_000 });
    _pools.set(connection, pool);
  }
  return pool;
}

export async function closeSupportPools(): Promise<void> {
  const pools = [..._pools.values()];
  _pools.clear();
  await Promise.all(pools.map((p) => p.end()));
}

async function inTransaction<T>(
  connection: SupportConnection,
  options: { organizationId: string | null; moduleRole: boolean; readOnly?: boolean },
  fn: (client: PoolClient, exec: AuditSqlExecutor) => Promise<T>,
): Promise<T> {
  const client = await getPool(connection).connect();
  try {
    await client.query(options.readOnly ? 'BEGIN READ ONLY' : 'BEGIN');
    if (options.moduleRole) await client.query(`SET LOCAL ROLE ${ROLE[connection]}`);
    if (options.organizationId) {
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [
        options.organizationId,
      ]);
    }
    const result = await fn(client, pgExecutor(client));
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** The Hub: one organization, as support_rw. */
export function withHubTx<T>(
  organizationId: string,
  fn: (client: PoolClient, exec: AuditSqlExecutor) => Promise<T>,
  readOnly = false,
): Promise<T> {
  return inTransaction('app', { organizationId, moduleRole: true, readOnly }, fn);
}

/** Founder · Suport: one business, as support_founder. */
export function withFounderTx<T>(
  organizationId: string,
  fn: (client: PoolClient, exec: AuditSqlExecutor) => Promise<T>,
  readOnly = false,
): Promise<T> {
  return inTransaction('founder', { organizationId, moduleRole: true, readOnly }, fn);
}

/** Founder · Suport across businesses: founder_runtime itself, only the definer functions. */
export function withFounderListTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return inTransaction('founder', { organizationId: null, moduleRole: false, readOnly: true }, fn);
}

/** The jobs: support_rw without an organization (only support.auto_close_due), then one each. */
export function withModuleTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return inTransaction('app', { organizationId: null, moduleRole: true, readOnly: true }, fn);
}
