import { AuditActions } from '@ventora/audit';
import { Forbidden, NotAuthenticated, TwoFactorLocked, TwoFactorRequired } from '@ventora/errors';
import { hubAuth } from './auth';
import { getIdentityDb } from './db';
import { auditWriter, type BackupCodesApp } from './backup-codes';
import { verifyTotpWithLockout } from './totp-lockout';

// Lot 2.7 · D (S108): two-step sign-in in Contul tău · Securitate for a Hub member.
//
// Starting (S110): Better Auth's /two-factor/enable with the current password, called from the
// screen, under the sign-in limit (5 in 15 minutes, HUB_RATE_LIMIT); then /two-factor/verify-totp
// with the session turns it on, rotates the session and revokes the others (E6, E9).
//
// Turning off: only with a fresh TOTP code, under the account's lockout budget (R-2F5). The owner
// check lives in core/access (disableMemberTwoFactor); this is its last step.

const HUB: BackupCodesApp = 'hub';

/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma interactive transactions, as elsewhere */

async function sessionUser(headers: Headers) {
  const session = await hubAuth.api.getSession({ headers });
  if (!session?.user?.id) throw new NotAuthenticated();
  return session.user as { id: string; email: string; twoFactorEnabled?: boolean | null };
}

/**
 * "Dezactivează" for a Hub account, after a fresh TOTP code. Errors: NotAuthenticated,
 * TwoFactorRequired (2FA off), Forbidden (wrong code), TwoFactorLocked. Call it through
 * disableMemberTwoFactor (core/access), which refuses owners.
 */
export async function disableTwoFactorWithTotp(headers: Headers, code: string): Promise<void> {
  const user = await sessionUser(headers);
  if (user.twoFactorEnabled !== true) throw new TwoFactorRequired();
  const db = getIdentityDb();
  const audit = auditWriter(HUB, user.id);
  const check = await verifyTotpWithLockout({
    auth: hubAuth,
    db,
    userId: user.id,
    headers,
    code: code.replace(/\s/g, ''),
    purpose: '2fa_disable',
    audit,
  });
  if (check.status === 'locked') throw new TwoFactorLocked(check.lockedUntil);
  if (check.status !== 'valid') throw new Forbidden('Invalid two-factor code');

  await db.$transaction(async (tx: any) => {
    await tx.twoFactor.deleteMany({ where: { userId: user.id } });
    await tx.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false } });
  });
  await audit({ action: AuditActions.twoFactorDisabled, outcome: 'success' }, { method: 'totp' });
}

/** "Schimbată {when}": when the password was last set (the credential account). */
export async function getPasswordChangedAt(userId: string): Promise<Date | null> {
  const account = await getIdentityDb().account.findFirst({
    where: { userId, providerId: 'credential' },
    select: { updatedAt: true },
  });
  return account?.updatedAt ?? null;
}
