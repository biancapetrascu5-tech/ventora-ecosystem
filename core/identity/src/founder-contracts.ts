import type { UserWithTwoFactor } from 'better-auth/plugins/two-factor';
import { TwoFactorRequired } from '@ventora/errors';
import { founderAuth } from './auth-founder';
import { getFounderDb } from './db';

export type FounderSession = {
  id: string;
  userId: string;
  expiresAt: Date;
  token: string;
  twoFactorEnabled: boolean;
};

export type FounderUserRecord = {
  id: string;
  name: string;
  email: string;
  revokedAt: Date | null;
  createdByFounderId: string | null;
};

export async function getFounderSession(headers: Headers): Promise<FounderSession | null> {
  const result = await founderAuth.api.getSession({ headers });
  if (!result?.session) return null;

  const founder = await getFounderDb().user.findUnique({
    where: { id: result.session.userId },
    select: { revokedAt: true },
  });
  if (founder?.revokedAt) return null;

  return {
    id: result.session.id,
    userId: result.session.userId,
    expiresAt: result.session.expiresAt,
    token: result.session.token,
    twoFactorEnabled: (result.user as UserWithTwoFactor).twoFactorEnabled === true,
  };
}

/** Requires a valid founder session with 2FA already verified. Throws otherwise. */
export async function requireFounderSession(headers: Headers): Promise<FounderSession> {
  const session = await getFounderSession(headers);
  if (!session) throw Object.assign(new Error('NotAuthenticated'), { code: 'NOT_AUTHENTICATED' });
  if (!session.twoFactorEnabled) throw new TwoFactorRequired();
  return session;
}

export async function addFounderUser(
  actingFounderId: string,
  params: { name: string; email: string; password: string },
): Promise<FounderUserRecord> {
  const actor = await getFounderDb().user.findUnique({
    where: { id: actingFounderId },
    select: { revokedAt: true, twoFactorEnabled: true },
  });
  if (!actor || actor.revokedAt) {
    throw Object.assign(new Error('NotAuthenticated'), { code: 'NOT_AUTHENTICATED' });
  }
  if (!(actor as any).twoFactorEnabled) throw new TwoFactorRequired();

  const result = await founderAuth.api.signUpEmail({
    body: {
      name: params.name,
      email: params.email,
      password: params.password,
    },
  });

  const newUser = await getFounderDb().user.update({
    where: { id: result.user.id },
    data: { createdByFounderId: actingFounderId },
  });

  return {
    id: newUser.id,
    name: newUser.name,
    email: newUser.email,
    revokedAt: newUser.revokedAt,
    createdByFounderId: newUser.createdByFounderId,
  };
}

export async function revokeFounderUser(
  actingFounderId: string,
  targetFounderId: string,
): Promise<void> {
  if (actingFounderId === targetFounderId) {
    throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN', reason: 'self-revoke' });
  }

  const actorForRevoke = await getFounderDb().user.findUnique({
    where: { id: actingFounderId },
    select: { revokedAt: true, twoFactorEnabled: true },
  });
  if (!actorForRevoke || actorForRevoke.revokedAt) {
    throw Object.assign(new Error('NotAuthenticated'), { code: 'NOT_AUTHENTICATED' });
  }
  if (!(actorForRevoke as any).twoFactorEnabled) throw new TwoFactorRequired();

  const activeCount = await getFounderDb().user.count({
    where: { revokedAt: null },
  });
  if (activeCount <= 1) {
    throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN', reason: 'last-founder' });
  }

  await getFounderDb().user.update({
    where: { id: targetFounderId },
    data: {
      revokedAt: new Date(),
      revokedByFounderId: actingFounderId,
    },
  });

  await getFounderDb().session.deleteMany({
    where: { userId: targetFounderId },
  });
}
