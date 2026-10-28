import { betterAuth } from 'better-auth';
import { getFounderDb } from './db';
import { createFounderAuthOptions } from './auth-options';

export const founderAuth = betterAuth(
  createFounderAuthOptions(getFounderDb(), process.env.FOUNDER_AUTH_SECRET!),
);

export type FounderAuth = typeof founderAuth;
