import { Pool, type PoolClient } from 'pg';
import { pgExecutor, type AuditSqlExecutor } from '@ventora/audit';

/*
 * Lot CR.1 — raw pg, as in modules/booking (D-DB-1 C): every transaction switches to crm_rw
 * first, then sets the organization (RLS, D-SEC-1, T1 / T2). app_runtime (DATABASE_URL) is
 * NOINHERIT: without SET LOCAL ROLE it sees nothing in the crm schema.
 */

const MODULE_ROLE = 'crm_rw';

let _pool: Pool | undefined;

function getPool(): Pool {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('[crm] DATABASE_URL is not set');
    // max: 1 — the serverless cap of every module (ARCHITECTURE §6.2)
    _pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 10_000 });
  }
  return _pool;
}

export async function closeCrmPool(): Promise<void> {
  const pool = _pool;
  _pool = undefined;
  await pool?.end();
}

/** One organization, as crm_rw, in one transaction (the audit row and the outbox included). */
export async function withCrmTx<T>(
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

/**
 * As crm_rw without an organization (RLS: no rows), read-only — only for the job listings that go
 * through a SECURITY DEFINER function returning ids (crm.bin_expired_contacts). Never in request
 * code: every write goes through withCrmTx, in one business's context.
 */
export async function withCrmModuleTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query(`SET LOCAL ROLE ${MODULE_ROLE}`);
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
