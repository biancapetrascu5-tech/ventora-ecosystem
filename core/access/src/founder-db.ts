import { Pool } from 'pg';
import { pgExecutor, type AuditSqlExecutor } from '@ventora/audit';

// Founder-side writes (support sessions, owner recovery) run on founder_runtime
// (DATABASE_URL_FOUNDER) and reach the other schemas only through SECURITY DEFINER functions,
// so the function call and its audit row share one transaction.
const _pools = new Map<string, Pool>();

function founderPool(): Pool {
  const url = process.env.DATABASE_URL_FOUNDER;
  if (!url) throw new Error('[access] DATABASE_URL_FOUNDER is not set');
  let pool = _pools.get(url);
  if (!pool) {
    // max: 1 — same serverless cap as the other modules (ARCHITECTURE §6.2)
    pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 10_000 });
    _pools.set(url, pool);
  }
  return pool;
}

export async function withFounderTransaction<T>(
  fn: (exec: AuditSqlExecutor) => Promise<T>,
): Promise<T> {
  const client = await founderPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(pgExecutor(client));
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function closeFounderPools(): Promise<void> {
  const pools = [..._pools.values()];
  _pools.clear();
  await Promise.all(pools.map((p) => p.end()));
}

const ROLE_RE = /^[a-z_][a-z0-9_]*$/;

/**
 * Runs `fn` as the connection's login role (founder_runtime) inside a transaction that switched
 * to another role (e.g. founder_identity_rw in revokeFounderUser), then switches back.
 * EXECUTE on the access functions is granted to founder_runtime, not to the module roles.
 */
export async function asSessionRole<T>(exec: AuditSqlExecutor, fn: () => Promise<T>): Promise<T> {
  const [who] = await exec.query('SELECT current_user::text AS cu, session_user::text AS su', []);
  const currentRole = String(who?.cu ?? '');
  const sessionRole = String(who?.su ?? '');
  if (currentRole === sessionRole) return fn();
  if (!ROLE_RE.test(currentRole)) throw new Error(`[access] unexpected role "${currentRole}"`);
  await exec.exec('SET LOCAL ROLE NONE');
  const result = await fn();
  await exec.exec(`SET LOCAL ROLE ${currentRole}`);
  return result;
}
