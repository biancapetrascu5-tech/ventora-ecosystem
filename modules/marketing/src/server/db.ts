import { Pool, type PoolClient } from 'pg';
import { pgExecutor, type AuditSqlExecutor } from '@ventora/audit';

/*
 * Lot MK.1 — raw pg, as in modules/crm (D-DB-1 C): every transaction switches to marketing_rw
 * first, then sets the organization (RLS, D-SEC-1, T1 / T2). app_runtime (DATABASE_URL) is
 * NOINHERIT: without SET LOCAL ROLE it sees nothing in the marketing schema.
 */

const MODULE_ROLE = 'marketing_rw';

let _pool: Pool | undefined;

function getPool(): Pool {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('[marketing] DATABASE_URL is not set');
    // max: 1 — the serverless cap of every module (ARCHITECTURE §6.2)
    _pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 10_000 });
  }
  return _pool;
}

export async function closeMarketingPool(): Promise<void> {
  const pool = _pool;
  _pool = undefined;
  await pool?.end();
}

/** One organization, as marketing_rw, in one transaction (the audit row and the outbox included). */
export async function withMarketingTx<T>(
  organizationId: string,
  fn: (client: PoolClient, exec: AuditSqlExecutor) => Promise<T>,
  readOnly = false,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query(readOnly ? 'BEGIN READ ONLY' : 'BEGIN');
    await client.query(`SET LOCAL ROLE ${MODULE_ROLE}`);
    await client.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
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
