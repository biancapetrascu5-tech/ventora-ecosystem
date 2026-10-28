import { isAPIError } from 'better-auth/api';
import type { UserWithTwoFactor } from 'better-auth/plugins/two-factor';
import { NotAuthenticated, TwoFactorRequired, Forbidden } from '@ventora/errors';
import { founderAuth } from './auth-founder';
import { getFounderDb } from './db';
import { TWO_FACTOR_LOCKOUT } from './auth-options';
import {
  AuditActions,
  appendAuditEventInTx,
  founderAction,
  hashEmail,
  prismaTxExecutor,
  readAuditLogAsFounder,
  writeAuditEvent,
  type AuditLogEntry,
  type AuditSqlExecutor,
  type FounderAuditLogFilters,
} from '@ventora/audit';

export type FounderSession = {
  id: string;
  userId: string;
  name: string;
  expiresAt: Date;
  token: string;
  twoFactorEnabled: boolean;
};

/**
 * Runs inside revokeFounderUser's transaction, after the revocation (same commit or rollback).
 * core/access registers one to close the revoked Founder's support sessions; identity cannot
 * depend on access, so the dependency is inverted. Security does not rely on it: a revoked
 * Founder has no session left and authorizeSupport() rejects them anyway.
 */
export type FounderRevocationHook = (
  exec: AuditSqlExecutor,
  revoked: { founderId: string; revokedBy: string },
) => Promise<void>;

const _revocationHooks: FounderRevocationHook[] = [];

/** Idempotent per function reference. */
export function registerFounderRevocationHook(hook: FounderRevocationHook): void {
  if (!_revocationHooks.includes(hook)) _revocationHooks.push(hook);
}

export type FounderUserRecord = {
  id: string;
  name: string;
  email: string;
  revokedAt: Date | null;
  createdByFounderId: string | null;
};

export async function getFounderSession(headers: Headers): Promise<FounderSession | null> {
  const result = await founderAuth.api.getSession({ headers });
  if (!result?.session) return null;

  const founder = await getFounderDb().user.findUnique({
    where: { id: result.session.userId },
    select: { revokedAt: true },
  });
  if (founder?.revokedAt) return null;

  return {
    id: result.session.id,
    userId: result.session.userId,
    name: result.user.name,
    expiresAt: result.session.expiresAt,
    token: result.session.token,
    twoFactorEnabled: (result.user as UserWithTwoFactor).twoFactorEnabled === true,
  };
}

/** Requires a valid founder session with 2FA already verified. Throws otherwise. */
export async function requireFounderSession(headers: Headers): Promise<FounderSession> {
  const session = await getFounderSession(headers);
  if (!session) throw new NotAuthenticated();
  if (!session.twoFactorEnabled) throw new TwoFactorRequired();
  return session;
}

export type FounderTotpCheck =
  { status: 'valid' } | { status: 'invalid' } | { status: 'locked'; lockedUntil: Date };

/** Founder 2FA audit rows written outside a Better Auth request (best_effort, like the hooks). */
async function writeFounderTwoFactorAudit(
  founderId: string,
  e: { action: string; outcome: 'failure' | 'denied' | 'success'; system?: boolean },
  metadata: Record<string, unknown>,
): Promise<void> {
  await writeAuditEvent(
    {
      category: 'founder',
      action: founderAction(e.action),
      outcome: e.outcome,
      actorType: e.system ? 'system' : 'founder',
      actorId: e.system ? null : founderId,
      founderId: e.system ? null : founderId,
      targetType: 'founder_user',
      targetId: founderId,
      metadata,
    },
    { mode: 'best_effort', connection: 'founder' },
  );
}

/**
 * Re-authentication for a sensitive action (D14): checks a fresh TOTP code of the Founder who
 * owns the session in `headers`. Goes through Better Auth's verify-totp, so a wrong code is
 * audited like any other (founder.2fa_verify_failed).
 *
 * R-2F5 / S61 applies here too: Better Auth's accountLockout only counts the sign-in challenge,
 * not a call made with a session, so the same counter and lock of the Founder's two_factors
 * row (failed_verification_count, locked_until) are kept here, with TWO_FACTOR_LOCKOUT. One
 * budget for the account: a lock from sign-in blocks re-authentication and the other way round.
 */
