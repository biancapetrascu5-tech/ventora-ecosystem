import crypto from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
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
  OrganizationSuspendedError,
} from './errors';
import type { MembershipRole } from '../generated/organizations-client';
import {
  AuditActions,
  appendAuditEventInTx,
  hashEmail,
  pgExecutor,
  prismaTxExecutor,
  writeAuditEvent,
  type AuditEvent,
  type AuditSqlExecutor,
} from '@ventora/audit';
import {
  deliverEmail,
  invitationLink,
  renderMemberInvitation,
  renderOwnerInvitation,
  type EmailFailureReason,
  type RenderedEmail,
} from '@ventora/notifications';
import { writeOutboxEvent } from '@ventora/db-kit';
import { InvitationNewLinkRequestedV1 } from '@ventora/contracts';

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
  const { membership, organization } = await db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${params.organizationId}, true)`;
    const membership = await tx.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: params.organizationId,
          userId: params.userId,
        },
      },
      select: { id: true, role: true, status: true },
    });
    const organization = membership
      ? await tx.organization.findUnique({
          where: { id: params.organizationId },
          select: { status: true },
        })
      : null;
    return { membership, organization };
  });
  if (!membership || membership.status !== 'active') throw new NotMemberError();
  // Lot 2.8 (D3-20 a): a suspended organization has no way in for anyone in it, not even to read.
  if (organization?.status === 'suspended') throw new OrganizationSuspendedError();
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
  // founder_runtime has no UPDATE on organizations.invitation; email_status is written through
  // founder_set_owner_invitation_email_status (migration 20261028000003, 2.5b §5.3).
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
  await setOwnerInvitationEmailStatus(
    created.invitationId,
    result.status === 'sent' ? 'sent' : 'failed',
  );
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

async function withFounderClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL_FOUNDER!,
    max: 1,
    connectionTimeoutMillis: 10_000,
  });
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
    await pool.end();
  }
}

/** Never throws: the invitation and its email are fine, only the status column would be stale. */
async function setOwnerInvitationEmailStatus(
  invitationId: string,
  status: 'sent' | 'failed',
): Promise<void> {
  try {
    await withFounderClient(async (client) => {
      const { rows } = await client.query<{ updated: boolean }>(
        `SELECT organizations.founder_set_owner_invitation_email_status($1::uuid, $2) AS updated`,
        [invitationId, status],
      );
      if (!rows[0]?.updated) throw new Error('no owner invitation from Founder with this id');
    });
  } catch (err) {
    console.error('[organizations] owner invitation email_status not updated', {
      invitationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * M3, on a founder_runtime transaction owned by the caller: the active owner membership of
 * `userId` in `organizationId`, with the organization's name; null when the user is not an
 * active owner there (admin, member, suspended, another organization).
 */
export async function getOwnerMembershipInTx(
  exec: AuditSqlExecutor,
  organizationId: string,
  userId: string,
): Promise<{ membershipId: string; organizationName: string } | null> {
  assertUuid(organizationId, 'organizationId');
  assertUuid(userId, 'userId');
  const rows = await exec.query(
    `SELECT membership_id::text AS membership_id, organization_name
       FROM organizations.founder_get_owner_membership($1::uuid, $2::uuid)`,
    [organizationId, userId],
  );
  const row = rows[0];
  return row
    ? {
        membershipId: row.membership_id as string,
        organizationName: row.organization_name as string,
      }
    : null;
}

/**
 * M3: the organization's name and its active owners (user ids); null when the organization
 * does not exist. An organization whose owner has not accepted yet has no owners.
 */
export async function listOrganizationOwnersInTx(
  exec: AuditSqlExecutor,
  organizationId: string,
): Promise<{ organizationName: string; ownerUserIds: string[] } | null> {
  assertUuid(organizationId, 'organizationId');
  const rows = await exec.query(
    `SELECT organization_name, user_id::text AS user_id
       FROM organizations.founder_list_organization_owners($1::uuid)`,
    [organizationId],
  );
  if (rows.length === 0) return null;
  return {
    organizationName: rows[0]!.organization_name as string,
    ownerUserIds: rows.map((r) => r.user_id as string | null).filter((id): id is string => !!id),
  };
}

export type FounderOrganizationRow = {
  organizationId: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  createdAt: Date;
  suspendedAt: Date | null;
  /** The first active owner; null while the owner has not accepted the invitation yet. */
  ownerUserId: string | null;
  /** Without an owner: the newest owner invitation (address and pending / expired / revoked). */
  ownerInvitation: { email: string; state: string } | null;
  /** Active memberships (the suspension dialog says how many people lose access). */
  memberCount: number;
};

/**
 * Lot 2.8 (FounderBusinesses), on a founder_runtime transaction owned by the caller: every
 * organization with its first active owner or, until one exists, its newest owner invitation.
 */
export async function listOrganizationsAsFounderInTx(
  exec: AuditSqlExecutor,
): Promise<FounderOrganizationRow[]> {
  const rows = await exec.query(
    `SELECT organization_id::text AS organization_id, organization_name, organization_slug,
            status::text AS status, created_at, suspended_at, owner_user_id::text AS owner_user_id,
            owner_invitation_email, owner_invitation_state, member_count
       FROM organizations.founder_list_organizations()`,
    [],
  );
  return rows.map((r) => ({
    organizationId: r.organization_id as string,
    name: r.organization_name as string,
    slug: r.organization_slug as string,
    status: r.status as 'active' | 'suspended',
    createdAt: new Date(r.created_at as string),
    suspendedAt: r.suspended_at ? new Date(r.suspended_at as string) : null,
    ownerUserId: (r.owner_user_id as string | null) ?? null,
    ownerInvitation: r.owner_invitation_email
      ? {
          email: r.owner_invitation_email as string,
          state: (r.owner_invitation_state as string | null) ?? 'pending',
        }
      : null,
    memberCount: Number(r.member_count ?? 0),
  }));
}

/**
 * Lot 2.8 (D3-20 a): suspends or reactivates an organization, on the caller's founder_runtime
 * transaction (the audit row goes in the same one). null when the organization does not exist;
 * `changed` is false when it already had that status.
 */
export async function setOrganizationStatusInTx(
  exec: AuditSqlExecutor,
  organizationId: string,
  status: 'active' | 'suspended',
  founderId: string,
): Promise<{ organizationName: string; changed: boolean } | null> {
  assertUuid(organizationId, 'organizationId');
  assertUuid(founderId, 'founderId');
  const rows = await exec.query(
    `SELECT organization_name, previous_status::text AS previous_status
       FROM organizations.founder_set_organization_status($1::uuid, $2, $3::uuid)`,
    [organizationId, status, founderId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    organizationName: row.organization_name as string,
    changed: row.previous_status !== status,
  };
}

async function createOrganizationTx(
  ctx: FounderContext,
  params: { name: string; slug: string; ownerEmail: string; tokenHash: string },
): Promise<{ organizationId: string; invitationId: string }> {
  const { name, ownerEmail, tokenHash } = params;
  return withFounderClient(async (client) => {
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
    }
  });
}

// S1: sets app.user_id from the authenticated session — never from client input.
export async function listMyOrganizations(userId: string) {
  const db = getOrgDb();
  return db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    // Lot 2.6 · F: last_opened_at (ultima deschisă prima). Lot 2.9b (S112): și afacerile
    // suspendate, cu organization_status — se arată „Acces oprit”, nu se deschid.
    return tx.$queryRaw<
      Array<{
        organization_id: string;
        organization_name: string;
        organization_slug: string;
        role: MembershipRole;
        status: string;
        last_opened_at: Date | null;
        organization_status: 'active' | 'suspended';
      }>
    >`SELECT organization_id, organization_name, organization_slug, role, status, last_opened_at,
             organization_status
      FROM organizations.list_my_memberships_v3()`;
  });
}

/**
 * Lot 2.9 (decizia 1): is the user an active owner of any business, whatever its state? A
 * suspended business still exists, so its owner stays an owner. list_my_memberships (v1) filters
 * only the membership status, not the organization status (v2 hides suspended businesses).
 */
export async function isOwnerOfAnyOrganization(userId: string): Promise<boolean> {
  const db = getOrgDb();
  const rows = await db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    return tx.$queryRaw<Array<{ role: MembershipRole }>>`SELECT role
      FROM organizations.list_my_memberships()`;
  });
  return (rows as Array<{ role: MembershipRole }>).some((m) => m.role === 'owner');
}

/** Lot 2.6 · F: afacerea a fost deschisă acum (HubChooseBusiness, „deschisă …”). */
export async function markOrganizationOpened(ctx: OrgContext): Promise<void> {
  const db = getOrgDb();
  await db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${ctx.organizationId}, true)`;
    await tx.membership.update({
      where: { organizationId_userId: { organizationId: ctx.organizationId, userId: ctx.userId } },
      data: { lastOpenedAt: new Date() },
    });
  });
}

