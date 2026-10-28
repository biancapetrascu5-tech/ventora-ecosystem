import { betterAuth } from 'better-auth';
import { getIdentityDb } from './db';
import { createHubAuthOptions } from './auth-options';

export const hubAuth = betterAuth(
  createHubAuthOptions(getIdentityDb(), process.env.BETTER_AUTH_SECRET!),
);

export type HubAuth = typeof hubAuth;
