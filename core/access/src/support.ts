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
        `SELECT id::text AS id, opened_at, expires_at, expired_ids::text[] AS expired_ids
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

    // An expired session of the same pair was closed to make room: E37 for it, once.
    for (const expiredId of (row.expired_ids as string[] | null) ?? []) {
      await appendAuditEventInTx(
        exec,
        expiredEvent(expiredId, params.organizationId, founder.userId, 'open'),
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

    const owners: { userId: string; email: string; name: string }[] = [];
    for (const userId of organization.ownerUserIds) {
      const contact = await getUserContactInTx(exec, userId);
      if (contact) owners.push({ userId, ...contact });
    }
    return { session, organizationName: organization.organizationName, owners };
  });

  // E-6 after the commit: an email that cannot leave never undoes the session.
  for (const owner of opened.owners) {
    const result = await sendSupportSessionNotice({
      email: owner.email,
      name: owner.name,
      businessName: opened.organizationName,
      founderName: founder.name,
      ticketRef: input.ticketRef,
      expiresAt: opened.session.expiresAt,
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
