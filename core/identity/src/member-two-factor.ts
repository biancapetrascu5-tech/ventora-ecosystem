import crypto from 'node:crypto';
import { generateRandomString, symmetricEncrypt } from 'better-auth/crypto';
import { AuditActions } from '@ventora/audit';
import {
  Conflict,
  Forbidden,
  NotAuthenticated,
  TwoFactorLocked,
  TwoFactorRequired,
} from '@ventora/errors';
import { hubAuth } from './auth';
import { getIdentityDb } from './db';
import {
  auditWriter,
  generateBackupCodeList,
  hashBackupCode,
  type BackupCodesApp,
} from './backup-codes';
import { verifyTotpWithLockout } from './totp-lockout';

// Lot 2.7 · D (S108): two-step sign-in in Contul tău · Securitate for a Hub member.
//
// Starting: Better Auth's /two-factor/enable asks for the password; the approved design opens
// the three steps from "Activează" without it (S108). This writes the same pending row the
// plugin writes (secret encrypted with the auth secret, verified=false, backup codes as HMACs,
// D1) and returns the same otpauth URI; the second step is Better Auth's /two-factor/verify-totp
// with the session, which turns it on, rotates the session and revokes the others (E6, E9).
//
// Turning off: only with a fresh TOTP code, under the account's lockout budget (R-2F5). The owner
// check lives in core/access (disableMemberTwoFactor); this is its last step.

const HUB: BackupCodesApp = 'hub';
const ISSUER = 'Ventora Hub';

/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma interactive transactions, as elsewhere */

function hubSecret(): string {
  return process.env.BETTER_AUTH_SECRET!;
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32 without padding, as @better-auth/utils/otp encodes the secret. */
function base32(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function totpUri(secret: string, email: string): string {
  const params = new URLSearchParams({ secret: base32(secret), issuer: ISSUER });
  params.set('digits', '6');
  params.set('period', '30');
  return `otpauth://totp/${encodeURIComponent(ISSUER)}:${encodeURIComponent(email)}?${params}`;
}

async function sessionUser(headers: Headers) {
  const session = await hubAuth.api.getSession({ headers });
  if (!session?.user?.id) throw new NotAuthenticated();
  return session.user as { id: string; email: string; twoFactorEnabled?: boolean | null };
}

/**
 * Step 1 of "Activează": the QR code and the 10 backup codes (shown at step 3). Conflict when
 * 2FA is already on. A pending row from an abandoned start is replaced.
 */
export async function startTwoFactorEnrollment(
  headers: Headers,
): Promise<{ totpURI: string; backupCodes: string[] }> {
  const user = await sessionUser(headers);
  if (user.twoFactorEnabled === true) throw new Conflict('Two-factor sign-in is already on');
  const db = getIdentityDb();
  const secret = generateRandomString(32);
  const backupCodes = generateBackupCodeList();
  const data = {
    secret: await symmetricEncrypt({ key: hubSecret(), data: secret }),
    backupCodes: JSON.stringify(backupCodes.map((c) => hashBackupCode(hubSecret(), c))),
    verified: false,
    failedVerificationCount: 0,
    lockedUntil: null,
  };
  await db.$transaction(async (tx: any) => {
    const existing = await tx.twoFactor.findFirst({ where: { userId: user.id } });
    if (existing?.verified === true) throw new Conflict('Two-factor sign-in is already on');
    if (existing) await tx.twoFactor.update({ where: { id: existing.id }, data });
    else await tx.twoFactor.create({ data: { id: crypto.randomUUID(), userId: user.id, ...data } });
  });
  // E8, as the hook writes it for /two-factor/enable
  await auditWriter(HUB, user.id)(
    { action: AuditActions.twoFactorEnrollStarted, outcome: 'success' },
    { method: 'totp', from: 'account_security' },
  );
  return { totpURI: totpUri(secret, user.email), backupCodes };
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