export type InvitationView = {
  id: string;
  organizationId: string;
  organizationName: string;
  inviterName: string;
  email: string;
  role: MembershipRole;
  applicationIds: string[];
  expiresAt: Date;
  /** pending după termen = expired (ca la acceptare). */
  status: 'pending' | 'expired' | 'accepted' | 'revoked';
};

const INVITATION_TOKEN = /^[0-9a-f]{64}$/;

/**
 * Lot 2.6 · E: ce arată /invite/[token] — cine invită, afacerea, rolul, aplicațiile, adresa și
 * starea. null pentru un token necunoscut (fără să spună dacă a existat).
 */
export async function getInvitationByToken(token: string): Promise<InvitationView | null> {
  if (typeof token !== 'string' || !INVITATION_TOKEN.test(token)) return null;
  const db = getOrgDb();
  // org_rw (SET LOCAL ROLE in $transaction): app_runtime alone has no USAGE on the schema
  const rows: Array<{
    id: string;
    organization_id: string;
    organization_name: string;
    invited_by_name: string;
    email: string;
    role: MembershipRole;
    expires_at: Date;
    status: InvitationView['status'];
    application_ids: string[] | null;
  }> = await db.$transaction(
    async (tx: any) =>
      tx.$queryRaw`SELECT id, organization_id, organization_name, invited_by_name, email, role,
             expires_at, status, application_ids
        FROM organizations.find_invitation_view_by_token_hash(${hashToken(token)}::text)`,
  );
  const row = rows[0];
  if (!row) return null;
  const status =
    row.status === 'pending' && new Date(row.expires_at) < new Date() ? 'expired' : row.status;
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    inviterName: row.invited_by_name,
    email: row.email,
    role: row.role,
    applicationIds: row.application_ids ?? [],
    expiresAt: new Date(row.expires_at),
    status,
  };
}

