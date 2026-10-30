import crypto from 'node:crypto';
import { symmetricDecrypt } from 'better-auth/crypto';
import { AuditActions, founderAction, writeAuditEvent } from '@ventora/audit';
import { NotAuthenticated, TwoFactorLocked, TwoFactorRequired, Forbidden } from '@ventora/errors';
import { verifyTotpWithLockout, type TotpAuditWriter } from './totp-lockout';

// Backup codes (decisions D1–D3, 29.10.2026):
// - D1: 10 codes of 8 digits, shown as two groups of 4 ("4829 1736"); one use each;
// - stored hashed: HMAC-SHA256 with the auth secret, never the code itself. Better Auth's
//   backup-code plugin keeps working: `storeBackupCodes.encrypt` hashes the plain codes it
//   receives, `decrypt` returns the stored hashes, and a before hook replaces the code sent
//   to /two-factor/verify-backup-code with its hash, so the plugin's `includes` + filter run
//   on hashes (one use: the plugin removes the matching hash);
// - D2: a used code and a wrong code get the same answer (the plugin already does that);
// - D3: regeneration is confirmed with the TOTP code of the app, under the same lockout
//   budget (verifyTotpWithLockout); the new codes are returned once. Better Auth's
//   /two-factor/generate-backup-codes (password) is disabled.
// Codes stored before this change (encrypted, "xxxxx-xxxxx") still verify: `decrypt` opens
// them with the auth secret and hashes them; the next write stores hashes only.

export const BACKUP_CODE_COUNT = 10;
const HASH_PREFIX = 'h1:';

/* eslint-disable @typescript-eslint/no-explicit-any */
type TwoFactorDb = any;
type AuthLike = {
  api: { getSession: (a: any) => Promise<any>; verifyTOTP: (a: any) => Promise<unknown> };
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/** 10 different codes of 8 digits (D1). */
export function generateBackupCodeList(): string[] {
  const codes = new Set<string>();
  while (codes.size < BACKUP_CODE_COUNT) {
    codes.add(String(crypto.randomInt(0, 100_000_000)).padStart(8, '0'));
  }
  return [...codes];
}

/** What the user typed → the stored form: "4829 1736", "4829-1736" and "48291736" are one code. */
export function normalizeBackupCode(input: string): string {
  const compact = input.trim().replace(/\s+/g, '');
  const digits = compact.replace(/-/g, '');
  return /^\d{8}$/.test(digits) ? digits : compact;
}

export function hashBackupCode(secret: string, code: string): string {
  const mac = crypto.createHmac('sha256', secret).update(normalizeBackupCode(code)).digest('hex');
  return HASH_PREFIX + mac;
}

const isHash = (v: unknown): v is string => typeof v === 'string' && v.startsWith(HASH_PREFIX);

async function storedHashes(secret: string, stored: string): Promise<string[] | null> {
  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed))
      return parsed.map((c) => (isHash(c) ? c : hashBackupCode(secret, String(c))));
  } catch {
    // not JSON: codes from before D1, encrypted by Better Auth
  }
  try {
    const legacy = JSON.parse(await symmetricDecrypt({ key: secret, data: stored }));
    return Array.isArray(legacy) ? legacy.map((c) => hashBackupCode(secret, String(c))) : null;
  } catch {
    return null;
  }
}

/** `twoFactor({ backupCodeOptions: { storeBackupCodes } })`: hashes in, hashes out. */
export function hashedBackupCodeStore(secret: string) {
  return {
    encrypt: async (json: string) => {
      const list = JSON.parse(json) as unknown[];
      return JSON.stringify(list.map((c) => (isHash(c) ? c : hashBackupCode(secret, String(c)))));
    },
    decrypt: async (stored: string) => JSON.stringify((await storedHashes(secret, stored)) ?? []),
  };
}

/**
 * Before hook, /two-factor/verify-backup-code: the plugin compares the body's code with the
 * stored hashes, so the code becomes its hash here. Returns the context change for Better Auth.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function hashBackupCodeInBody(ctx: any, secret: string) {
  if (ctx.path !== '/two-factor/verify-backup-code') return undefined;
  const code = ctx.body?.code;
  if (typeof code !== 'string' || !code.trim()) return undefined;
  return { context: { body: { ...ctx.body, code: hashBackupCode(secret, code) } } };
}

/** How many unused codes the user still has (R-2F10, Contul tău, FounderBackupCodes). */
export async function countBackupCodesOf(
  db: TwoFactorDb,
  secret: string,
  userId: string,
): Promise<number | null> {
  const row = await db.twoFactor.findFirst({ where: { userId }, select: { backupCodes: true } });
  if (!row) return null;
  return (await storedHashes(secret, row.backupCodes))?.length ?? 0;
}

export type BackupCodesApp = 'hub' | 'founder';

export function auditWriter(app: BackupCodesApp, userId: string): TotpAuditWriter {
  return async (e, metadata) => {
    const founder = app === 'founder';
    await writeAuditEvent(
      {
        category: founder ? 'founder' : 'identity',
        action: founder ? founderAction(e.action) : e.action,
        outcome: e.outcome,
        actorType: e.system ? 'system' : founder ? 'founder' : 'user',
        actorId: e.system ? null : userId,
        founderId: founder && !e.system ? userId : null,
        targetType: founder ? 'founder_user' : 'user',
        targetId: userId,
        metadata,
      },
      founder ? { mode: 'best_effort', connection: 'founder' } : { mode: 'best_effort' },
    );
  };
}

/**
 * D3: new codes after a fresh TOTP code of the signed-in user. The old codes stop working in
 * the same update. Returns the plain codes once; only their hashes are stored. Errors:
 * NotAuthenticated, TwoFactorRequired (no 2FA), Forbidden (wrong code), TwoFactorLocked.
 */
export async function regenerateBackupCodesFor(params: {
  app: BackupCodesApp;
  auth: AuthLike;
  db: TwoFactorDb;
  secret: string;
  headers: Headers;
  code: string;
}): Promise<string[]> {
  const session = await params.auth.api.getSession({ headers: params.headers });
  const userId: string | undefined = session?.user?.id;
  if (!userId) throw new NotAuthenticated();
  if (session.user.twoFactorEnabled !== true) throw new TwoFactorRequired();
  const audit = auditWriter(params.app, userId);

  const check = await verifyTotpWithLockout({
    auth: params.auth,
    db: params.db,
    userId,
    headers: params.headers,
    code: params.code.replace(/\s/g, ''),
    purpose: 'backup_codes_regenerate',
    audit,
  });
  if (check.status === 'locked') throw new TwoFactorLocked(check.lockedUntil);
  if (check.status !== 'valid') throw new Forbidden('Invalid two-factor code');

  const codes = generateBackupCodeList();
  const updated = await params.db.twoFactor.updateMany({
    where: { userId },
    data: { backupCodes: JSON.stringify(codes.map((c) => hashBackupCode(params.secret, c))) },
  });
  if (updated.count === 0) throw new TwoFactorRequired();
  // E14, as Better Auth's endpoint did; the codes never reach the audit row
  await audit(
    { action: AuditActions.twoFactorBackupCodesRegenerated, outcome: 'success' },
    {
      method: 'totp',
    },
  );
  return codes;
}
