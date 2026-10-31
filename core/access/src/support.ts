import {
  AppNotEnabled,
  Conflict,
  Forbidden,
  InvalidInput,
  NotAuthenticated,
  NotMember,
  ResourceNotFound,
} from '@ventora/errors';
import {
  AuditActions,
  appendAuditEventInTx,
  hashEmail,
  prismaTxExecutor,
  writeAuditEvent,
  type AuditSqlExecutor,
} from '@ventora/audit';
import {
  getSession,
  getUserById,
  getUserContactInTx,
  registerFounderRevocationHook,
  requireFounderSession,
  type FounderSession,
} from '@ventora/identity';
import { listOrganizationOwnersInTx, resolveOrgContext } from '@ventora/organizations';
import { sendSupportSessionNotice } from '@ventora/notifications';
import { authorize, getEntitlementProvider, type TenantContext } from './contract';
import { getAccessDb } from './db';
import { asSessionRole, withFounderTransaction } from './founder-db';
import { PLATFORM_APPLICATION_ID } from './platform-manifest';

// FAZA-2: 60 minutes by default, 240 at most. Mirrored by CHECK constraints in M2.
export const SUPPORT_SESSION_DEFAULT_MINUTES = 60;
export const SUPPORT_SESSION_MAX_MINUTES = 240;
const REASON_MIN_LENGTH = 10;
const REASON_MAX_LENGTH = 1000;
const TICKET_REF_MAX_LENGTH = 255;

/**
 * D12: what a Founder may do inside a support session — read only, as an explicit allow-list of
 * `applicationId/permission` (never derived from a role). Anything else is Forbidden + E39:
 * writes, members, invitations, roles, 2FA, passwords, sessions, billing, export, deletion.
 */
export const SUPPORT_PERMISSIONS: ReadonlySet<string> = new Set([
  'booking/booking:read',
  `${PLATFORM_APPLICATION_ID}/audit.log.read`,
]);

export function isSupportPermission(applicationId: string, permission: string): boolean {
  return SUPPORT_PERMISSIONS.has(`${applicationId}/${permission}`);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SupportSessionSummary = {
  id: string;
  organizationId: string;
  openedAt: Date;
  expiresAt: Date;
};

export type ActiveSupportSession = {
  id: string;
  founderName: string;
  reason: string;
  ticketRef: string;
  openedAt: Date;
  expiresAt: Date;
};

export type SupportSessionBanner = {
  id: string;
  founderName: string;
  expiresAt: Date;
};

function validateSupportRequest(params: {
  organizationId: string;
  reason: string;
  ticketRef: string;
  durationMinutes?: number;
}): { reason: string; ticketRef: string; durationMinutes: number } {
  if (!UUID_RE.test(params.organizationId)) throw new InvalidInput('organizationId');
  const reason = (params.reason ?? '').trim();
  if (reason.length < REASON_MIN_LENGTH || reason.length > REASON_MAX_LENGTH) {
    throw new InvalidInput('reason');
  }
  const ticketRef = (params.ticketRef ?? '').trim();
  if (!ticketRef || ticketRef.length > TICKET_REF_MAX_LENGTH) throw new InvalidInput('ticketRef');
  const durationMinutes = params.durationMinutes ?? SUPPORT_SESSION_DEFAULT_MINUTES;
  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 1 ||
    durationMinutes > SUPPORT_SESSION_MAX_MINUTES
  ) {
    throw new InvalidInput('durationMinutes');
  }
  return { reason, ticketRef, durationMinutes };
}

function expiredEvent(
  sessionId: string,
  organizationId: string,
  founderId: string,
  detectedBy: 'authorize' | 'open',
) {
  return {
    category: 'support' as const,
    action: AuditActions.supportSessionExpired,
    outcome: 'success' as const,
    actorType: 'system' as const,
    founderId,
    supportSessionId: sessionId,
    organizationId,
    targetType: 'support_session' as const,
    targetId: sessionId,
    metadata: { detectedBy },
  };
}

