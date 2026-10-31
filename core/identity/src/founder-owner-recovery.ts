import type { AuditSqlExecutor } from '@ventora/audit';

// SQL entry points of migration 20261028000004 for the Founder application. They run on a
// founder_runtime connection, inside a transaction owned by the caller (core/access), so the
// owner check (organizations), the reset and the audit row commit or roll back together.

export type OwnerAccessReset = {
  email: string;
  name: string;
  twoFactorRemoved: boolean;
  sessionsDeleted: number;
  challengesDeleted: number;
  passwordReset: boolean;
};

/**
 * Removes the user's 2FA (secret, backup codes, lockout counters), every session and pending
 * 2FA challenge. With `resetToken` (D15 variant B) the password is cleared too and a one-hour
 * reset token `reset-password:<resetToken>` replaces any earlier one.
 */
export async function resetOwnerAccessInTx(
  exec: AuditSqlExecutor,
  params: { userId: string; resetToken: string | null },
): Promise<OwnerAccessReset> {
  const rows = await exec.query(
    `SELECT email, name, two_factor_removed, sessions_deleted, challenges_deleted, password_reset
       FROM identity.founder_reset_owner_access($1, $2, $3)`,
    [params.userId, params.resetToken !== null, params.resetToken],
  );
  const row = rows[0];
  if (!row) throw new Error('[identity] founder_reset_owner_access returned no row');
  return {
    email: row.email as string,
    name: row.name as string,
    twoFactorRemoved: row.two_factor_removed === true,
    sessionsDeleted: Number(row.sessions_deleted),
    challengesDeleted: Number(row.challenges_deleted),
    passwordReset: row.password_reset === true,
  };
}

/**
 * Email, name and chosen language of a Hub user, for notices sent from the Founder application
 * (Lot 4.3, D4-8: E-6 in the recipient's language; null locale = not chosen yet).
 */
export async function getUserContactInTx(
  exec: AuditSqlExecutor,
  userId: string,
): Promise<{ email: string; name: string; locale: string | null } | null> {
  const rows = await exec.query(
    `SELECT email, name, locale FROM identity.founder_get_user_contact_v2($1)`,
    [userId],
  );
  const row = rows[0];
  return row
    ? {
        email: row.email as string,
        name: row.name as string,
        locale: typeof row.locale === 'string' ? row.locale : null,
      }
    : null;
}