/**
 * Lot 2.6 · E: „Cere o invitație nouă” din invitația expirată. Marchează cererea (o vede cine a
 * invitat; linkul nou îl trimite el, cu resendInvitation) și o trece în jurnal. false dacă
 * invitația nu e expirată sau nu există.
 *
 * Lot 4.1: marcajul și evenimentul `invitation.new_link_requested` se scriu în aceeași
 * tranzacție (org_rw, cu organizația invitației): fără marcaj nu există eveniment, și invers.
 */
export async function requestNewInvitationLink(token: string): Promise<boolean> {
  if (typeof token !== 'string' || !INVITATION_TOKEN.test(token)) return false;
  const db = getOrgDb();
  const row = await db.$transaction(async (tx: any) => {
    const rows: Array<{ id: string; organization_id: string; invited_by_user_id: string }> =
      await tx.$queryRaw`SELECT id, organization_id, invited_by_user_id
        FROM organizations.request_new_invitation_link(${hashToken(token)}::text)`;
    const marked = rows[0];
    if (!marked) return null;
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${marked.organization_id}, true)`;
    await writeOutboxEvent(tx, 'organizations', InvitationNewLinkRequestedV1, {
      organizationId: marked.organization_id,
      sourceApp: InvitationNewLinkRequestedV1.sourceApp,
      resourceId: marked.id,
      payload: { invitationId: marked.id, invitedByUserId: marked.invited_by_user_id },
    });
    return marked;
  });
  if (!row) return false;
  await auditBestEffort({
    category: 'organization',
    action: AuditActions.invitationNewLinkRequested,
    outcome: 'success',
    actorType: 'anonymous',
    actorId: null,
    organizationId: row.organization_id,
    targetType: 'invitation',
    targetId: row.id,
    metadata: { invitedByUserId: row.invited_by_user_id },
  });
  return true;
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

      // Lot 2.8 (D3-20 a): nobody joins a suspended organization
      const org = await tx.organization.findUnique({
        where: { id: inv.organization_id },
        select: { status: true },
      });
      if (org?.status === 'suspended') throw new OrganizationSuspendedError();

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

export type InvitationListItem = {
  id: string;
  email: string;
  role: MembershipRole;
  applicationIds: string[];
  invitedByName: string;
  /** pending după termen = expired (ca la acceptare). */
  status: 'pending' | 'expired' | 'accepted' | 'revoked';
  emailStatus: string;
  expiresAt: Date;
  createdAt: Date;
  /**
   * Lot 2.7 · C: „Cere o invitație nouă” — cel invitat a cerut un link nou (marcajul din lista
   * HubAdminTeam). Rămâne până la retrimitere (resendInvitation îl șterge).
   */
  newLinkRequestedAt: Date | null;
};

/**
 * Lot 2.7 · C: invitațiile afacerii active, cele mai noi primele (HubAdminTeam). Doar owner și
 * admin; RLS pe app.organization_id.
 */
export async function listInvitations(ctx: OrgContext): Promise<InvitationListItem[]> {
  if (ctx.role !== 'owner' && ctx.role !== 'admin') throw new ForbiddenError();
  const db = getOrgDb();
  const rows = await db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${ctx.organizationId}, true)`;
    return tx.invitation.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        email: true,
        role: true,
        applicationIds: true,
        invitedByName: true,
        status: true,
        emailStatus: true,
        expiresAt: true,
        createdAt: true,
        newLinkRequestedAt: true,
      },
    });
  });
  const now = new Date();
  return rows.map((r: InvitationListItem) => ({
    ...r,
    status: r.status === 'pending' && r.expiresAt < now ? 'expired' : r.status,
  }));
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