/**
 * Lot 2.6 · G, Lot 2.7 · B: the organization already has an open session (one per organization,
 * whichever Founder opened it). The screen shows who and until when ("Afacerea are deja o sesiune de suport deschisă").
 */
export class SupportSessionConflict extends Conflict {
  readonly existing: { founderName: string; expiresAt: string } | null;
  constructor(existing: { founderName: string; expiresAt: Date } | null) {
    super('A support session for this organization is already open');
    this.existing = existing
      ? { founderName: existing.founderName, expiresAt: existing.expiresAt.toISOString() }
      : null;
  }
}

/** Lot 2.6 · G: the business name and its active owners (FounderOwnerRecovery, the banner). */
export async function getBusinessForFounder(params: {
  founderHeaders: Headers;
  organizationId: string;
}): Promise<{
  organizationName: string;
  owners: { userId: string; name: string; email: string }[];
}> {
  await requireFounderSession(params.founderHeaders);
  if (!UUID_RE.test(params.organizationId)) throw new InvalidInput('organizationId');
  return withFounderTransaction(async (exec) => {
    const organization = await listOrganizationOwnersInTx(exec, params.organizationId);
    if (!organization) throw new ResourceNotFound('Organization not found');
    const owners: { userId: string; name: string; email: string }[] = [];
    for (const userId of organization.ownerUserIds) {
      const contact = await getUserContactInTx(exec, userId);
      if (contact) owners.push({ userId, name: contact.name, email: contact.email });
    }
    return { organizationName: organization.organizationName, owners };
  });
}

/**
 * Opens a read-only support session for an organization (D10 variant A: active immediately,
 * visible to the organization, the owners get E-6). The session row and E34 are one
 * transaction: no audit row, no session.
 */
