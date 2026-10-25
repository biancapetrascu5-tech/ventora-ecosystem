import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer, twoFactor } from 'better-auth/plugins';
import { getIdentityDb } from './db';

const REMEMBER_ME_SECONDS = 30 * 24 * 60 * 60;
const SESSION_SECONDS = 7 * 24 * 60 * 60;

export const hubAuth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET!,
  database: prismaAdapter(getIdentityDb(), {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: SESSION_SECONDS,
    updateAge: 24 * 60 * 60,
    rememberMeExpiresIn: REMEMBER_ME_SECONDS,
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
    bearer(),
    twoFactor({
      issuer: 'Ventora Hub',
    }),
  ],
});

export type HubAuth = typeof hubAuth;
