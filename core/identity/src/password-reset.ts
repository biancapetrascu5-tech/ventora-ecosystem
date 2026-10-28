import { APIError, type BetterAuthPlugin } from 'better-auth';
import { createAuthEndpoint, isAPIError } from 'better-auth/api';
import { deliverEmail, renderPasswordChanged } from '@ventora/notifications';
import { hashEmail } from '@ventora/audit';
import type { createAuthAuditHooks } from './audit-hooks';

// Password reset rules on top of Better Auth (Lot 2.4b, decisions R-PR3 – R-PR7):
// - R-PR3: a new request for a user deletes every earlier reset token of that user;
// - R-PR4: at most 5 requests per hour per (normalized) address, besides the per-IP rule.
//   The limit is the same for addresses without an account; the 429 carries `retryAt`;
// - R-PR5: POST /request-new-reset-link {token}: an expired token whose row still exists gets a
//   new link on the account's address; unknown / used / malformed → "forgot password" (R-PR6);
// - R-PR7: after a reset or a change of password, a "password changed" notice (best_effort).
//
// Expired reset rows have to outlive their expiry for R-PR5, so Better Auth's own cleanup
// (it deletes every expired verification row on each lookup) is off (`verification.
// disableCleanup`) and cleanupExpiredVerifications() replaces it.

/* eslint-disable @typescript-eslint/no-explicit-any */
type HookCtx = any;
type ResetDb = any;
type AuthAudit = ReturnType<typeof createAuthAuditHooks>;

export const RESET_IDENTIFIER_PREFIX = 'reset-password:';
export const RENEW_RESET_LINK_PATH = '/request-new-reset-link';
export const RESET_EMAIL_LIMIT = { windowMs: 60 * 60 * 1000, max: 5 };
// CONFIRMAT (7 days): how long an expired reset link can still ask for a new one (R-PR5).
export const EXPIRED_RESET_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const RATE_LIMIT_KEY_PREFIX = 'password-reset-email:';
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{8,128}$/;
// Paths whose requests read verification rows; Better Auth cleaned up on exactly those reads.
const CLEANUP_PATHS = new Set([
  '/sign-in/email',
  '/two-factor/verify-totp',
  '/two-factor/verify-backup-code',
  '/request-password-reset',
  '/reset-password',
  RENEW_RESET_LINK_PATH,
]);

/** R-PR5 answer. `forgot_password`: the screen sends the user to "Ai uitat parola?". */
export type ResetLinkRenewalResult = { status: 'link_sent' } | { status: 'forgot_password' };

/** Body of the 429 sent when the per-address limit (R-PR4) is reached. */
export type PasswordResetRateLimitedBody = {
  code: 'PASSWORD_RESET_RATE_LIMITED';
  message: string;
  retryAt: string;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type ResetQuota = { limited: false } | { limited: true; retryAt: Date };

/**
 * R-PR4: fixed one-hour window per address, stored in identity.rate_limit (the table Better Auth
 * uses for the per-IP rules) under its own key prefix; `last_request` holds the window start.
 * The increment is a conditional update, so concurrent requests cannot pass the limit.
 */
export async function consumeResetEmailQuota(
  db: ResetDb,
  email: string,
  now = Date.now(),
): Promise<ResetQuota> {
  const key = `${RATE_LIMIT_KEY_PREFIX}${hashEmail(email)}`;
  const { windowMs, max } = RESET_EMAIL_LIMIT;
  for (let attempt = 0; attempt < 3; attempt++) {
    const bumped = await db.rateLimit.updateMany({
      where: { key, lastRequest: { gt: now - windowMs }, count: { lt: max } },
      data: { count: { increment: 1 } },
    });
    if (bumped.count === 1) return { limited: false };

    const row = await db.rateLimit.findUnique({ where: { key } });
    if (!row) {
      try {
        await db.rateLimit.create({
          data: { id: crypto.randomUUID(), key, count: 1, lastRequest: now },
        });
        return { limited: false };
      } catch (err) {
        if ((err as { code?: string }).code === 'P2002') continue; // created concurrently
        throw err;
      }
    }
    if (row.lastRequest <= now - windowMs) {
      // window over: start a new one, unless another request already did
      const restarted = await db.rateLimit.updateMany({
        where: { key, lastRequest: row.lastRequest },
        data: { count: 1, lastRequest: now },
      });
      if (restarted.count === 1) return { limited: false };
      continue;
    }
    return { limited: true, retryAt: new Date(row.lastRequest + windowMs) };
  }
  return { limited: false };
}

export function resetRateLimitedError(retryAt: Date, now = Date.now()): APIError {
  const body: PasswordResetRateLimitedBody = {
    code: 'PASSWORD_RESET_RATE_LIMITED',
    message: 'Too many password reset requests for this address',
    retryAt: retryAt.toISOString(),
  };
  const seconds = Math.max(1, Math.ceil((retryAt.getTime() - now) / 1000));
  return new APIError('TOO_MANY_REQUESTS', body, { 'Retry-After': String(seconds) });
}

/**
 * R-PR3: deletes every reset token of the user. Called with `null` for an unknown address too,
 * so both cases run the same queries (timing, like Better Auth's dummy lookup).
 */
export async function invalidateResetTokens(db: ResetDb, userId: string | null): Promise<number> {
  const deleted = await db.verification.deleteMany({
    where: { value: userId ?? '', identifier: { startsWith: RESET_IDENTIFIER_PREFIX } },
  });
  return deleted.count;
}

/**
 * Replaces Better Auth's cleanup: expired rows go, except reset tokens, which stay
 * EXPIRED_RESET_RETENTION_MS after their expiry so R-PR5 can recognise them.
 */
export async function cleanupExpiredVerifications(db: ResetDb, now = new Date()): Promise<void> {
  await db.verification.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: now }, NOT: { identifier: { startsWith: RESET_IDENTIFIER_PREFIX } } },
        { expiresAt: { lt: new Date(now.getTime() - EXPIRED_RESET_RETENTION_MS) } },
      ],
    },
  });
}

