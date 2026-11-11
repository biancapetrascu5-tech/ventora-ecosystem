import { Pool, type PoolClient } from 'pg';

/*
 * Raw pg, as in core/growth (D-DB-1 C): every transaction switches to consent_rw first, then sets
 * the organization (RLS, D-SEC-1, T1 / T2). Only app_runtime (DATABASE_URL); Founder has no access.
 */

let _pool: Pool | null = null;

function getPool(): Pool {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('[consent] DATABASE_URL is not set');
    // max: 1 — the serverless cap of every module (ARCHITECTURE §6.2)
    _pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 10_000 });
  }
  return _pool;
}

export async function closeConsentPools(): Promise<void> {
  const pool = _pool;
  _pool = null;
  await pool?.end();
}

export async function withConsentTx<T>(
  organizationId: string,
  fn: (client: PoolClient) => Promise<T>,
  readOnly = false,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query(readOnly ? 'BEGIN READ ONLY' : 'BEGIN');
    await client.query('SET LOCAL ROLE consent_rw');
    await client.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
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
