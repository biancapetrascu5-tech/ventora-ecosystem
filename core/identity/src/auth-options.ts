import { APIError } from 'better-auth';
import { createAuthMiddleware, isAPIError } from 'better-auth/api';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer, twoFactor } from 'better-auth/plugins';
import type { UserWithTwoFactor } from 'better-auth/plugins/two-factor';
import type { PrismaClient as IdentityBaseClient } from '../generated/identity-client';
import type { PrismaClient as FounderBaseClient } from '../generated/founder-client';
import { hashPassword, verifyPassword } from './password-policy';
import {
  deliverEmail,
  passwordResetLink,
  renderPasswordReset,
  type AuthApp,
} from '@ventora/notifications';
import { createAuthAuditHooks } from './audit-hooks';
import {
  generateBackupCodeList,
  hashBackupCodeInBody,
  hashedBackupCodeStore,
} from './backup-codes';
import { addLockedUntil } from './lock-info';
import { runAuthBackgroundTask } from './background';
import {
  afterPasswordHooks,
  beforeRequestPasswordReset,
  passwordResetRenewal,
  RENEW_RESET_LINK_PATH,
} from './password-reset';

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
    [RENEW_RESET_LINK_PATH]: { window: 60 * 15, max: 5 },
  },
};

const FOUNDER_RATE_LIMIT = { ...HUB_RATE_LIMIT };

// R-2F5 / S61: 5 consecutive wrong codes lock the account for 15 minutes (Hub and Founder).
// Also applied by verifyFounderTotp() to the Founder's re-authentication (D14), on the same row.
export const TWO_FACTOR_LOCKOUT = { enabled: true, maxFailedAttempts: 5, durationSeconds: 900 };

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

/**
 * emailAndPassword.sendResetPassword: E-1 (Hub) / E-2 (Founder) through core/notifications.
 * Better Auth calls it only for an existing account. The link is built from the token and the
 * app's public URL (B-4), not from Better Auth's `url` (no baseURL is configured). Never throws:
 * a failed delivery is logged and audited, the reset request itself has already succeeded.
 */
export function createSendResetPassword(app: AuthApp, audit: AuthAudit) {
  return async (
    data: { user: { id: string; email: string; name?: string | null }; token: string },
    request?: Request,
  ): Promise<void> => {
    const { user, token } = data;
    const rendered = renderPasswordReset({
      app,
      email: user.email,
      name: user.name,
      link: passwordResetLink(app, token),
    });
    const result = await deliverEmail({
      to: user.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    if (result.status === 'failed') {
      await audit.passwordResetEmailFailed(
        { headers: request?.headers },
        user.id,
        user.email,
        result.reason,
      );
    }
  };
}

const BACKGROUND_TASKS = { handler: runAuthBackgroundTask };

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
    await beforeRequestPasswordReset(ctx, db, audit);
    await audit.before(ctx);
    return hashBackupCodeInBody(ctx, secret);
  });

  const after = createAuthMiddleware(async (ctx) => {
    await revokeOtherSessionsOn2faEnroll(ctx, db, audit);
    await audit.after(ctx);
    await afterPasswordHooks(ctx, db, audit);
    // last: it replaces the answer when the account is locked (B)
    await addLockedUntil(ctx, db);
  });

  return {
    secret,
    database: prismaAdapter(db, { provider: 'postgresql', transaction: true }),
    // R-PR5: expired reset rows must survive; cleanupExpiredVerifications() does the cleanup
    verification: { disableCleanup: true },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      password: { hash: hashPassword, verify: verifyPassword },
      resetPasswordTokenExpiresIn: 3600,
      // D17: a completed password reset closes every open session of the user
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: createSendResetPassword('hub', audit),
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
      passwordResetRenewal({ db, audit }),
      twoFactor({
        issuer: 'Ventora Hub',
        // D1: 10 codes of 8 digits, stored as HMACs (backup-codes.ts)
        backupCodeOptions: {
          customBackupCodesGenerate: generateBackupCodeList,
          storeBackupCodes: hashedBackupCodeStore(secret),
        },
        accountLockout: TWO_FACTOR_LOCKOUT,
      }),
    ],
    // D3: new backup codes only with the TOTP code (regenerateBackupCodes), not the password
    disabledPaths: ['/two-factor/disable', '/two-factor/generate-backup-codes'],
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
      // the reset email leaves after the response (timing, B-6)
      backgroundTasks: BACKGROUND_TASKS,
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
    await beforeRequestPasswordReset(ctx, db, audit);
    await audit.before(ctx);
    return hashBackupCodeInBody(ctx, secret);
  });

  const after = createAuthMiddleware(async (ctx) => {
    await revokeOtherSessionsOn2faEnroll(ctx, db, audit);
    await audit.after(ctx);
    await afterPasswordHooks(ctx, db, audit);
    // last: it replaces the answer when the account is locked (B)
    await addLockedUntil(ctx, db);
  });

  return {
    secret,
    database: prismaAdapter(db, { provider: 'postgresql', transaction: true }),
    verification: { disableCleanup: true },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      password: { hash: hashPassword, verify: verifyPassword },
      resetPasswordTokenExpiresIn: 3600,
      // D17: a completed password reset closes every open session of the user
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: createSendResetPassword('founder', audit),
    },
    rateLimit: FOUNDER_RATE_LIMIT,
    session: {
      expiresIn: SESSION_SECONDS,
      updateAge: 60 * 60,
      cookieCache: { enabled: false },
    },
    plugins: [
      passwordResetRenewal({ db, audit }),
      twoFactor({
        issuer: 'Ventora Founder',
        // D1: 10 codes of 8 digits, stored as HMACs (backup-codes.ts)
        backupCodeOptions: {
          customBackupCodesGenerate: generateBackupCodeList,
          storeBackupCodes: hashedBackupCodeStore(secret),
        },
        accountLockout: TWO_FACTOR_LOCKOUT,
      }),
    ],
    // D3: new backup codes only with the TOTP code (regenerateBackupCodes), not the password
    disabledPaths: ['/two-factor/disable', '/two-factor/generate-backup-codes'],
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
      backgroundTasks: BACKGROUND_TASKS,
    },
  };
}
