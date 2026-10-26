import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { twoFactor } from 'better-auth/plugins';
import { getFounderDb } from './db';
import { hashPassword, verifyPassword } from './password-policy';

const SESSION_SECONDS = 8 * 60 * 60;

export const founderAuth = betterAuth({
  secret: process.env.FOUNDER_AUTH_SECRET!,
  database: prismaAdapter(getFounderDb(), { provider: 'postgresql' }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    password: { hash: hashPassword, verify: verifyPassword },
  },
  rateLimit: {
    enabled: true,
    storage: 'database',
    window: 60 * 15,
    max: 5,
  },
  session: {
    expiresIn: SESSION_SECONDS,
    updateAge: 60 * 60,
    cookieCache: { enabled: false },
  },
  advanced: {
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
  plugins: [twoFactor({ issuer: 'Ventora Founder' })],
});

export type FounderAuth = typeof founderAuth;