/** Before hook, /request-password-reset: R-PR4 then R-PR3, before Better Auth creates the token. */
export async function beforeRequestPasswordReset(
  ctx: HookCtx,
  db: ResetDb,
  audit: AuthAudit,
): Promise<void> {
  if (ctx.path !== '/request-password-reset') return;
  const raw = ctx.body?.email;
  if (typeof raw !== 'string' || !raw.trim()) return; // Better Auth rejects the body itself
  const email = normalizeEmail(raw);
  const quota = await consumeResetEmailQuota(db, email);
  if (quota.limited) {
    await audit.passwordResetRateLimited(ctx, email, quota.retryAt);
    throw resetRateLimitedError(quota.retryAt);
  }
  const user = await db.user.findFirst({ where: { email }, select: { id: true } });
  await invalidateResetTokens(db, user?.id ?? null);
}

/** R-PR7: renders and sends the notice. Never throws; a failed delivery is audited. */
export async function sendPasswordChangedNotice(
  audit: AuthAudit,
  ctx: HookCtx,
  user: { id: string; email: string; name?: string | null },
  trigger: 'reset' | 'change',
): Promise<void> {
  try {
    const rendered = renderPasswordChanged({ email: user.email, trigger, changedAt: new Date() });
    const result = await deliverEmail({
      to: user.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    if (result.status === 'failed') {
      await audit.passwordChangedEmailFailed(ctx, user.id, user.email, result.reason, trigger);
    }
  } catch (err) {
    console.error('[identity] password changed notice failed', {
      userId: user.id,
      error: err instanceof Error ? err.name : 'unknown',
    });
  }
}

/** After hook: R-PR7 notice, then the replacement for Better Auth's verification cleanup. */
export async function afterPasswordHooks(
  ctx: HookCtx,
  db: ResetDb,
  audit: AuthAudit,
): Promise<void> {
  const path: string = ctx.path;
  if (!isAPIError(ctx.context.returned)) {
    let user: { id: string; email: string; name?: string | null } | null = null;
    if (path === '/reset-password') {
      const userId = audit.resetUserId(ctx);
      user = userId
        ? await db.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, name: true },
          })
        : null;
    } else if (path === '/change-password') {
      user = ctx.context.session?.user ?? null;
    }
    if (user) {
      const trigger = path === '/reset-password' ? 'reset' : 'change';
      await ctx.context.runInBackgroundOrAwait(
        sendPasswordChangedNotice(audit, ctx, user, trigger),
      );
    }
  }
  if (CLEANUP_PATHS.has(path)) {
    try {
      await cleanupExpiredVerifications(db);
    } catch (err) {
      console.error('[identity] verification cleanup failed', {
        error: err instanceof Error ? err.name : 'unknown',
      });
    }
  }
}

function generateResetToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('base64url');
}

/**
 * R-PR5 endpoint. Expired (or still valid) token whose row exists → new link on the account's
 * address, under R-PR3 and R-PR4. Anything else → `forgot_password`, without saying whether the
 * link ever existed (R-PR6).
 */
export function passwordResetRenewal(deps: { db: ResetDb; audit: AuthAudit }) {
  const { db, audit } = deps;
  return {
    id: 'ventora-password-reset-renewal',
    endpoints: {
      requestNewResetLink: createAuthEndpoint(
        RENEW_RESET_LINK_PATH,
        { method: 'POST' },
        async (ctx): Promise<ResetLinkRenewalResult> => {
          const forgot: ResetLinkRenewalResult = { status: 'forgot_password' };
          const token = (ctx.body as { token?: unknown } | undefined)?.token;
          if (typeof token !== 'string' || !TOKEN_SHAPE.test(token)) return forgot;

          const row = await ctx.context.internalAdapter.findVerificationValue(
            `${RESET_IDENTIFIER_PREFIX}${token}`,
          );
          if (!row) return forgot;
          const user = await ctx.context.internalAdapter.findUserById(row.value);
          if (!user) return forgot;

          const quota = await consumeResetEmailQuota(db, normalizeEmail(user.email));
          if (quota.limited) {
            await audit.passwordResetRateLimited(ctx, user.email, quota.retryAt);
            throw resetRateLimitedError(quota.retryAt);
          }
          await invalidateResetTokens(db, user.id);

          const options = ctx.context.options.emailAndPassword;
          const newToken = generateResetToken();
          await ctx.context.internalAdapter.createVerificationValue({
            value: user.id,
            identifier: `${RESET_IDENTIFIER_PREFIX}${newToken}`,
            expiresAt: new Date(Date.now() + (options?.resetPasswordTokenExpiresIn ?? 3600) * 1000),
          });
          await audit.passwordResetRenewed(ctx, user.id, user.email);
          if (options?.sendResetPassword) {
            await ctx.context.runInBackgroundOrAwait(
              options.sendResetPassword({ user, url: '', token: newToken }, ctx.request),
            );
          }
          return { status: 'link_sent' };
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
