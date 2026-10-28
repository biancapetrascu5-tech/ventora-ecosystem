import { Pool } from 'pg';
import type { AuditConnection } from './types';

// Raw pg on purpose: the only write path is audit.append_event (SECURITY DEFINER) and the
// read path needs SET LOCAL ROLE + set_config in one transaction — same pattern as
// organizations.createOrganizationAsFounder.
const _pools = new Map<string, Pool>();

function connectionString(connection: AuditConnection): string {
  const url =
    connection === 'founder' ? process.env.DATABASE_URL_FOUNDER : process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      `[audit] ${connection === 'founder' ? 'DATABASE_URL_FOUNDER' : 'DATABASE_URL'} is not set`,
    );
  }
  return url;
}

export function getAuditPool(connection: AuditConnection): Pool {
  const url = connectionString(connection);
  let pool = _pools.get(url);
  if (!pool) {
    // max: 1 — same serverless cap as the other modules (ARCHITECTURE §6.2)
    pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 10_000 });
    _pools.set(url, pool);
  }
  return pool;
}

export async function closeAuditPools(): Promise<void> {
  const pools = [..._pools.values()];
  _pools.clear();
  await Promise.all(pools.map((p) => p.end()));
}

/** Minimal surface needed to run audit SQL inside a caller-owned transaction. */
export type AuditSqlExecutor = {
  query(sql: string, params: unknown[]): Promise<Record<string, unknown>[]>;
  exec(sql: string): Promise<void>;
};

/** Wraps a pg client that already ran BEGIN. */
export function pgExecutor(client: {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}): AuditSqlExecutor {
  return {
    query: async (sql, params) => (await client.query(sql, params)).rows,
    exec: async (sql) => {
      await client.query(sql);
    },
  };
}

/** Wraps a Prisma interactive-transaction client. */
export function prismaTxExecutor(tx: {
  $queryRawUnsafe(sql: string, ...params: unknown[]): Promise<unknown>;
  $executeRawUnsafe(sql: string, ...params: unknown[]): Promise<unknown>;
}): AuditSqlExecutor {
  return {
    query: async (sql, params) =>
      (await tx.$queryRawUnsafe(sql, ...params)) as Record<string, unknown>[],
    exec: async (sql) => {
      await tx.$executeRawUnsafe(sql);
    },
  };
}

export async function withAuditTransaction<T>(
  connection: AuditConnection,
  fn: (exec: AuditSqlExecutor) => Promise<T>,
): Promise<T> {
  const client = await getAuditPool(connection).connect();
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
