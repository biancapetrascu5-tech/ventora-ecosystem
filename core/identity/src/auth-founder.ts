import { betterAuth, APIError } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { twoFactor } from 'better-auth/plugins';
import { getFounderDb } from './db';
import { hashPassword, verifyPassword } from './password-policy';

const SESSION_SECONDS = 8 * 60 * 60;

export const founderAuth = betterAuth({
  secret: process.env.FOUNDER_AUTH_SECRET!,
  database: prismaAdapter(getFounderDb(), { provider: 'postgresql', transaction: true }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    password: { hash: hashPassword, verify: verifyPassword },
    resetPasswordTokenExpiresIn: 3600,
  },
  rateLimit: {
    enabled: true,
    storage: 'database',
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/email': { window: 60 * 15, max: 5 },
      '/two-factor/verify-totp': { window: 60 * 15, max: 5 },
      '/two-factor/verify-backup-code': { window: 60 * 15, max: 5 },
      '/request-password-reset': { window: 60 * 15, max: 5 },
      '/reset-password': { window: 60 * 15, max: 5 },
    },
  },
  session: {
    expiresIn: SESSION_SECONDS,
    updateAge: 60 * 60,
    cookieCache: { enabled: false },
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
    twoFactor({
      issuer: 'Ventora Founder',
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
        await getFounderDb().session.deleteMany({
          where: { userId, id: { not: currentSessionId } },
        });
      }
      // Must return non-undefined: some Better Auth resolutions crash on void return in after hooks
      return {};
    },
  },
});

export type FounderAuth = typeof founderAuth;
