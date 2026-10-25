import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { twoFactor } from 'better-auth/plugins';
import { getFounderDb } from './db';

const SESSION_SECONDS = 8 * 60 * 60;

export const founderAuth = betterAuth({
  secret: process.env.FOUNDER_AUTH_SECRET!,
  database: prismaAdapter(getFounderDb(), {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
  },
  session: {
    expiresIn: SESSION_SECONDS,
    updateAge: 60 * 60,
    cookieCache: {
      enabled: false,
    },
  },
  advanced: {
    crossSubDomainCookies: { enabled: false },
    defaultCookieAttributes: {
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV !== 'development',
      httpOnly: true,
    },
  },
  plugins: [
    twoFactor({
      issuer: 'Ventora Founder',
    }),
  ],
});

export type FounderAuth = typeof founderAuth;