export async function openSupportSession(params: {
  founderHeaders: Headers;
  organizationId: string;
  reason: string;
  ticketRef: string;
  durationMinutes?: number;
}): Promise<SupportSessionSummary> {
  const founder = await requireFounderSession(params.founderHeaders);
  const input = validateSupportRequest(params);

  const opened = await withFounderTransaction(async (exec) => {
    const organization = await listOrganizationOwnersInTx(exec, params.organizationId);
    if (!organization) throw new ResourceNotFound('Organization not found');

    let rows: Record<string, unknown>[];
    try {
      rows = await exec.query(
        `SELECT id::text AS id, opened_at, expires_at, expired_ids::text[] AS expired_ids,
                expired_founder_ids
           FROM access.founder_open_support_session($1::uuid, $2, $3, $4, $5, $6)`,
        [
          params.organizationId,
          founder.userId,
          founder.name,
          input.reason,
          input.ticketRef,
          input.durationMinutes,
        ],
      );
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new Conflict('A support session for this organization is already open');
      }
      throw err;
    }
    const row = rows[0];
    if (!row) throw new Error('[access] founder_open_support_session returned no row');
    const session = {
      id: row.id as string,
      organizationId: params.organizationId,
      openedAt: row.opened_at as Date,
      expiresAt: row.expires_at as Date,
    };

    // An expired session of the organization (any Founder, Lot 2.7 · B) was closed to make
    // room: E37 for it, once, under the Founder who had it.
    const expiredFounders = (row.expired_founder_ids as string[] | null) ?? [];
    for (const [i, expiredId] of ((row.expired_ids as string[] | null) ?? []).entries()) {
      await appendAuditEventInTx(
        exec,
        expiredEvent(
          expiredId,
          params.organizationId,
          expiredFounders[i] ?? founder.userId,
          'open',
        ),
      );
    }

    await appendAuditEventInTx(exec, {
      category: 'support',
      action: AuditActions.supportSessionOpened,
      outcome: 'success',
      actorType: 'founder',
      actorId: founder.userId,
      founderId: founder.userId,
      supportSessionId: session.id,
      organizationId: params.organizationId,
      targetType: 'support_session',
      targetId: session.id,
      metadata: {
        reason: input.reason,
        ticketRef: input.ticketRef,
        durationMinutes: input.durationMinutes,
        expiresAt: session.expiresAt.toISOString(),
      },
    });

    const owners: { userId: string; email: string; name: string; locale: string | null }[] = [];
    for (const userId of organization.ownerUserIds) {
      const contact = await getUserContactInTx(exec, userId);
      if (contact) owners.push({ userId, ...contact });
    }
    return { session, organizationName: organization.organizationName, owners };
  }).catch(async (err: unknown) => {
    // Lot 2.6 · G: the screen says who has the open session and until when. The first
    // transaction is rolled back; the open session is read in a new one.
    if (!(err instanceof Conflict)) throw err;
    const existing = await withFounderTransaction((exec) =>
      exec.query(
        `SELECT founder_name, expires_at
           FROM access.founder_get_open_support_session($1::uuid)`,
        [params.organizationId],
      ),
    );
    const row = existing[0];
    throw new SupportSessionConflict(
      row ? { founderName: row.founder_name as string, expiresAt: row.expires_at as Date } : null,
    );
  });

  // E-6 after the commit: an email that cannot leave never undoes the session.
  for (const owner of opened.owners) {
    const result = await sendSupportSessionNotice({
      email: owner.email,
      name: owner.name,
      businessName: opened.organizationName,
      founderName: founder.name,
      reason: input.reason,
      ticketRef: input.ticketRef,
      expiresAt: opened.session.expiresAt,
      // D4-8: in the owner's language
      locale: owner.locale,
    });
    if (result.status === 'failed') {
      await writeAuditEvent(
        {
          category: 'support',
          action: AuditActions.supportSessionNoticeFailed,
          outcome: 'failure',
          actorType: 'system',
          founderId: founder.userId,
          supportSessionId: opened.session.id,
          organizationId: params.organizationId,
          targetType: 'user',
          targetId: owner.userId,
          metadata: { reason: result.reason, emailHash: hashEmail(owner.email) },
        },
        { mode: 'best_effort', connection: 'founder' },
      );
    }
  }

  return opened.session;
}

/** Manual close by the Founder who opened it (E35). */
export async function closeSupportSession(params: {
  founderHeaders: Headers;
  supportSessionId: string;
}): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  if (!UUID_RE.test(params.supportSessionId)) throw new ResourceNotFound();

  await withFounderTransaction(async (exec) => {
    const rows = await exec.query(
      `SELECT access.founder_close_support_session($1::uuid, $2)::text AS organization_id`,
      [params.supportSessionId, founder.userId],
    );
    const organizationId = rows[0]?.organization_id as string | null | undefined;
    if (!organizationId) throw new ResourceNotFound('No open support session with this id');
    await appendAuditEventInTx(exec, {
      category: 'support',
      action: AuditActions.supportSessionClosed,
      outcome: 'success',
      actorType: 'founder',
      actorId: founder.userId,
      founderId: founder.userId,
      supportSessionId: params.supportSessionId,
      organizationId,
      targetType: 'support_session',
      targetId: params.supportSessionId,
      metadata: { closedBy: 'founder' },
    });
  });
}

type SupportSessionRow = {
  id: string;
  organization_id: string;
  closed_at: Date | null;
  is_expired: boolean;
};

async function loadOwnSupportSession(
  founder: FounderSession,
  supportSessionId: string,
): Promise<SupportSessionRow | null> {
  return withFounderTransaction(async (exec) => {
    const rows = await exec.query(
      `SELECT id::text AS id, organization_id::text AS organization_id, closed_at, is_expired
         FROM access.founder_get_support_session($1::uuid, $2)`,
      [supportSessionId, founder.userId],
    );
    return (rows[0] as SupportSessionRow | undefined) ?? null;
  });
}

