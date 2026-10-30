import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import type { PrismaClient as FounderBaseClient } from '../generated/founder-client';

/**
 * The first Founder account (scripts/bootstrap-founder.ts). With /sign-up/email closed over
 * HTTP in Founder (Lot 2.7 · G1), this and addFounderUser are the only ways a Founder account
 * is created; both call Better Auth on the server. Refuses when an active account exists.
 */
export async function bootstrapFounderAccount(
  db: FounderBaseClient,
  secret: string,
  input: { name: string; email: string; password: string },
): Promise<{ userId: string } | { refused: 'exists'; activeCount: number }> {
  const activeCount = await db.user.count({ where: { revokedAt: null } });
  if (activeCount > 0) return { refused: 'exists', activeCount };
  const auth = betterAuth({
    secret,
    database: prismaAdapter(db, { provider: 'postgresql' }),
    emailAndPassword: { enabled: true, minPasswordLength: 12 },
    session: { expiresIn: 8 * 60 * 60, cookieCache: { enabled: false } },
    advanced: { crossSubDomainCookies: { enabled: false } },
  });
  const result = await auth.api.signUpEmail({ body: input });
  return { userId: result.user.id };
}
