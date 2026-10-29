import { isAPIError } from 'better-auth/api';
import { AuditActions } from '@ventora/audit';
import { TWO_FACTOR_LOCKOUT } from './auth-options';

/* eslint-disable @typescript-eslint/no-explicit-any */
type TwoFactorDb = any;
type AuthApi = { api: { verifyTOTP: (args: any) => Promise<unknown> } };
/* eslint-enable @typescript-eslint/no-explicit-any */

export type TotpCheck =
  { status: 'valid' } | { status: 'invalid' } | { status: 'locked'; lockedUntil: Date };

export type TotpAuditWriter = (
  e: { action: string; outcome: 'failure' | 'denied' | 'success'; system?: boolean },
  metadata: Record<string, unknown>,
) => Promise<void>;

/**
 * A fresh TOTP code for an action taken with an existing session (D14, D3): Founder owner
 * recovery, backup code regeneration in Hub and Founder.
 *
 * R-2F5 / S61: Better Auth's accountLockout counts only the sign-in challenge, so the same
 * counter and lock of the user's two_factors row (failed_verification_count, locked_until)
 * are kept here, with TWO_FACTOR_LOCKOUT — one budget for the account (decision A1): a lock
 * from sign-in blocks this check and the other way round. A wrong format counts (A2), the 5th
 * wrong code answers `locked` directly (A3).
 */
export async function verifyTotpWithLockout(params: {
  auth: AuthApi;
  db: TwoFactorDb;
  userId: string;
  headers: Headers;
  code: string;
  purpose: string;
  audit: TotpAuditWriter;
}): Promise<TotpCheck> {
  const { maxFailedAttempts, durationSeconds } = TWO_FACTOR_LOCKOUT;
  const { db } = params;
  const row = await db.twoFactor.findFirst({
    where: { userId: params.userId },
    select: { id: true, lockedUntil: true },
  });
  if (!row) return { status: 'invalid' };

  const now = new Date();
  if (row.lockedUntil && row.lockedUntil > now) {
    await params.audit(
      { action: AuditActions.twoFactorAttemptWhileLocked, outcome: 'denied' },
      { method: 'totp', purpose: params.purpose },
    );
    return { status: 'locked', lockedUntil: row.lockedUntil };
  }
  if (row.lockedUntil) {
    // the lock is over: a new budget, unless a concurrent request already started one
    await db.twoFactor.updateMany({
      where: { id: row.id, lockedUntil: { lte: now } },
      data: { failedVerificationCount: 0, lockedUntil: null },
    });
  }

  let valid = false;
  if (/^\d{6}$/.test(params.code)) {
    try {
      await params.auth.api.verifyTOTP({ headers: params.headers, body: { code: params.code } });
      valid = true;
    } catch (err) {
      if (!isAPIError(err)) throw err;
    }
  } else {
    // never reaches Better Auth, so its hook does not audit it
    await params.audit(
      { action: AuditActions.twoFactorVerifyFailed, outcome: 'failure' },
      { method: 'totp', errorCode: 'INVALID_CODE_FORMAT', purpose: params.purpose },
    );
  }

  if (valid) {
    await db.twoFactor.update({
      where: { id: row.id },
      data: { failedVerificationCount: 0, lockedUntil: null },
    });
    return { status: 'valid' };
  }

  const counted = await db.twoFactor.update({
    where: { id: row.id },
    data: { failedVerificationCount: { increment: 1 } },
    select: { failedVerificationCount: true },
  });
  const failedAttempts = counted.failedVerificationCount ?? 0;
  if (failedAttempts < maxFailedAttempts) return { status: 'invalid' };

  const lockedUntil = new Date(Date.now() + durationSeconds * 1000);
  const locked = await db.twoFactor.updateMany({
    where: {
      id: row.id,
      failedVerificationCount: { gte: maxFailedAttempts },
      OR: [{ lockedUntil: null }, { lockedUntil: { lte: new Date() } }],
    },
    data: { lockedUntil },
  });
  if (locked.count === 1) {
    // E11, as on the sign-in path
    await params.audit(
      { action: AuditActions.twoFactorAccountLocked, outcome: 'success', system: true },
      { lockedUntil: lockedUntil.toISOString(), failedAttempts, purpose: params.purpose },
    );
    return { status: 'locked', lockedUntil };
  }
  const current = await db.twoFactor.findFirst({
    where: { id: row.id },
    select: { lockedUntil: true },
  });
  return current?.lockedUntil
    ? { status: 'locked', lockedUntil: current.lockedUntil }
    : { status: 'invalid' };
}