export async function verifyFounderTotp(params: {
  headers: Headers;
  founderId: string;
  code: string;
  purpose: string;
}): Promise<FounderTotpCheck> {
  const { maxFailedAttempts, durationSeconds } = TWO_FACTOR_LOCKOUT;
  const db = getFounderDb();
  const row = await db.twoFactor.findFirst({
    where: { userId: params.founderId },
    select: { id: true, lockedUntil: true },
  });
  if (!row) return { status: 'invalid' }; // requireFounderSession() already demands 2FA

  const now = new Date();
  if (row.lockedUntil && row.lockedUntil > now) {
    await writeFounderTwoFactorAudit(
      params.founderId,
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
      await founderAuth.api.verifyTOTP({ headers: params.headers, body: { code: params.code } });
      valid = true;
    } catch (err) {
      if (!isAPIError(err)) throw err;
    }
  } else {
    // never reaches Better Auth, so its hook does not audit it
    await writeFounderTwoFactorAudit(
      params.founderId,
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
    await writeFounderTwoFactorAudit(
      params.founderId,
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

/** Shared guard: actor must exist, not be revoked, and have 2FA enabled. */
async function requireFounderActor(actingFounderId: string): Promise<void> {
  const actor = await getFounderDb().user.findUnique({
    where: { id: actingFounderId },
    select: { revokedAt: true, twoFactorEnabled: true },
  });
  if (!actor || actor.revokedAt) throw new NotAuthenticated();
  if (!actor.twoFactorEnabled) throw new TwoFactorRequired();
}

export async function addFounderUser(
  actingFounderId: string,
  params: { name: string; email: string; password: string },
): Promise<FounderUserRecord> {
  await requireFounderActor(actingFounderId);

  const result = await founderAuth.api.signUpEmail({
    body: {
      name: params.name,
      email: params.email,
      password: params.password,
    },
  });

  // E31 (mode required, D2): the audit row is written in the same transaction as the
  // createdByFounderId update. If either fails, the account created by signUpEmail
  // (its own transaction) is deleted — no Founder account exists without its audit row.
  let newUser;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    newUser = await getFounderDb().$transaction(async (tx: any) => {
      const updated = await tx.user.update({
        where: { id: result.user.id },
        data: { createdByFounderId: actingFounderId },
      });
      await appendAuditEventInTx(prismaTxExecutor(tx), {
        category: 'founder',
        action: AuditActions.founderUserAdded,
        outcome: 'success',
        actorType: 'founder',
        actorId: actingFounderId,
        founderId: actingFounderId,
        targetType: 'founder_user',
        targetId: updated.id,
        metadata: { emailHash: hashEmail(params.email) },
      });
      return updated;
    });
  } catch (err) {
    await getFounderDb()
      .user.delete({ where: { id: result.user.id } })
      .catch((cleanupErr: unknown) => {
        console.error('[identity] addFounderUser: rollback of the new account failed', {
          userId: result.user.id,
          error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
        });
      });
    throw err;
  }

  return {
    id: newUser.id,
    name: newUser.name,
    email: newUser.email,
    revokedAt: newUser.revokedAt,
    createdByFounderId: newUser.createdByFounderId,
  };
}

export async function revokeFounderUser(
  actingFounderId: string,
  targetFounderId: string,
): Promise<void> {
  if (actingFounderId === targetFounderId) {
    throw Object.assign(new Forbidden('Cannot self-revoke'), { reason: 'self-revoke' });
  }

  await requireFounderActor(actingFounderId);

  const activeCount = await getFounderDb().user.count({
    where: { revokedAt: null },
  });
  if (activeCount <= 1) {
    throw Object.assign(new Forbidden('Last active founder cannot be revoked'), {
      reason: 'last-founder',
    });
  }

  // E32 (mode required, D2): revocation, session deletion and the audit row are one transaction.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await getFounderDb().$transaction(async (tx: any) => {
    await tx.user.update({
      where: { id: targetFounderId },
      data: {
        revokedAt: new Date(),
        revokedByFounderId: actingFounderId,
      },
    });

    const sessions = await tx.session.deleteMany({
      where: { userId: targetFounderId },
    });

    const exec = prismaTxExecutor(tx);
    await appendAuditEventInTx(exec, {
      category: 'founder',
      action: AuditActions.founderUserRevoked,
      outcome: 'success',
      actorType: 'founder',
      actorId: actingFounderId,
      founderId: actingFounderId,
      targetType: 'founder_user',
      targetId: targetFounderId,
      metadata: { sessionsDeleted: sessions.count },
    });

    for (const hook of _revocationHooks) {
      await hook(exec, { founderId: targetFounderId, revokedBy: actingFounderId });
    }
  });
}

/**
 * Full audit log for the Founder application. The read is itself audited (E33, same
 * transaction as the SELECT): when the audit write fails, nothing is returned.
 */
export async function listAuditLogsAsFounder(
  actingFounderId: string,
  filters: FounderAuditLogFilters = {},
): Promise<AuditLogEntry[]> {
  await requireFounderActor(actingFounderId);
  return readAuditLogAsFounder(actingFounderId, filters);
}
