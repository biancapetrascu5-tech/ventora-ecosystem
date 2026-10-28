import type { UserWithTwoFactor } from 'better-auth/plugins/two-factor';
import { hubAuth } from './auth';
import { getIdentityDb } from './db';

export type HubSession = {
  id: string;
  userId: string;
  expiresAt: Date;
  token: string;
  ipAddress: string | null;
  userAgent: string | null;
  activeOrganizationId: string | null;
  twoFactorEnabled: boolean;
};

export type HubUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
};

export async function getSession(headers: Headers): Promise<HubSession | null> {
  const result = await hubAuth.api.getSession({ headers });
  if (!result?.session) return null;
  return {
    id: result.session.id,
    userId: result.session.userId,
    expiresAt: result.session.expiresAt,
    token: result.session.token,
    ipAddress: result.session.ipAddress ?? null,
    userAgent: result.session.userAgent ?? null,
    activeOrganizationId: (result.session as any).activeOrganizationId ?? null,
    twoFactorEnabled: (result.user as UserWithTwoFactor).twoFactorEnabled === true,
  };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await getIdentityDb().session.delete({ where: { id: sessionId } });
}

export async function getUserById(userId: string): Promise<HubUser | null> {
  const user = await getIdentityDb().user.findUnique({ where: { id: userId } });
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
  };
}

export async function listSessions(userId: string): Promise<HubSession[]> {
  const [sessions, user] = await Promise.all([
    getIdentityDb().session.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { updatedAt: 'desc' },
    }),
    getIdentityDb().user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true },
    }),
  ]);
  const twoFactorEnabled = (user as any)?.twoFactorEnabled === true;
  return sessions.map((s) => ({
    id: s.id,
    userId: s.userId,
    expiresAt: s.expiresAt,
    token: s.token,
    ipAddress: s.ipAddress ?? null,
    userAgent: s.userAgent ?? null,
    activeOrganizationId: (s as any).activeOrganizationId ?? null,
    twoFactorEnabled,
  }));
}
