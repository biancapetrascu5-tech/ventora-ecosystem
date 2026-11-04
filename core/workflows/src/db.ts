import { Pool, type PoolClient } from 'pg';
import { pgExecutor, type AuditSqlExecutor } from '@ventora/audit';

/*
 * Raw pg, as in core/files and core/support (D-DB-1 C): every transaction switches to the module
 * role first, then sets the organization (RLS, D-SEC-1, T1 / T2).
 *
 *   app     → app_runtime (DATABASE_URL), workflows_rw: the Hub, the outbox consumer, the jobs
 *   founder → founder_runtime (DATABASE_URL_FOUNDER), workflows_founder: Founder · Automatizări,
 *             one business per transaction; the lists across businesses only through the
 *             SECURITY DEFINER functions granted to founder_runtime itself
 */

export type WorkflowsConnection = 'app' | 'founder';

const ENV: Record<WorkflowsConnection, string> = {
  app: 'DATABASE_URL',
  founder: 'DATABASE_URL_FOUNDER',
};
const ROLE: Record<WorkflowsConnection, string> = {
  app: 'workflows_rw',
  founder: 'workflows_founder',
};

const _pools = new Map<WorkflowsConnection, Pool>();

function getPool(connection: WorkflowsConnection): Pool {
  let pool = _pools.get(connection);
  if (!pool) {
    const url = process.env[ENV[connection]];
    if (!url) throw new Error(`[workflows] ${ENV[connection]} is not set`);
    // max: 1 — the serverless cap of every module (ARCHITECTURE §6.2)
    pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 10_000 });
    _pools.set(connection, pool);
  }
  return pool;
}

export async function closeWorkflowsPools(): Promise<void> {
  const pools = [..._pools.values()];
  _pools.clear();
  await Promise.all(pools.map((p) => p.end()));
}

async function inTransaction<T>(
  connection: WorkflowsConnection,
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

/** The Hub and the jobs: one organization, as workflows_rw. */
export function withAppTx<T>(
  organizationId: string,
  fn: (client: PoolClient, exec: AuditSqlExecutor) => Promise<T>,
  readOnly = false,
): Promise<T> {
  return inTransaction('app', { organizationId, moduleRole: true, readOnly }, fn);
}

/** The catalog (definitions, versions, the central stop), as workflows_rw, no organization. */
export function withAppCatalogTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return inTransaction('app', { organizationId: null, moduleRole: true, readOnly: true }, fn);
}

/** Founder: one business (or, with null, only the catalog), as workflows_founder. */
export function withFounderTx<T>(
  organizationId: string | null,
  fn: (client: PoolClient, exec: AuditSqlExecutor) => Promise<T>,
  readOnly = false,
): Promise<T> {
  return inTransaction('founder', { organizationId, moduleRole: true, readOnly }, fn);
}

/** Founder across businesses: founder_runtime itself, only the definer functions. */
export function withFounderListTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return inTransaction('founder', { organizationId: null, moduleRole: false, readOnly: true }, fn);
}
