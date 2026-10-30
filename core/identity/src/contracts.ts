import type { UserWithTwoFactor } from 'better-auth/plugins/two-factor';
import { hubAuth } from './auth';
import { getIdentityDb } from './db';
import { AuditActions, writeAuditEvent } from '@ventora/audit';

export type HubSession = {
  id: string;
  userId: string;
  expiresAt: Date;
  token: string;
  ipAddress: string | null;
  userAgent: string | null;
  activeOrganizationId: string | null;
  twoFactorEnabled: boolean;
  /** Lot 2.7 · D: last use of the session (Dispozitive conectate); only from listSessions. */
  lastActiveAt?: Date;
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
  const deleted = await getIdentityDb().session.delete({ where: { id: sessionId } });
  // E5 (best_effort, D2)
  await writeAuditEvent(
    {
      category: 'identity',
      action: AuditActions.sessionRevoked,
      outcome: 'success',
      actorType: 'user',
      actorId: deleted.userId,
      targetType: 'session',
      targetId: sessionId,
      metadata: { scope: 'one' },
    },
    { mode: 'best_effort' },
  );
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
  const twoFactorEnabled = user?.twoFactorEnabled === true;
  return sessions.map((s) => ({
    id: s.id,
    userId: s.userId,
    expiresAt: s.expiresAt,
    token: s.token,
    ipAddress: s.ipAddress ?? null,
    userAgent: s.userAgent ?? null,
    activeOrganizationId: (s as any).activeOrganizationId ?? null,
    twoFactorEnabled,
    lastActiveAt: s.updatedAt,
  }));
}

/** Lot 2.6 · F: „Deschide direct ultima afacere data viitoare” (preferința utilizatorului). */
export async function getOpenLastOrganization(userId: string): Promise<boolean> {
  const user = await getIdentityDb().user.findUnique({
    where: { id: userId },
    select: { openLastOrganization: true },
  });
  return user?.openLastOrganization === true;
}

export async function setOpenLastOrganization(userId: string, value: boolean): Promise<void> {
  await getIdentityDb().user.update({
    where: { id: userId },
    data: { openLastOrganization: value },
  });
}

/**
 * Lot 2.7 · A: the Hub account of an invitation. `/sign-up/email` is closed over HTTP
 * (disabledPaths), so a Hub account exists only through signUpWithInvitation (core/access),
 * which checks the invitation first and calls deleteHubAccount when the acceptance fails.
 * The session Better Auth opens on sign-up is never sent to anyone: it is dropped, and the
 * screen signs in with the password as usual.
 */
export async function createHubAccount(params: {
  name: string;
  email: string;
  password: string;
}): Promise<{ userId: string }> {
  const result = await hubAuth.api.signUpEmail({
    body: { name: params.name, email: params.email, password: params.password },
  });
  await getIdentityDb().session.deleteMany({ where: { userId: result.user.id } });
  return { userId: result.user.id };
}

/** Lot 2.7 · A: undoes createHubAccount (the account, its credential and its sessions). */
export async function deleteHubAccount(userId: string): Promise<void> {
  await getIdentityDb().user.delete({ where: { id: userId } });
}

/**
 * Lot 2.6 · E: are adresa invitată deja un cont Hub? (o invitație acceptată de un cont existent
 * creează doar membership-ul, T2.5). Folosit doar cu adresa dintr-o invitație validă.
 */
export async function hasAccountForEmail(email: string): Promise<boolean> {
  const user = await getIdentityDb().user.findFirst({
    where: { email: email.trim().toLowerCase() },
    select: { id: true },
  });
  return !!user;
}
