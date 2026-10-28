import crypto from 'node:crypto';
import { Pool } from 'pg';
import { getOrgDb } from './db';
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
} from './errors';
import type { MembershipRole } from '../generated/organizations-client';
import {
  AuditActions,
  appendAuditEventInTx,
  hashEmail,
  pgExecutor,
  writeAuditEvent,
  type AuditEvent,
} from '@ventora/audit';
import {
  deliverEmail,
  invitationLink,
  renderMemberInvitation,
  renderOwnerInvitation,
  type EmailFailureReason,
  type RenderedEmail,
} from '@ventora/notifications';

// E21–E25 are best_effort (D2): the organization operation never fails because of the audit write.
async function auditBestEffort(event: AuditEvent): Promise<void> {
  await writeAuditEvent(event, { mode: 'best_effort' });
}

// Link lifetimes (design system S55): a member's invitation 7 days, the owner's invitation
// created from Founder 30 days. The owner's expiry is set in SQL by
// organizations.founder_create_organization (NOW() + 30 days); this constant is only used for
// the date shown in the email and must stay equal to it.
const MEMBER_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OWNER_INVITATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * E26: the invitation exists, its email did not leave (provider error, or no provider in
 * production). The operation still succeeds (FAZA-2 §2.2); the UI can offer "send again".
 */
function invitationEmailFailedEvent(
  organizationId: string,
  invitationId: string,
  reason: EmailFailureReason,
  extra: Record<string, unknown>,
): AuditEvent {
  return {
    category: 'organization',
    action: AuditActions.invitationEmailFailed,
    outcome: 'failure',
    actorType: 'system',
    organizationId,
    targetType: 'invitation',
    targetId: invitationId,
    metadata: { reason, ...extra },
  };
}

/**
 * Sends an invitation email from inside the organization (E-3, E-3b, or E-4 when the owner's
 * Founder invitation is resent) and records the result on the invitation (org_rw).
 */