/**
 * Builds the context for one call made by a Founder inside a support session. Checked on every
 * call (§3.3): Founder session valid, not revoked, 2FA on; the support session is the Founder's
 * own, for this organization, open and not expired; the application is enabled; the permission
 * is on the read-only allow-list. No impersonation: the context carries the Founder, never a
 * Hub user. Every accepted call is audited (E38, required); a refused permission is E39.
 */
export async function authorizeSupport(params: {
  founderHeaders: Headers;
  supportSessionId: string;
  organizationId: string;
  applicationId: string;
  permission: string;
  resource?: {
    type: string;
    id: string;
    exists: (ctx: TenantContext) => Promise<boolean>;
  };
}): Promise<TenantContext> {
  const founder = await requireFounderSession(params.founderHeaders);
  if (!UUID_RE.test(params.supportSessionId) || !UUID_RE.test(params.organizationId)) {
    throw new NotAuthenticated('Support session not valid');
  }

  const session = await loadOwnSupportSession(founder, params.supportSessionId);
  if (!session || session.organization_id !== params.organizationId || session.closed_at) {
    throw new NotAuthenticated('Support session not valid');
  }
  if (session.is_expired) {
    // T3.9: the first call after expiry closes it and writes E37; later calls only refuse.
    await withFounderTransaction(async (exec) => {
      const rows = await exec.query(
        `SELECT access.founder_expire_support_session($1::uuid, $2)::text AS organization_id`,
        [session.id, founder.userId],
      );
      if (rows[0]?.organization_id) {
        await appendAuditEventInTx(
          exec,
          expiredEvent(session.id, session.organization_id, founder.userId, 'authorize'),
        );
      }
    });
    throw new NotAuthenticated('Support session expired');
  }

  if (params.applicationId !== PLATFORM_APPLICATION_ID) {
    const enabled = await getEntitlementProvider().isEnabled(
      params.organizationId,
      params.applicationId,
    );
    if (!enabled) throw new AppNotEnabled();
  }

  const supportAudit = {
    category: 'support' as const,
    actorType: 'support' as const,
    actorId: founder.userId,
    founderId: founder.userId,
    supportSessionId: session.id,
    organizationId: params.organizationId,
  };
  const resource = params.resource ? { type: params.resource.type, id: params.resource.id } : null;

  if (!isSupportPermission(params.applicationId, params.permission)) {
    await writeAuditEvent(
      {
        ...supportAudit,
        action: AuditActions.supportActionDenied,
        outcome: 'denied',
        metadata: {
          applicationId: params.applicationId,
          permission: params.permission,
          resource,
        },
      },
      { mode: 'required', connection: 'founder' },
    );
    throw new Forbidden('Not allowed in a support session');
  }

  const ctx: TenantContext = {
    userId: founder.userId,
    organizationId: params.organizationId,
    membershipId: null,
    role: 'support',
    applicationId: params.applicationId,
    actor: 'support',
    roleInApp: null,
    founderId: founder.userId,
    supportSessionId: session.id,
  };

  if (params.resource && !(await params.resource.exists(ctx))) throw new ResourceNotFound();

  await writeAuditEvent(
    {
      ...supportAudit,
      action: AuditActions.supportAction,
      outcome: 'success',
      metadata: { applicationId: params.applicationId, permission: params.permission, resource },
    },
    { mode: 'required', connection: 'founder' },
  );
  return ctx;
}

async function readOpenSessions(organizationId: string) {
  const db = getAccessDb();
  return db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
    return tx.supportSession.findMany({
      where: { organizationId, closedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { openedAt: 'asc' },
      select: {
        id: true,
        founderName: true,
        reason: true,
        ticketRef: true,
        openedAt: true,
        expiresAt: true,
      },
    }) as Promise<ActiveSupportSession[]>;
  });
}

