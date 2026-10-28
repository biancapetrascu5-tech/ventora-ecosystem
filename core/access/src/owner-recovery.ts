import crypto from 'node:crypto';
import { Forbidden, InvalidInput } from '@ventora/errors';
import { AuditActions, appendAuditEventInTx, hashEmail, writeAuditEvent } from '@ventora/audit';
import { requireFounderSession, resetOwnerAccessInTx, verifyFounderTotp } from '@ventora/identity';
import { getOwnerMembershipInTx } from '@ventora/organizations';
import { passwordResetLink, sendOwnerRecoveryNotice } from '@ventora/notifications';
import { withFounderTransaction } from './founder-db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASON_MIN_LENGTH = 10;
const REASON_MAX_LENGTH = 1000;
const TICKET_REF_MAX_LENGTH = 255;

export type RecoverOwnerAccessResult = {
  passwordReset: boolean;
  sessionsDeleted: number;
  /** E-5 delivery; the reset itself is already committed either way (E41). */
  notice: 'sent' | 'failed';
};

/**
 * Owner recovery by a Founder (R-2F7, plan §4), separate from support sessions (D16).
 * The identity check happens outside the application (D13); the Founder confirms it with
 * `identityVerified` and a fresh TOTP code of their own (D14). `resetPassword` (D15) defaults
 * to variant B: 2FA + password, with the new reset link in E-5.
 *
 * One founder_runtime transaction: active-owner check (M3), reset (M4), E40. If any part
 * fails — including the audit row — nothing changes. E-5 and E41 follow the commit.
 */
export async function recoverOwnerAccess(params: {
  founderHeaders: Headers;
  organizationId: string;
  userId: string;
  ticketRef: string;
  reason: string;
  identityVerified: boolean;
  founderTotpCode: string;
  resetPassword?: boolean;
}): Promise<RecoverOwnerAccessResult> {
  const founder = await requireFounderSession(params.founderHeaders);

  if (!UUID_RE.test(params.organizationId)) throw new InvalidInput('organizationId');
  if (!UUID_RE.test(params.userId)) throw new InvalidInput('userId');
  const ticketRef = (params.ticketRef ?? '').trim();
  if (!ticketRef || ticketRef.length > TICKET_REF_MAX_LENGTH) throw new InvalidInput('ticketRef');
  const reason = (params.reason ?? '').trim();
  if (reason.length < REASON_MIN_LENGTH || reason.length > REASON_MAX_LENGTH) {
    throw new InvalidInput('reason');
  }
  if (params.identityVerified !== true) throw new InvalidInput('identityVerified');

  if (!(await verifyFounderTotp(params.founderHeaders, params.founderTotpCode ?? ''))) {
    throw new Forbidden('Invalid two-factor code');
  }

  const resetPassword = params.resetPassword ?? true;
  // Same shape as Better Auth's own reset token (single use, one hour, see M4)
  const resetToken = resetPassword ? crypto.randomBytes(24).toString('base64url') : null;

  const done = await withFounderTransaction(async (exec) => {
    const membership = await getOwnerMembershipInTx(exec, params.organizationId, params.userId);
    if (!membership) throw new Forbidden('Not an active owner of this organization');

    const reset = await resetOwnerAccessInTx(exec, { userId: params.userId, resetToken });

    await appendAuditEventInTx(exec, {
      category: 'support',
      action: AuditActions.ownerRecoveryPerformed,
      outcome: 'success',
      actorType: 'founder',
      actorId: founder.userId,
      founderId: founder.userId,
      organizationId: params.organizationId,
      targetType: 'user',
      targetId: params.userId,
      metadata: {
        ticketRef,
        reason,
        identityVerified: true,
        resetPassword: reset.passwordReset,
        twoFactorRemoved: reset.twoFactorRemoved,
        sessionsDeleted: reset.sessionsDeleted,
        challengesDeleted: reset.challengesDeleted,
        membershipId: membership.membershipId,
      },
    });
    return { reset, organizationName: membership.organizationName };
  });

  const delivery = await sendOwnerRecoveryNotice({
    email: done.reset.email,
    name: done.reset.name,
    businessName: done.organizationName,
    ticketRef,
    passwordResetLink: resetToken ? passwordResetLink('hub', resetToken) : null,
  });

  // E41 after the commit: the reset stands even if the notice or its audit row fails.
  await writeAuditEvent(
    {
      category: 'support',
      action: AuditActions.ownerRecoveryNotified,
      outcome: delivery.status === 'sent' ? 'success' : 'failure',
      actorType: 'system',
      founderId: founder.userId,
      organizationId: params.organizationId,
      targetType: 'user',
      targetId: params.userId,
      metadata: {
        status: delivery.status,
        reason: delivery.status === 'failed' ? delivery.reason : null,
        withPasswordReset: resetToken !== null,
        emailHash: hashEmail(done.reset.email),
      },
    },
    { mode: 'best_effort', connection: 'founder' },
  );

  return {
    passwordReset: done.reset.passwordReset,
    sessionsDeleted: done.reset.sessionsDeleted,
    notice: delivery.status,
  };
}
