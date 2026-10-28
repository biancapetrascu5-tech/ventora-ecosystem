import { APIError } from 'better-auth';
import { createAuthMiddleware, isAPIError } from 'better-auth/api';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer, twoFactor } from 'better-auth/plugins';
import type { UserWithTwoFactor } from 'better-auth/plugins/two-factor';
import type { PrismaClient as IdentityBaseClient } from '../generated/identity-client';
import type { PrismaClient as FounderBaseClient } from '../generated/founder-client';
import { hashPassword, verifyPassword } from './password-policy';
import { createAuthAuditHooks } from './audit-hooks';

const HUB_RATE_LIMIT = {
  enabled: true,
  storage: 'database' as const,
  window: 60,
  max: 100,
  customRules: {
    '/sign-in/email': { window: 60 * 15, max: 5 },
    '/two-factor/verify-totp': { window: 60 * 15, max: 5 },
    '/two-factor/verify-backup-code': { window: 60 * 15, max: 5 },
    '/request-password-reset': { window: 60 * 15, max: 5 },
    '/reset-password': { window: 60 * 15, max: 5 },
  },
};

const FOUNDER_RATE_LIMIT = { ...HUB_RATE_LIMIT };

type AuthAudit = ReturnType<typeof createAuthAuditHooks>;
type SessionDb = {
  session: { deleteMany(args: unknown): Promise<{ count: number }> };
};

/**
 * Revoke all other sessions when 2FA enrollment completes (after hook).
 * Detection: a session whose user had twoFactorEnabled=false calling verify-totp — this
 * combination only occurs during enrollment (the sign-in challenge has no session).
 * Better Auth (two-factor/totp) rotates the session on enrollment: it creates a new one,
 * exposes it as ctx.context.newSession, and deletes the old one. The new session is the
 * one the user keeps; without it we revoke nothing rather than log the user out (E6-a).
 */
export async function revokeOtherSessionsOn2faEnroll(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  db: SessionDb,
  audit: AuthAudit,
): Promise<void> {
  const sessionUser = ctx.context.session?.user as UserWithTwoFactor | undefined;
  const userId: string | undefined = ctx.context.session?.session?.userId;
  if (
    ctx.path !== '/two-factor/verify-totp' ||
    isAPIError(ctx.context.returned) ||
    !userId ||
    sessionUser?.twoFactorEnabled === true
  ) {
    return;
  }
  const newSession = ctx.context.newSession;
  const keepId: string | undefined =
    newSession?.user?.id === userId ? newSession?.session?.id : undefined;
  if (!keepId) {
    console.error('[identity] 2FA enrollment without a new session; other sessions kept', {
      userId,
    });
    await audit.sessionsRevokedOn2faEnroll(ctx, userId, 0, 'no_new_session');
    return;
  }
  const revoked = await db.session.deleteMany({ where: { userId, id: { not: keepId } } });
  await audit.sessionsRevokedOn2faEnroll(ctx, userId, revoked.count);
}

export function createHubAuthOptions(db: IdentityBaseClient, secret: string) {
  const REMEMBER_ME_SECONDS = 30 * 24 * 60 * 60;

  const audit = createAuthAuditHooks('hub', db);

  const before = createAuthMiddleware(async (ctx) => {
    if (
      (ctx.path === '/two-factor/verify-totp' || ctx.path === '/two-factor/verify-backup-code') &&
      ctx.body?.trustDevice === true
    ) {
      await audit.trustDeviceRejected(ctx);
      throw new APIError('FORBIDDEN', { message: 'trustDevice is not permitted' });
    }
    await audit.before(ctx);
  });

  const after = createAuthMiddleware(async (ctx) => {
    await revokeOtherSessionsOn2faEnroll(ctx, db, audit);
    await audit.after(ctx);
  });

  return {
    secret,
    database: prismaAdapter(db, { provider: 'postgresql', transaction: true }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      password: { hash: hashPassword, verify: verifyPassword },
      resetPasswordTokenExpiresIn: 3600,
      // D17: a completed password reset closes every open session of the user
      revokeSessionsOnPasswordReset: true,
      // no-op: password reset emails are sent by a separate service watching the verification table
      sendResetPassword: async () => {},
    },
    rateLimit: HUB_RATE_LIMIT,
    session: {
      expiresIn: REMEMBER_ME_SECONDS,
      updateAge: 24 * 60 * 60,
      cookieCache: { enabled: false },
      additionalFields: {
        activeOrganizationId: { type: 'string' as const, nullable: true, defaultValue: null },
      },
    },
    plugins: [
      bearer(),
      twoFactor({
        issuer: 'Ventora Hub',
        backupCodeOptions: { storeBackupCodes: 'encrypted' as const },
        accountLockout: { enabled: true, maxFailedAttempts: 5, durationSeconds: 900 },
      }),
    ],
    disabledPaths: ['/two-factor/disable'],
    hooks: { before, after },
    advanced: {
      database: { generateId: () => crypto.randomUUID() },
      crossSubDomainCookies: { enabled: false },
      defaultCookieAttributes: {
        sameSite: 'lax' as const,
        secure: process.env.NODE_ENV !== 'development',
        httpOnly: true,
      },
      ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
    },
  };
}

export function createFounderAuthOptions(db: FounderBaseClient, secret: string) {
  const SESSION_SECONDS = 8 * 60 * 60;

  const audit = createAuthAuditHooks('founder', db);

  const before = createAuthMiddleware(async (ctx) => {
    if (
      (ctx.path === '/two-factor/verify-totp' || ctx.path === '/two-factor/verify-backup-code') &&
      ctx.body?.trustDevice === true
    ) {
      await audit.trustDeviceRejected(ctx);
      throw new APIError('FORBIDDEN', { message: 'trustDevice is not permitted' });
    }
    await audit.before(ctx);
  });

  const after = createAuthMiddleware(async (ctx) => {
    await revokeOtherSessionsOn2faEnroll(ctx, db, audit);
    await audit.after(ctx);
  });

  return {
    secret,
    database: prismaAdapter(db, { provider: 'postgresql', transaction: true }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      password: { hash: hashPassword, verify: verifyPassword },
      resetPasswordTokenExpiresIn: 3600,
      // D17: a completed password reset closes every open session of the user
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async () => {},
    },
    rateLimit: FOUNDER_RATE_LIMIT,
    session: {
      expiresIn: SESSION_SECONDS,
      updateAge: 60 * 60,
      cookieCache: { enabled: false },
    },
    plugins: [
      twoFactor({
        issuer: 'Ventora Founder',
        backupCodeOptions: { storeBackupCodes: 'encrypted' as const },
        accountLockout: { enabled: true, maxFailedAttempts: 5, durationSeconds: 900 },
      }),
    ],
    disabledPaths: ['/two-factor/disable'],
    hooks: { before, after },
    advanced: {
      database: { generateId: () => crypto.randomUUID() },
      crossSubDomainCookies: { enabled: false },
      defaultCookieAttributes: {
        sameSite: 'lax' as const,
        secure: process.env.NODE_ENV !== 'development',
        httpOnly: true,
      },
      ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
    },
  };
}
