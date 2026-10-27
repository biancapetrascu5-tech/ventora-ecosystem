import crypto from 'node:crypto';
import { Pool } from 'pg';
import { getOrgDb } from './db.js';
import { NotMemberError, TokenExpiredError, EmailMismatchError, ForbiddenError } from './errors.js';
import type { MembershipRole } from '../generated/organizations-client';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export interface FounderContext {
  founderId: string;
  founderEmail: string;
}

export interface OrgContext {
  userId: string;
  organizationId: string;
  role: MembershipRole;
}

// Uses DATABASE_URL_FOUNDER connection (founder_runtime role).
// founder_create_organization is SECURITY DEFINER — caller needs EXECUTE, not org_rw.
export async function createOrganizationAsFounder(
  ctx: FounderContext,
  params: { name: string; slug: string; ownerEmail: string },
): Promise<{ organizationId: string; invitationToken: string }> {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const ownerEmail = normalizeEmail(params.ownerEmail);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL_FOUNDER!, max: 1 });
  try {
    const { rows } = await pool.query<{ organization_id: string; invitation_id: string }>(
      `SELECT organization_id, invitation_id
       FROM organizations.founder_create_organization($1, $2, $3, $4, $5::uuid)`,
      [params.name, params.slug, ownerEmail, tokenHash, ctx.founderId],
    );
    if (!rows[0]) throw new Error('[organizations] founder_create_organization returned no rows');
    return { organizationId: rows[0].organization_id, invitationToken: token };
  } finally {
    await pool.end();
  }
}

export async function listMyOrganizations(userId: string) {
  const db = getOrgDb();
  return db.$transaction(async (tx: any) => {
    return tx.$queryRaw<
      Array<{
        organization_id: string;
        organization_name: string;
        organization_slug: string;
        role: MembershipRole;
        status: string;
      }>
    >`SELECT organization_id, organization_name, organization_slug, role, status
      FROM organizations.list_my_memberships(${userId}::uuid)`;
  });
}

export async function getOrganization(_ctx: OrgContext, id: string) {
  const db = getOrgDb();
  const result = await db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${id}, true)`;
    return tx.organization.findUnique({ where: { id } });
  });
  if (!result) throw new NotMemberError();
  return result;
}

export async function getMembership(_ctx: OrgContext, userId: string, orgId: string) {
  const db = getOrgDb();
  return db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${orgId}, true)`;
    return tx.membership.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId } },
    });
  });
}

export async function listMembers(ctx: OrgContext) {
  const db = getOrgDb();
  return db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${ctx.organizationId}, true)`;
    return tx.membership.findMany({ where: { organizationId: ctx.organizationId } });
  });
}

export async function inviteMember(
  ctx: OrgContext,
  params: {
    email: string;
    role: MembershipRole;
    inviterName: string;
    organizationName: string;
  },
): Promise<{ invitationToken: string }> {
  if (ctx.role !== 'owner' && ctx.role !== 'admin') throw new ForbiddenError();
  const db = getOrgDb();
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const email = normalizeEmail(params.email);

  await db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${ctx.organizationId}, true)`;
    await tx.invitation.create({
      data: {
        organizationId: ctx.organizationId,
        organizationName: params.organizationName,
        invitedByUserId: ctx.userId,
        invitedByName: params.inviterName,
        email,
        role: params.role,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
  });
  return { invitationToken: token };
}

export async function acceptInvitation(params: {
  token: string;
  userId: string;
  userEmail: string;
}): Promise<{ organizationId: string; role: MembershipRole }> {
  const db = getOrgDb();
  const tokenHash = hashToken(params.token);
  const userEmail = normalizeEmail(params.userEmail);

  // find_invitation_by_token_hash returns pending OR expired rows (SECURITY DEFINER, GRANT to org_rw)
  const rows = await db.$transaction(async (tx: any) => {
    return tx.$queryRaw<
      Array<{
        id: string;
        organization_id: string;
        email: string;
        role: MembershipRole;
        expires_at: Date;
        status: string;
      }>
    >`SELECT id, organization_id, email, role, expires_at, status
      FROM organizations.find_invitation_by_token_hash(${tokenHash}::text)`;
  });

  const inv = rows[0];
  if (!inv) throw new TokenExpiredError();
  if (inv.status === 'expired' || new Date(inv.expires_at) < new Date())
    throw new TokenExpiredError();
  if (normalizeEmail(inv.email) !== userEmail) throw new EmailMismatchError();

  return db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${inv.organization_id}, true)`;

    // Atomic UPDATE — 0 rows means token was already used (race condition guard)
    const updated = await tx.$executeRaw`
      UPDATE organizations.invitation
      SET status = 'accepted', accepted_by_user_id = ${params.userId}::uuid, updated_at = NOW()
      WHERE id = ${inv.id}::uuid AND status = 'pending'
    `;

    if (Number(updated) === 0) throw new TokenExpiredError();

    await tx.membership.create({
      data: {
        organizationId: inv.organization_id,
        userId: params.userId,
        role: inv.role,
        status: 'active',
      },
    });

    return { organizationId: inv.organization_id, role: inv.role };
  });
}

export async function revokeInvitation(ctx: OrgContext, invitationId: string): Promise<void> {
  if (ctx.role !== 'owner' && ctx.role !== 'admin') throw new ForbiddenError();
  const db = getOrgDb();
  await db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${ctx.organizationId}, true)`;
    await tx.invitation.update({
      where: { id: invitationId },
      data: { status: 'revoked', updatedAt: new Date() },
    });
  });
}

export async function resendInvitation(
  ctx: OrgContext,
  invitationId: string,
): Promise<{ invitationToken: string }> {
  if (ctx.role !== 'owner' && ctx.role !== 'admin') throw new ForbiddenError();
  const db = getOrgDb();
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);

  await db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${ctx.organizationId}, true)`;
    await tx.invitation.update({
      where: { id: invitationId },
      data: {
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        emailStatus: 'pending',
        updatedAt: new Date(),
      },
    });
  });
  return { invitationToken: token };
}
