import { isAPIError } from 'better-auth/api';

/* eslint-disable @typescript-eslint/no-explicit-any */
type HookCtx = any;
type AuthDb = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

const LOCK_PATHS = new Set(['/two-factor/verify-totp', '/two-factor/verify-backup-code']);
const WRONG_CODES = new Set(['INVALID_CODE', 'INVALID_BACKUP_CODE']);

/** The 429 the screens read: same code as Better Auth, plus `lockedUntil` (ISO). */
export type TwoFactorLockedBody = {
  code: 'ACCOUNT_TEMPORARILY_LOCKED';
  message: string;
  lockedUntil: string;
};

/** Who is verifying: the session (enrollment) or the sign-in challenge cookie. */
async function verifyingUserId(ctx: HookCtx): Promise<string | null> {
  const fromSession = ctx.context.session?.user?.id;
  if (fromSession) return fromSession;
  try {
    const cookie = ctx.context.createAuthCookie('two_factor');
    const signed = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
    if (!signed) return null;
    const row = await ctx.context.internalAdapter.findVerificationValue(signed);
    return row?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * After hook (decision B, 29.10.2026): when a two-step check ends with the account locked —
 * Better Auth's 429 ACCOUNT_TEMPORARILY_LOCKED, or the wrong code that just set the lock (A3:
 * the 5th wrong code answers "locked" directly) — the answer carries `lockedUntil`, so the
 * sign-in and verification screens show the exact time.
 *
 * Only the sign-in challenge over HTTP (the enrollment and re-authentication checks run with a
 * session: Better Auth keeps no lock there, verifyTotpWithLockout answers with lockedUntil).
 * The answer is a Response, not a thrown APIError: Better Auth keeps the endpoint's status
 * (401) for an error replaced in an after hook, but returns a Response unchanged.
 */
export async function addLockedUntil(ctx: HookCtx, db: AuthDb): Promise<void> {
  if (!LOCK_PATHS.has(ctx.path) || !ctx.request || ctx.context.session) return;
  const returned = ctx.context.returned;
  if (!isAPIError(returned)) return;
  const code = (returned.body as { code?: string } | undefined)?.code;
  const lockedAnswer =
    returned.status === 'TOO_MANY_REQUESTS' && code === 'ACCOUNT_TEMPORARILY_LOCKED';
  if (!lockedAnswer && !(code && WRONG_CODES.has(code))) return;

  const userId = await verifyingUserId(ctx);
  if (!userId) return;
  const row = await db.twoFactor.findFirst({ where: { userId }, select: { lockedUntil: true } });
  const lockedUntil: Date | null | undefined = row?.lockedUntil;
  if (!lockedUntil || lockedUntil.getTime() <= Date.now()) return;

  const body: TwoFactorLockedBody = {
    code: 'ACCOUNT_TEMPORARILY_LOCKED',
    message: 'Account temporarily locked',
    lockedUntil: lockedUntil.toISOString(),
  };
  const seconds = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000));
  ctx.context.returned = new Response(JSON.stringify(body), {
    status: 429,
    headers: { 'Content-Type': 'application/json', 'Retry-After': String(seconds) },
  });
}