// ── Lot 2.9b — the menu of a member in HubAdminTeam ───────────────────────────────────────────

/** The roles a manager can give from HubAdminTeam (HubTeamInvite: Membru / Admin). */
export type ManagedRole = 'admin' | 'member';

/**
 * The target membership, locked for the change. Only owner and admin manage the team; nobody
 * acts on themselves here; the owner is never touched from this menu (an admin cannot touch the
 * owner, and the owner changes hands only through owner recovery).
 */
async function managedMembership(
  tx: any,
  ctx: OrgContext,
  targetUserId: string,
): Promise<{ id: string; role: MembershipRole; status: string }> {
  if (ctx.role !== 'owner' && ctx.role !== 'admin') throw new ForbiddenError();
  assertUuid(targetUserId, 'userId');
  if (targetUserId === ctx.userId) throw new ForbiddenError('Not on your own membership');
  await tx.$executeRaw`SELECT set_config('app.organization_id', ${ctx.organizationId}, true)`;
  const rows = await tx.$queryRaw<Array<{ id: string; role: MembershipRole; status: string }>>`
    SELECT id, role, status FROM organizations.membership
     WHERE organization_id = ${ctx.organizationId}::uuid AND user_id = ${targetUserId}::uuid
     FOR UPDATE`;
  const m = rows[0];
  if (!m) throw new NotFoundError('Member not found');
  if (m.role === 'owner') throw new ForbiddenError('The owner cannot be changed here');
  // Decizia fondatoarei pe PR #42 (31.10.2026): doar owner-ul gestionează adminii
  if (ctx.role === 'admin' && m.role === 'admin') {
    throw new ForbiddenError('Only the owner manages admins');
  }
  return m;
}