/** Owner / admin (T3.10a): the open support sessions of the active organization, in detail. */
export async function listActiveSupportSessions(params: {
  sessionToken: string;
}): Promise<ActiveSupportSession[]> {
  const ctx = await authorize({
    sessionToken: params.sessionToken,
    applicationId: PLATFORM_APPLICATION_ID,
    permission: 'support.session.read',
  });
  return readOpenSessions(ctx.organizationId);
}

export type SupportSessionStatus = 'active' | 'closed' | 'expired';

export type SupportSessionHistoryItem = {
  id: string;
  founderName: string;
  reason: string;
  ticketRef: string;
  openedAt: Date;
  /** Expires (active) or expired (closed / expired) at. */
  expiresAt: Date;
  closedAt: Date | null;
  status: SupportSessionStatus;
  /**
   * Who closed it: the Founder, a member of the business (by name), or the system (Founder
   * revoked). null while active and for an expired session.
   */
  closedBy:
    | { type: 'founder'; id: string; name: string }
    | { type: 'member'; id: string; name: string | null }
    | { type: 'system' }
    | null;
};

export type SupportSessionHistoryPage = {
  items: SupportSessionHistoryItem[];
  page: number;
  pageSize: number;
  total: number;
};

export const SUPPORT_HISTORY_DEFAULT_PAGE_SIZE = 20;
export const SUPPORT_HISTORY_MAX_PAGE_SIZE = 100;

type HistoryRow = {
  id: string;
  founderName: string;
  reason: string;
  ticketRef: string;
  openedAt: Date;
  expiresAt: Date;
  closedAt: Date | null;
  closedByType: string | null;
  closedById: string | null;
};

function historyStatus(row: HistoryRow, now: Date): SupportSessionStatus {
  if (!row.closedAt) return row.expiresAt > now ? 'active' : 'expired';
  // closed by the system at or after the expiry (open / authorize found it expired)
  if (row.closedByType === 'system' && row.closedAt >= row.expiresAt) return 'expired';
  return 'closed';
}

/**
 * Owner / admin (R-SS1, same permission as listActiveSupportSessions): every support session
 * of the active organization, active and past, newest first, one page at a time.
 */
