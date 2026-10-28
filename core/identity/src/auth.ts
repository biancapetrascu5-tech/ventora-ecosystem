import { betterAuth, APIError } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer, twoFactor } from 'better-auth/plugins';
import { getIdentityDb } from './db';
import { hashPassword, verifyPassword } from './password-policy';

// Better Auth 1.7.12: expiresIn = session duration when rememberMe !== false.
// rememberMe: false → Better Auth hardcodes 24h. No rememberMeExpiresIn option exists.
const REMEMBER_ME_SECONDS = 30 * 24 * 60 * 60;

export const hubAuth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET!,
  database: prismaAdapter(getIdentityDb(), { provider: 'postgresql', transaction: true }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    // Server-side policy: min 10 chars (enforced above) + 1 uppercase + 1 digit.
    // hashPassword validates before hashing; verifyPassword uses the matching scrypt format.
    password: { hash: hashPassword, verify: verifyPassword },
    resetPasswordTokenExpiresIn: 3600,
  },
  rateLimit: {
    enabled: true,
    storage: 'database',
    // Global rule: generous to avoid blocking authenticated endpoints (get-session, list-sessions, etc.)
    window: 60,
    max: 100,
    // Strict rules for sensitive auth paths — customRules have highest priority in Better Auth 1.7.x
    customRules: {
      '/sign-in/email': { window: 60 * 15, max: 5 },
      '/two-factor/verify-totp': { window: 60 * 15, max: 5 },
      '/two-factor/verify-backup-code': { window: 60 * 15, max: 5 },
      // Better Auth API path for "forget password" flow is /request-password-reset (not /forget-password)
      '/request-password-reset': { window: 60 * 15, max: 5 },
      '/reset-password': { window: 60 * 15, max: 5 },
    },
  },
  session: {
    expiresIn: REMEMBER_ME_SECONDS,
    updateAge: 24 * 60 * 60,
    cookieCache: { enabled: false },
    additionalFields: {
      activeOrganizationId: { type: 'string', nullable: true, defaultValue: null },
    },
  },
  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
    },
    crossSubDomainCookies: { enabled: false },
    defaultCookieAttributes: {
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV !== 'development',
      httpOnly: true,
    },
    // Vercel sets x-forwarded-for to the validated client IP (first value in chain).
    // Using only this header prevents spoofing via other client-controlled headers.
    ipAddress: {
      ipAddressHeaders: ['x-forwarded-for'],
    },
  },
  plugins: [
    bearer(),
    twoFactor({
      issuer: 'Ventora Hub',
      backupCodeOptions: { storeBackupCodes: 'encrypted' },
      accountLockout: { enabled: true, maxFailedAttempts: 5, durationSeconds: 900 },
    }),
  ],
  disabledPaths: ['/two-factor/disable'],
  hooks: {
    before: async (ctx: any) => {
      if (
        (ctx.path === '/two-factor/verify-totp' || ctx.path === '/two-factor/verify-backup-code') &&
        ctx.body?.trustDevice === true
      ) {
        throw new APIError('FORBIDDEN', { message: 'trustDevice is not permitted' });
      }
    },
    after: async (ctx: any) => {
      if (
        ctx.path === '/two-factor/enable' &&
        ctx.session?.session?.userId &&
        ctx.session?.session?.id
      ) {
        const userId: string = ctx.session.session.userId;
        const currentSessionId: string = ctx.session.session.id;
        await getIdentityDb().session.deleteMany({
          where: { userId, id: { not: currentSessionId } },
        });
      }
      // Must return non-undefined: some Better Auth resolutions crash on void return in after hooks
      return {};
    },
  },
});

export type HubAuth = typeof hubAuth;