function memberAudit(
  ctx: OrgContext,
  action: string,
  targetUserId: string,
  metadata: Record<string, unknown> = {},
): AuditEvent {
  return {
    category: 'organization',
    action,
    outcome: 'success',
    actorType: 'user',
    actorId: ctx.userId,
    organizationId: ctx.organizationId,
    targetType: 'membership',
    targetId: targetUserId,
    metadata,
  };
}

/**
 * „Schimbă rolul” (E28): Membru ↔ Admin. B4: an admin cannot make another admin (as for
 * invitations). The audit row is in the same transaction (required).
 */
export async function changeMemberRole(
  ctx: OrgContext,
  targetUserId: string,
  role: ManagedRole,
): Promise<{ changed: boolean }> {
  if (role !== 'admin' && role !== 'member') throw new ForbiddenError('Unknown role');
  if (ctx.role === 'admin' && role === 'admin') {
    throw new ForbiddenError('Admins cannot make other admins');
  }
  const db = getOrgDb();
  return db.$transaction(async (tx: any) => {
    const m = await managedMembership(tx, ctx, targetUserId);
    if (m.role === role) return { changed: false };
    await tx.$executeRaw`UPDATE organizations.membership SET role = ${role}::"organizations"."MembershipRole", updated_at = now()
      WHERE id = ${m.id}::uuid`;
    await appendAuditEventInTx(
      prismaTxExecutor(tx),
      memberAudit(ctx, AuditActions.membershipRoleChanged, targetUserId, {
        from: m.role,
        to: role,
      }),
    );
    return { changed: true };
  });
}

/**
 * „Oprește accesul” / „Redă accesul”: the membership stays (role, applications), the person
 * cannot get in until it is restored (resolveOrgContext needs an active membership).
 */
export async function setMemberAccess(
  ctx: OrgContext,
  targetUserId: string,
  access: 'stopped' | 'active',
): Promise<{ changed: boolean }> {
  const status = access === 'stopped' ? 'suspended' : 'active';
  const db = getOrgDb();
  return db.$transaction(async (tx: any) => {
    const m = await managedMembership(tx, ctx, targetUserId);
    if (m.status === status) return { changed: false };
    await tx.$executeRaw`UPDATE organizations.membership SET status = ${status}::"organizations"."MembershipStatus", updated_at = now()
      WHERE id = ${m.id}::uuid`;
    await appendAuditEventInTx(
      prismaTxExecutor(tx),
      memberAudit(
        ctx,
        access === 'stopped'
          ? AuditActions.membershipAccessStopped
          : AuditActions.membershipAccessRestored,
        targetUserId,
        { role: m.role },
      ),
    );
    return { changed: true };
  });
}

/**
 * „Elimină din afacere”: the membership is deleted (the account stays). The applications the
 * person had (access.application_access) are removed by the caller (core/access), which owns them.
 */
export async function removeMember(ctx: OrgContext, targetUserId: string): Promise<void> {
  const db = getOrgDb();
  await db.$transaction(async (tx: any) => {
    const m = await managedMembership(tx, ctx, targetUserId);
    await tx.$executeRaw`DELETE FROM organizations.membership WHERE id = ${m.id}::uuid`;
    await appendAuditEventInTx(
      prismaTxExecutor(tx),
      memberAudit(ctx, AuditActions.membershipRemoved, targetUserId, { role: m.role }),
    );
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
        // Lot 2.7 · C: the new link answers the request
        newLinkRequestedAt: null,
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
