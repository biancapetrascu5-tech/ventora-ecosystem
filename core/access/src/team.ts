import { Forbidden } from '@ventora/errors';
import { getUserById } from '@ventora/identity';
import {
  listInvitations,
  listMembers,
  resendInvitation,
  resolveOrgContext,
  revokeInvitation,
  type InvitationListItem,
  type OrgContext,
} from '@ventora/organizations';
import { authorize } from './contract';
import { getAccessDb } from './db';
import { PLATFORM_APPLICATION_ID } from './platform-manifest';

/* Lot 2.8 — HubAdminTeam: echipa și invitațiile afacerii active. Doar owner și admin; un membru
   (sau orice alt rol) primește Forbidden pe server, nu doar un ecran ascuns. authorize() rulează
   primul, deci o afacere suspendată refuză și aici (D3-20 a). */

// P6: invitațiile expirate dispar din listă după 30 de zile (rămân în jurnalul de audit).
const EXPIRED_VISIBLE_MS = 30 * 24 * 60 * 60 * 1000;

export type TeamMember = {
  userId: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'suspended';
  /** Aplicațiile membrului; owner și admin au toate aplicațiile afacerii (ADR-0004): null. */
  applicationIds: string[] | null;
};

async function teamContext(sessionToken: string): Promise<OrgContext> {
  const ctx = await authorize({ sessionToken, applicationId: PLATFORM_APPLICATION_ID });
  if (ctx.role !== 'owner' && ctx.role !== 'admin') throw new Forbidden();
  return resolveOrgContext({ userId: ctx.userId, organizationId: ctx.organizationId });
}

async function applicationIdsByUser(organizationId: string): Promise<Map<string, string[]>> {
  const db = getAccessDb();
  const rows: { userId: string; applicationId: string }[] = await db.$transaction(
    async (tx: any) => {
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
      return tx.applicationAccess.findMany({
        where: { organizationId },
        select: { userId: true, applicationId: true },
        orderBy: { createdAt: 'asc' },
      });
    },
  );
  const out = new Map<string, string[]>();
  for (const r of rows) out.set(r.userId, [...(out.get(r.userId) ?? []), r.applicationId]);
  return out;
}

const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1 };

/** Membrii afacerii active (owner primul), cu rolul, starea și aplicațiile. */
export async function listTeamMembers(params: { sessionToken: string }): Promise<TeamMember[]> {
  const ctx = await teamContext(params.sessionToken);
  const [memberships, apps] = await Promise.all([
    listMembers(ctx) as Promise<{ userId: string; role: string; status: string }[]>,
    applicationIdsByUser(ctx.organizationId),
  ]);
  const members: TeamMember[] = [];
  for (const m of memberships) {
    const user = await getUserById(m.userId);
    if (!user) continue;
    const implicit = m.role === 'owner' || m.role === 'admin';
    members.push({
      userId: m.userId,
      name: user.name,
      email: user.email,
      role: m.role,
      status: m.status === 'suspended' ? 'suspended' : 'active',
      applicationIds: implicit ? null : (apps.get(m.userId) ?? []),
    });
  }
  return members.sort(
    (a, b) =>
      (ROLE_ORDER[a.role] ?? 2) - (ROLE_ORDER[b.role] ?? 2) || a.name.localeCompare(b.name, 'ro'),
  );
}

/**
 * Invitațiile în așteptare și cele expirate de cel mult 30 de zile (P6), cele mai noi primele,
 * cu marcajul `newLinkRequestedAt` („a cerut o invitație nouă”, Lot 2.7 · C).
 */
export async function listTeamInvitations(params: {
  sessionToken: string;
}): Promise<InvitationListItem[]> {
  const ctx = await teamContext(params.sessionToken);
  const now = Date.now();
  return (await listInvitations(ctx)).filter(
    (i) =>
      i.status === 'pending' ||
      (i.status === 'expired' && now - i.expiresAt.getTime() <= EXPIRED_VISIBLE_MS),
  );
}

/** „Retrimite”: link nou, termen nou, marcajul cererii șters (resendInvitation). */
export async function resendTeamInvitation(params: {
  sessionToken: string;
  invitationId: string;
}): Promise<void> {
  const ctx = await teamContext(params.sessionToken);
  await resendInvitation(ctx, params.invitationId);
}

/** „Anulează invitația”. */
export async function revokeTeamInvitation(params: {
  sessionToken: string;
  invitationId: string;
}): Promise<void> {
  const ctx = await teamContext(params.sessionToken);
  await revokeInvitation(ctx, params.invitationId);
}
