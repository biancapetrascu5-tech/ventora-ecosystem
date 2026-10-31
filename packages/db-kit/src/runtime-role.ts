import type { OutboxSqlClient } from './outbox-store';

/**
 * Integration tests must run the contracts on the production runtime roles (app_runtime,
 * founder_runtime): LOGIN, NOINHERIT, not superuser, no BYPASSRLS. A connection with more
 * rights hides a missing SET LOCAL ROLE (e.g. a raw query outside a transaction), which then
 * fails only on staging. The test setup calls this on the contracts' connection and stops the
 * run when it is anything else; admin work (fixtures) goes through DIRECT_URL.
 */
export class NotARuntimeRoleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotARuntimeRoleError';
  }
}

export async function assertRuntimeRole(
  client: OutboxSqlClient,
  expectedRole: 'app_runtime' | 'founder_runtime',
): Promise<void> {
  const { rows } = await client.query(
    `SELECT current_user::text AS role, r.rolsuper, r.rolinherit, r.rolbypassrls
       FROM pg_roles r
      WHERE r.rolname = current_user`,
  );
  const row = rows[0] as
    { role: string; rolsuper: boolean; rolinherit: boolean; rolbypassrls: boolean } | undefined;
  if (!row) throw new NotARuntimeRoleError('[db-kit] current_user not found in pg_roles');
  const problems = [
    row.role !== expectedRole && `connected as "${row.role}", expected "${expectedRole}"`,
    row.rolsuper && 'superuser',
    row.rolinherit && 'INHERIT (the runtime roles are NOINHERIT)',
    row.rolbypassrls && 'BYPASSRLS',
  ].filter(Boolean);
  if (problems.length > 0) {
    throw new NotARuntimeRoleError(
      `[db-kit] the contracts' test connection is not the production runtime role: ${problems.join('; ')}`,
    );
  }
}
