import { betterAuth } from 'better-auth';
import type { PrismaClient as FounderBaseClient } from '../generated/founder-client';
import { createFounderAuthOptions } from './auth-options';

/**
 * The first Founder account (scripts/bootstrap-founder.ts). With /sign-up/email closed over
 * HTTP in Founder (Lot 2.7 · G1), this and addFounderUser are the only ways a Founder account
 * is created; both call Better Auth on the server. Refuses when an active account exists.
 *
 * Uses the Founder app's own configuration (createFounderAuthOptions): the same UUID ids that
 * organizations.founder_create_organization requires, the same password policy and hooks.
 * `db` must run under founder_identity_rw (makeFounderClient).
 */
export async function bootstrapFounderAccount(
  db: FounderBaseClient,
  secret: string,
  input: { name: string; email: string; password: string },
): Promise<{ userId: string } | { refused: 'exists'; activeCount: number }> {
  const activeCount = await db.user.count({ where: { revokedAt: null } });
  if (activeCount > 0) return { refused: 'exists', activeCount };
  const auth = betterAuth(createFounderAuthOptions(db, secret));
  const result = await auth.api.signUpEmail({ body: input });
  return { userId: result.user.id };
}