export async function listSupportSessions(params: {
  sessionToken: string;
  page?: number;
  pageSize?: number;
}): Promise<SupportSessionHistoryPage> {
  const ctx = await authorize({
    sessionToken: params.sessionToken,
    applicationId: PLATFORM_APPLICATION_ID,
    permission: 'support.session.read',
  });
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? SUPPORT_HISTORY_DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(page) || page < 1) throw new InvalidInput('page');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > SUPPORT_HISTORY_MAX_PAGE_SIZE) {
    throw new InvalidInput('pageSize');
  }

  const db = getAccessDb();
  const { rows, total } = await db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${ctx.organizationId}, true)`;
    const where = { organizationId: ctx.organizationId };
    const [rows, total] = await Promise.all([
      tx.supportSession.findMany({
        where,
        orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          founderName: true,
          reason: true,
          ticketRef: true,
          openedAt: true,
          expiresAt: true,
          closedAt: true,
          closedByType: true,
          closedById: true,
        },
      }) as Promise<HistoryRow[]>,
      tx.supportSession.count({ where }) as Promise<number>,
    ]);
    return { rows, total };
  });

  // names of the members who closed a session, read once each from identity
  const memberIds = [
    ...new Set(
      rows.filter((r) => r.closedByType === 'owner' && r.closedById).map((r) => r.closedById!),
    ),
  ];
  const names = new Map<string, string | null>();
  for (const id of memberIds) names.set(id, (await getUserById(id))?.name ?? null);

  const now = new Date();
  const items = rows.map((row): SupportSessionHistoryItem => {
    const status = historyStatus(row, now);
    let closedBy: SupportSessionHistoryItem['closedBy'] = null;
    if (status === 'closed') {
      if (row.closedByType === 'founder' && row.closedById) {
        // only the Founder who opened a session can close it (founder_close_support_session)
        closedBy = { type: 'founder', id: row.closedById, name: row.founderName };
      } else if (row.closedByType === 'owner' && row.closedById) {
        closedBy = { type: 'member', id: row.closedById, name: names.get(row.closedById) ?? null };
      } else {
        closedBy = { type: 'system' };
      }
    }
    return {
      id: row.id,
      founderName: row.founderName,
      reason: row.reason,
      ticketRef: row.ticketRef,
      openedAt: row.openedAt,
      expiresAt: row.expiresAt,
      closedAt: row.closedAt,
      status,
      closedBy,
    };
  });

  return { items, page, pageSize, total };
}

/**
 * Every member (§3.5): what the Hub banner shows — who and until when, nothing else.
 * Only authorize() steps 1–2 (valid session, active membership): the platform pseudo-application
 * has no application_access rows, so step 4 would refuse every role below admin.
 */
export async function getSupportSessionBanner(params: {
  sessionToken: string;
}): Promise<SupportSessionBanner[]> {
  const session = await getSession(new Headers({ authorization: `Bearer ${params.sessionToken}` }));
  if (!session?.userId) throw new NotAuthenticated();
  const organizationId = session.activeOrganizationId;
  if (!organizationId) throw new NotMember();
  try {
    await resolveOrgContext({ userId: session.userId, organizationId });
  } catch {
    throw new NotMember();
  }
  const sessions = await readOpenSessions(organizationId);
  return sessions.map((s) => ({ id: s.id, founderName: s.founderName, expiresAt: s.expiresAt }));
}

/** D11: the owner closes a support session of their organization (E36, same transaction). */
export async function closeSupportSessionAsOwner(params: {
  sessionToken: string;
  supportSessionId: string;
}): Promise<void> {
  const ctx = await authorize({
    sessionToken: params.sessionToken,
    applicationId: PLATFORM_APPLICATION_ID,
    permission: 'support.session.close',
  });
  if (!UUID_RE.test(params.supportSessionId)) throw new ResourceNotFound();

  const db = getAccessDb();
  await db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${ctx.organizationId}, true)`;
    const rows = (await tx.$queryRaw`
      SELECT access.owner_close_support_session(${params.supportSessionId}::uuid, ${ctx.userId}) AS founder_id
    `) as { founder_id: string | null }[];
    const founderId = rows[0]?.founder_id;
    if (!founderId) throw new ResourceNotFound('No open support session with this id');
    await appendAuditEventInTx(prismaTxExecutor(tx), {
      category: 'support',
      action: AuditActions.supportSessionRevokedByOrg,
      outcome: 'success',
      actorType: 'user',
      actorId: ctx.userId,
      founderId,
      supportSessionId: params.supportSessionId,
      organizationId: ctx.organizationId,
      targetType: 'support_session',
      targetId: params.supportSessionId,
      metadata: { closedBy: 'owner' },
    });
  });
}

/**
 * Registered with identity: revokeFounderUser closes the revoked Founder's open support
 * sessions in its own transaction (closed_by_type = system), one E35 per session.
 */
async function closeSupportSessionsOfRevokedFounder(
  exec: AuditSqlExecutor,
  revoked: { founderId: string; revokedBy: string },
): Promise<void> {
  await asSessionRole(exec, async () => {
    const rows = await exec.query(
      `SELECT id::text AS id, organization_id::text AS organization_id
         FROM access.founder_close_support_sessions_of($1)`,
      [revoked.founderId],
    );
    for (const row of rows) {
      await appendAuditEventInTx(exec, {
        category: 'support',
        action: AuditActions.supportSessionClosed,
        outcome: 'success',
        actorType: 'system',
        founderId: revoked.founderId,
        supportSessionId: row.id as string,
        organizationId: row.organization_id as string,
        targetType: 'support_session',
        targetId: row.id as string,
        metadata: { closedBy: 'system', reason: 'founder_revoked', revokedBy: revoked.revokedBy },
      });
    }
  });
}

registerFounderRevocationHook(closeSupportSessionsOfRevokedFounder);
