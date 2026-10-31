import { Forbidden, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { AuditActions, appendAuditEventInTx, prismaTxExecutor } from '@ventora/audit';
import { getUserById } from '@ventora/identity';
import {
  changeMemberRole,
  getMembership,
  getOrganization,
  inviteMember,
  listInvitations,
  listMembers,
  removeMember,
  resendInvitation,
  resolveOrgContext,
  revokeInvitation,
  setMemberAccess,
  type InvitationListItem,
  type ManagedRole,
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

// ── Lot 2.9b — HubTeamInvite and the menu of a member ─────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const APP_RE = /^[a-z][a-z0-9-]{0,63}$/;

function applicationIdsInput(applicationIds: readonly string[]): string[] {
  const ids = [...new Set(applicationIds)];
  if (ids.some((id) => !APP_RE.test(id) || id === PLATFORM_APPLICATION_ID)) {
    throw new InvalidInput('applicationIds');
  }
  return ids;
}

export type TeamInviteResult =
  | { status: 'sent'; email: string; expiresAt: Date }
  /** team.invite.error.member */
  | { status: 'already_member'; email: string }
  /** team.invite.error.invited, with „Retrimite invitația” */
  | { status: 'already_invited'; email: string; invitationId: string; sentAt: Date };

/**
 * HubTeamInvite (S112): an e-mail, the role Membru / Admin, the applications (a member needs at
 * least one; an admin has them all). On the server: a malformed address and a member without
 * applications are InvalidInput; someone already in the team or already invited (pending) is an
 * answer, not an error, so the form shows its state. B4: an admin cannot invite an admin.
 */
export async function inviteToTeam(params: {
  sessionToken: string;
  email: string;
  role: ManagedRole;
  applicationIds: readonly string[];
}): Promise<TeamInviteResult> {
  const ctx = await teamContext(params.sessionToken);
  const email = params.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) throw new InvalidInput('email');
  if (params.role !== 'member' && params.role !== 'admin') throw new InvalidInput('role');
  const applicationIds = params.role === 'admin' ? [] : applicationIdsInput(params.applicationIds);
  if (params.role === 'member' && applicationIds.length === 0) {
    throw new InvalidInput('applicationIds');
  }

  const members = (await listMembers(ctx)) as { userId: string }[];
  for (const m of members) {
    const user = await getUserById(m.userId);
    if (user && user.email.toLowerCase() === email) return { status: 'already_member', email };
  }
  const pending = (await listInvitations(ctx)).find(
    (i) => i.status === 'pending' && i.email.toLowerCase() === email,
  );
  if (pending) {
    return {
      status: 'already_invited',
      email,
      invitationId: pending.id,
      sentAt: pending.createdAt,
    };
  }

  const [inviter, organization] = await Promise.all([
    getUserById(ctx.userId),
    getOrganization(ctx),
  ]);
  await inviteMember(ctx, {
    email,
    role: params.role,
    inviterName: inviter?.name ?? '',
    organizationName: organization.name,
    applicationIds,
  });
  const created = (await listInvitations(ctx)).find(
    (i) => i.status === 'pending' && i.email.toLowerCase() === email,
  );
  return { status: 'sent', email, expiresAt: created?.expiresAt ?? new Date() };
}

/** The target of a member action, read in the manager's context: never the owner. */
async function memberRole(ctx: OrgContext, userId: string): Promise<string> {
  const m = (await getMembership(ctx, userId)) as { role: string } | null;
  if (!m) throw new ResourceNotFound('Member not found');
  return m.role;
}

/** „Schimbă rolul”: Membru ↔ Admin (organizations.changeMemberRole: owner untouchable, B4). */
export async function changeTeamMemberRole(params: {
  sessionToken: string;
  userId: string;
  role: ManagedRole;
}): Promise<void> {
  const ctx = await teamContext(params.sessionToken);
  await changeMemberRole(ctx, params.userId, params.role);
}

/**
 * „Acces la aplicații”: the member's applications, replaced as a whole. Owner and admin have
 * every application (ADR-0004), so only a member (or another role with per-app access) has a
 * list here. Audited (required) in the same transaction.
 */
export async function setTeamMemberApplications(params: {
  sessionToken: string;
  userId: string;
  applicationIds: readonly string[];
}): Promise<{ added: string[]; removed: string[] }> {
  const ctx = await teamContext(params.sessionToken);
  if (params.userId === ctx.userId) throw new Forbidden('Not on your own membership');
  const role = await memberRole(ctx, params.userId);
  if (role === 'owner' || role === 'admin') {
    throw new InvalidInput('userId', 'Owner and admin have every application');
  }
  const wanted = applicationIdsInput(params.applicationIds);
  if (wanted.length === 0) throw new InvalidInput('applicationIds');
  const db = getAccessDb();
  return db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${ctx.organizationId}, true)`;
    const current: { application_id: string }[] = await tx.$queryRaw`
      SELECT application_id FROM access.application_access
       WHERE organization_id = ${ctx.organizationId}::uuid AND user_id = ${params.userId}::uuid`;
    const have = new Set(current.map((r) => r.application_id));
    const added = wanted.filter((a) => !have.has(a));
    const removed = [...have].filter((a) => !wanted.includes(a));
    for (const applicationId of added) {
      await tx.$executeRaw`
        INSERT INTO access.application_access (organization_id, user_id, application_id)
        VALUES (${ctx.organizationId}::uuid, ${params.userId}::uuid, ${applicationId})
        ON CONFLICT (organization_id, user_id, application_id) DO NOTHING`;
    }
    if (removed.length > 0) {
      await tx.$executeRaw`
        DELETE FROM access.application_access
         WHERE organization_id = ${ctx.organizationId}::uuid AND user_id = ${params.userId}::uuid
           AND application_id = ANY(${removed}::text[])`;
    }
    if (added.length > 0 || removed.length > 0) {
      await appendAuditEventInTx(prismaTxExecutor(tx), {
        category: 'access',
        action: AuditActions.applicationAccessUpdated,
        outcome: 'success',
        actorType: 'user',
        actorId: ctx.userId,
        organizationId: ctx.organizationId,
        targetType: 'user',
        targetId: params.userId,
        metadata: { added, removed },
      });
    }
    return { added, removed };
  });
}

/** „Oprește accesul” / „Redă accesul”. */
export async function setTeamMemberAccess(params: {
  sessionToken: string;
  userId: string;
  access: 'stopped' | 'active';
}): Promise<void> {
  const ctx = await teamContext(params.sessionToken);
  await setMemberAccess(ctx, params.userId, params.access);
}

/**
 * „Elimină din afacere”: the membership (organizations, audited) and then the person's
 * applications in this business (access). The account stays; they can be invited again.
 */
export async function removeTeamMember(params: {
  sessionToken: string;
  userId: string;
}): Promise<void> {
  const ctx = await teamContext(params.sessionToken);
  await removeMember(ctx, params.userId);
  const db = getAccessDb();
  await db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${ctx.organizationId}, true)`;
    await tx.$executeRaw`
      DELETE FROM access.application_access
       WHERE organization_id = ${ctx.organizationId}::uuid AND user_id = ${params.userId}::uuid`;
  });
}
