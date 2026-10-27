import crypto from 'node:crypto';
import { Pool } from 'pg';
import { getOrgDb } from './db.js';
import {
  NotMemberError,
  NotFoundError,
  TokenExpiredError,
  EmailMismatchError,
  ForbiddenError,
  InvalidInvitationStatusError,
  InvalidSlugError,
  ReservedSlugError,
  InvalidNameError,
  InvalidEmailError,
} from './errors.js';
import type { MembershipRole } from '../generated/organizations-client';

// Slug: 2–63 lowercase alphanumeric / hyphens, no leading/trailing hyphen
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const RESERVED_SLUGS = new Set([
  'ventora',
  'admin',
  'api',
  'www',
  'mail',
  'support',
  'help',
  'billing',
  'status',
  'docs',
  'blog',
  'about',
  'app',
  'login',
  'signup',
  'hub',
  'founder',
  'portal',
  'design',
  'static',
  'assets',
  'cdn',
]);

// Basic RFC5322-style email check (full validation happens server-side)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

declare const _orgContextBrand: unique symbol;

// Opaque branded type — only resolveOrgContext can produce a valid OrgContext.
// The brand property is phantom (never set at runtime); the cast in resolveOrgContext is the sole trusted site.
export interface OrgContext {
  readonly [_orgContextBrand]: void;
  userId: string;
  organizationId: string;
  role: MembershipRole;
}

/**
 * Verifies that userId holds an active membership in organizationId (under RLS),
 * then returns an OrgContext with the DB-sourced role.
 * userId MUST come from the authenticated session — never from client input.
 */
export async function resolveOrgContext(params: {
  userId: string;
  organizationId: string;
}): Promise<OrgContext> {
  const db = getOrgDb();
  const membership = await db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${params.organizationId}, true)`;
    return tx.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: params.organizationId,
          userId: params.userId,
        },
      },
      select: { role: true, status: true },
    });
  });
  if (!membership || membership.status !== 'active') throw new NotMemberError();
  return {
    userId: params.userId,
    organizationId: params.organizationId,
    role: membership.role,
  } as unknown as OrgContext;
}

// Uses DATABASE_URL_FOUNDER connection (founder_runtime role).
// founder_create_organization is SECURITY DEFINER — caller needs EXECUTE, not org_rw.
export async function createOrganizationAsFounder(
  ctx: FounderContext,
  params: { name: string; slug: string; ownerEmail: string },
): Promise<{ organizationId: string; invitationToken: string }> {
  const name = params.name.trim();
  if (!name || name.length > 255) throw new InvalidNameError();

  if (!SLUG_RE.test(params.slug)) throw new InvalidSlugError();
  if (RESERVED_SLUGS.has(params.slug)) throw new ReservedSlugError();

  const ownerEmail = normalizeEmail(params.ownerEmail);
  if (!EMAIL_RE.test(ownerEmail)) throw new InvalidEmailError();

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL_FOUNDER!,
    max: 1,
    connectionTimeoutMillis: 10_000,
  });
  try {
    const { rows } = await pool.query<{ organization_id: string; invitation_id: string }>(
      `SELECT organization_id, invitation_id
       FROM organizations.founder_create_organization($1, $2, $3, $4, $5::uuid)`,
      [name, params.slug, ownerEmail, tokenHash, ctx.founderId],
    );
    if (!rows[0]) throw new Error('[organizations] founder_create_organization returned no rows');
    return { organizationId: rows[0].organization_id, invitationToken: token };
  } finally {
    await pool.end();
  }
}

// S1: sets app.user_id from the authenticated session — never from client input.
export async function listMyOrganizations(userId: string) {
  const db = getOrgDb();
  return db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    return tx.$queryRaw<
      Array<{
        organization_id: string;
        organization_name: string;
        organization_slug: string;
        role: MembershipRole;
        status: string;
      }>
    >`SELECT organization_id, organization_name, organization_slug, role, status
      FROM organizations.list_my_memberships()`;
  });
}

// B1: uses ctx.organizationId exclusively — id param removed to prevent context confusion.
export async function getOrganization(ctx: OrgContext) {
  const db = getOrgDb();
  const result = await db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${ctx.organizationId}, true)`;
    return tx.organization.findUnique({ where: { id: ctx.organizationId } });
  });
  if (!result) throw new NotMemberError();
  return result;
}