async function sendInvitationEmail(
  organizationId: string,
  invitationId: string,
  email: string,
  rendered: RenderedEmail,
  meta: { kind: 'member' | 'owner'; resent: boolean },
): Promise<void> {
  const result = await deliverEmail({
    to: email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
  try {
    const db = getOrgDb();
    await db.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
      await tx.invitation.update({
        where: { id: invitationId },
        data: { emailStatus: result.status === 'sent' ? 'sent' : 'failed', updatedAt: new Date() },
      });
    });
  } catch (err) {
    // The invitation and its email are fine; only the status column is stale.
    console.error('[organizations] invitation email_status not updated', {
      invitationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  if (result.status === 'failed') {
    await auditBestEffort(
      invitationEmailFailedEvent(organizationId, invitationId, result.reason, meta),
    );
  }
}

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assertUuid(value: string, fieldName: string): void {
  if (!UUID_RE.test(value)) {
    throw new TypeError(
      `[validation] ${fieldName} must be a UUID, got: ${JSON.stringify(value.slice(0, 32))}`,
    );
  }
}

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
  membershipId: string;
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
      select: { id: true, role: true, status: true },
    });
  });
  if (!membership || membership.status !== 'active') throw new NotMemberError();
  return {
    userId: params.userId,
    organizationId: params.organizationId,
    membershipId: membership.id,
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

  const created = await createOrganizationTx(ctx, {
    name,
    slug: params.slug,
    ownerEmail,
    tokenHash,
  });

  // E-4, after the commit: an email that cannot leave never undoes the organization.
  // founder_runtime has no UPDATE on organizations.invitation, so email_status stays
  // 'pending' here; a failure is recorded as E26 only.
  const rendered = renderOwnerInvitation({
    email: ownerEmail,
    businessName: name,
    expiresAt: new Date(Date.now() + OWNER_INVITATION_TTL_MS),
    link: invitationLink(token),
  });
  const result = await deliverEmail({
    to: ownerEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
  if (result.status === 'failed') {
    await writeAuditEvent(
      invitationEmailFailedEvent(created.organizationId, created.invitationId, result.reason, {
        kind: 'owner',
        resent: false,
      }),
      { mode: 'best_effort', connection: 'founder' },
    );
  }

  return { organizationId: created.organizationId, invitationToken: token };
}

async function createOrganizationTx(
  ctx: FounderContext,
  params: { name: string; slug: string; ownerEmail: string; tokenHash: string },
): Promise<{ organizationId: string; invitationId: string }> {
  const { name, ownerEmail, tokenHash } = params;
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL_FOUNDER!,
    max: 1,
    connectionTimeoutMillis: 10_000,
  });
  const client = await pool.connect();
  try {
    // E20 (mode required, D2): organization + invitation + audit row in one transaction
    await client.query('BEGIN');
    const { rows } = await client.query<{ organization_id: string; invitation_id: string }>(
      `SELECT organization_id, invitation_id
       FROM organizations.founder_create_organization($1, $2, $3, $4, $5::uuid)`,
      [name, params.slug, ownerEmail, tokenHash, ctx.founderId],
    );
    if (!rows[0]) throw new Error('[organizations] founder_create_organization returned no rows');
    await appendAuditEventInTx(pgExecutor(client), {
      category: 'organization',
      action: AuditActions.organizationCreated,
      outcome: 'success',
      actorType: 'founder',
      actorId: ctx.founderId,
      founderId: ctx.founderId,
      organizationId: rows[0].organization_id,
      targetType: 'organization',
      targetId: rows[0].organization_id,
      metadata: {
        slug: params.slug,
        ownerEmailHash: hashEmail(ownerEmail),
        invitationId: rows[0].invitation_id,
      },
    });
    await client.query('COMMIT');
    return { organizationId: rows[0].organization_id, invitationId: rows[0].invitation_id };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
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
  const expiresAt = new Date(Date.now() + MEMBER_INVITATION_TTL_MS);

  const invitation = await db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${ctx.organizationId}, true)`;
    return tx.invitation.create({
      data: {
        organizationId: ctx.organizationId,
        organizationName: params.organizationName,
        invitedByUserId: ctx.userId,
        invitedByName: params.inviterName,
        email,
        role: params.role,
        tokenHash,
        expiresAt,
        applicationIds,
      },
      select: { id: true },
    });
  });
  await auditBestEffort({
    category: 'organization',
    action: AuditActions.invitationCreated,
    outcome: 'success',
    actorType: 'user',
    actorId: ctx.userId,
    organizationId: ctx.organizationId,
    targetType: 'invitation',
    targetId: invitation.id,
    metadata: { role: params.role, applicationIds, emailHash: hashEmail(email) },
  });
  // E-3, after the commit: a rolled-back invitation never sends an email.
  await sendInvitationEmail(
    ctx.organizationId,
    invitation.id,
    email,
    renderMemberInvitation({
      email,
      inviterName: params.inviterName,
      businessName: params.organizationName,
      role: params.role,
      expiresAt,
      link: invitationLink(token),
    }),
    { kind: 'member', resent: false },
  );
  return { invitationToken: token };
}

export async function acceptInvitation(params: {
  token: string;
  userId: string;
  userEmail: string;
}): Promise<{ organizationId: string; role: MembershipRole; applicationIds: string[] }> {
  assertUuid(params.userId, 'userId');
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
  // E25: rejected acceptance (expired / already used token, another account's email)
  const rejectAcceptance = async (err: TokenExpiredError | EmailMismatchError): Promise<never> => {
    await auditBestEffort({
      category: 'organization',
      action: AuditActions.invitationAcceptFailed,
      outcome: 'failure',
      actorType: 'user',
      actorId: params.userId,
      organizationId: inv?.organization_id ?? null,
      targetType: inv ? 'invitation' : null,
      targetId: inv?.id ?? null,
      metadata: { reason: err.code },
    });
    throw err;
  };
  if (!inv) return rejectAcceptance(new TokenExpiredError());
  if (inv.status === 'expired' || new Date(inv.expires_at) < new Date())
    return rejectAcceptance(new TokenExpiredError());
  if (normalizeEmail(inv.email) !== userEmail) return rejectAcceptance(new EmailMismatchError());

  const result = await db
    .$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${inv.organization_id}, true)`;

      // Atomic UPDATE — 0 rows means token was already used (race condition guard)
      const updated = await tx.$executeRaw`
      UPDATE organizations.invitation
      SET status = 'accepted', accepted_by_user_id = ${params.userId}::uuid, updated_at = NOW()
      WHERE id = ${inv.id}::uuid AND status = 'pending'
    `;

      if (Number(updated) === 0) throw new TokenExpiredError();

      const membership = await tx.membership.create({
        data: {
          organizationId: inv.organization_id,
          userId: params.userId,
          role: inv.role,
          status: 'active',
        },
        select: { id: true },
      });

      return {
        organizationId: inv.organization_id,
        role: inv.role,
        applicationIds: (inv as any).application_ids ?? [],
        membershipId: membership.id as string,
      };
    })
    .catch((err: unknown) =>
      err instanceof TokenExpiredError ? rejectAcceptance(err) : Promise.reject(err),
    );

  await auditBestEffort({
    category: 'organization',
    action: AuditActions.invitationAccepted,
    outcome: 'success',
    actorType: 'user',
    actorId: params.userId,
    organizationId: result.organizationId,
    targetType: 'membership',
    targetId: result.membershipId,
    metadata: { role: result.role, invitationId: inv.id },
  });

  return {
    organizationId: result.organizationId,
    role: result.role,
    applicationIds: result.applicationIds,
  };
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
  await auditBestEffort({
    category: 'organization',
    action: AuditActions.invitationRevoked,
    outcome: 'success',
    actorType: 'user',
    actorId: ctx.userId,
    organizationId: ctx.organizationId,
    targetType: 'invitation',
    targetId: invitationId,
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

  const inv = await db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${ctx.organizationId}, true)`;

    // S2: fetch current status before updating
    const current = await tx.invitation.findUnique({
      where: { id: invitationId },
      select: {
        status: true,
        email: true,
        role: true,
        organizationName: true,
        invitedByName: true,
        invitedByUserId: true,
        organization: { select: { createdByFounderId: true } },
      },
    });
    if (!current) throw new NotFoundError('Invitation not found');
    if (current.status === 'accepted' || current.status === 'revoked') {
      throw new InvalidInvitationStatusError();
    }

    // The owner's invitation created from Founder (founder_create_organization sets
    // invited_by_user_id = created_by_founder_id) keeps its 30 days and its own email (E-4)
    // when resent; every other invitation gets a member's 7 days and E-3b (S55).
    const fromFounder =
      current.role === 'owner' &&
      !!current.organization?.createdByFounderId &&
      current.invitedByUserId === current.organization.createdByFounderId;
    const expiresAt = new Date(
      Date.now() + (fromFounder ? OWNER_INVITATION_TTL_MS : MEMBER_INVITATION_TTL_MS),
    );

    await tx.invitation.update({
      where: { id: invitationId },
      data: {
        tokenHash,
        status: 'pending',
        expiresAt,
        emailStatus: 'pending',
        updatedAt: new Date(),
      },
    });
    return { ...current, fromFounder, expiresAt };
  });
  await auditBestEffort({
    category: 'organization',
    action: AuditActions.invitationResent,
    outcome: 'success',
    actorType: 'user',
    actorId: ctx.userId,
    organizationId: ctx.organizationId,
    targetType: 'invitation',
    targetId: invitationId,
  });
  // E-4 again for the owner's Founder invitation; otherwise E-3b (first email + "new link")
  await sendInvitationEmail(
    ctx.organizationId,
    invitationId,
    inv.email,
    inv.fromFounder
      ? renderOwnerInvitation({
          email: inv.email,
          businessName: inv.organizationName,
          expiresAt: inv.expiresAt,
          link: invitationLink(token),
        })
      : renderMemberInvitation({
          email: inv.email,
          inviterName: inv.invitedByName,
          businessName: inv.organizationName,
          role: inv.role,
          expiresAt: inv.expiresAt,
          link: invitationLink(token),
          resent: true,
        }),
    { kind: inv.fromFounder ? 'owner' : 'member', resent: true },
  );
  return { invitationToken: token };
}