// B1: uses ctx.organizationId exclusively — orgId param removed.
export async function getMembership(ctx: OrgContext, userId: string) {
  const db = getOrgDb();
  return db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${ctx.organizationId}, true)`;
    return tx.membership.findUnique({
      where: { organizationId_userId: { organizationId: ctx.organizationId, userId } },
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
    applicationIds?: string[];
  },
): Promise<{ invitationToken: string }> {
  if (ctx.role !== 'owner' && ctx.role !== 'admin') throw new ForbiddenError();
  // B4: admins cannot invite owners or other admins
  if (ctx.role === 'admin' && (params.role === 'owner' || params.role === 'admin')) {
    throw new ForbiddenError('Admins cannot invite owners or other admins');
  }
  const db = getOrgDb();
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const email = normalizeEmail(params.email);
  const applicationIds = params.applicationIds ?? [];

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
        applicationIds,
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
  // application_ids fetched via direct column read (added in migration 20261027000003)
  const rows = await db.$transaction(async (tx: any) => {
    const inv = await tx.$queryRaw<
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
    if (!inv[0]) return inv;
    // Set org context so RLS allows the application_ids read
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${inv[0].organization_id}, true)`;
    const appIds = await tx.$queryRaw<Array<{ application_ids: string[] }>>`
      SELECT application_ids
      FROM organizations.invitation
      WHERE id = ${inv[0].id}::uuid
    `;
    return inv.map((row: (typeof inv)[0]) => ({
      ...row,
      application_ids: appIds[0]?.application_ids ?? [],
    }));
  });

  const inv = rows[0];
  if (!inv) throw new TokenExpiredError();
  if (inv.status === 'expired' || new Date(inv.expires_at) < new Date())
    throw new TokenExpiredError();
  if (normalizeEmail(inv.email) !== userEmail) throw new EmailMismatchError();

  const result = await db.$transaction(async (tx: any) => {
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

    return {
      organizationId: inv.organization_id,
      role: inv.role,
      applicationIds: (inv as any).application_ids ?? [],
    };
  });

  // Grant application access for non-owner/admin roles (ADR-0004).
  // Done outside the transaction — idempotent, non-fatal on failure.
  // Dynamic import avoids a compile-time circular dependency (organizations ↔ access).
  if (result.role !== 'owner' && result.role !== 'admin' && result.applicationIds.length > 0) {
    try {
      type AccessMod = {
        grantApplicationAccess: (org: string, user: string, apps: string[]) => Promise<void>;
      };
      const accessPkg: string = '@ventora/access';
      const mod = (await import(accessPkg)) as AccessMod;
      await mod.grantApplicationAccess(result.organizationId, params.userId, result.applicationIds);
    } catch (err) {
      console.warn('[organizations] grantApplicationAccess failed after acceptInvitation:', err);
    }
  }

  return { organizationId: result.organizationId, role: result.role };
}

export async function revokeInvitation(ctx: OrgContext, invitationId: string): Promise<void> {
  if (ctx.role !== 'owner' && ctx.role !== 'admin') throw new ForbiddenError();
  const db = getOrgDb();
  await db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${ctx.organizationId}, true)`;
    try {
      await tx.invitation.update({
        where: { id: invitationId },
        data: { status: 'revoked', updatedAt: new Date() },
      });
    } catch (err: any) {
      if (err?.code === 'P2025') throw new NotFoundError('Invitation not found');
      throw err;
    }
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

    // S2: fetch current status before updating
    const inv = await tx.invitation.findUnique({
      where: { id: invitationId },
      select: { status: true },
    });
    if (!inv) throw new NotFoundError('Invitation not found');
    if (inv.status === 'accepted' || inv.status === 'revoked') {
      throw new InvalidInvitationStatusError();
    }

    await tx.invitation.update({
      where: { id: invitationId },
      data: {
        tokenHash,
        status: 'pending',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        emailStatus: 'pending',
        updatedAt: new Date(),
      },
    });
  });
  return { invitationToken: token };
}
