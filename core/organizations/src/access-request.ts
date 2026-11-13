import { AuditActions, appendAuditEventInTx, prismaTxExecutor } from '@ventora/audit';
import { InvalidInput } from '@ventora/errors';
import { ACCESS_REQUEST_TYPE, sendNotification, type SqlClient } from '@ventora/notifications';
import { getOrgDb } from './db';
import { ForbiddenError, OrganizationSuspendedError } from './errors';
import type { OrgContext } from './contract';

/*
 * Lot 5.1c — „Cere acces” (FAZA-5 5.1b, design S146; the decisions of 12.11: one row per person,
 * the request sent again after 7 days updates the date).
 *
 *   requestApplicationAccess → a person with a role but no application asks; the owner and the
 *                              admins get the notification (Activitate, „Deschide Echipa”) in the
 *                              same transaction. Again within 7 days → AccessRequestTooSoon.
 *   getMyAccessRequest       → the state of the person's request (HubEmpty: sent / resend after).
 *   listAccessRequests       → owner and admin: who asks (the launcher's „Au nevoie de tine”, the
 *                              badge in Echipă și invitații).
 *
 * „The person has no application” is checked by the caller (the Hub, through the core/access
 * contract), as the request disappears for the owner once the person gets an application: this
 * package reads no other module's schema.
 */

export const ACCESS_REQUEST_RESEND_DAYS = 7;
const DAY_MS = 86_400_000;

/** Sent again too soon: the request stays as it was; `canResendAt` says when. */
export class AccessRequestTooSoon extends Error {
  readonly code = 'ACCESS_REQUEST_TOO_SOON';
  constructor(readonly canResendAt: Date) {
    super('The access request can be sent again after 7 days');
    this.name = 'AccessRequestTooSoon';
  }
}

export type MyAccessRequest = {
  firstRequestedAt: Date;
  requestedAt: Date;
  requestCount: number;
  canResendAt: Date;
};

export type AccessRequestRow = MyAccessRequest & {
  userId: string;
  role: string;
};

/** The roles that have every application implicitly (ADR-0004) never ask. */
const IMPLICIT = new Set(['owner', 'admin']);

const canResend = (requestedAt: Date) =>
  new Date(requestedAt.getTime() + ACCESS_REQUEST_RESEND_DAYS * DAY_MS);

/** The Prisma interactive transaction as the SqlClient the notifications take (same transaction). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sqlClientOf(tx: any): SqlClient {
  return {
    async query(sql: string, params: unknown[] = []) {
      const rows = (await tx.$queryRawUnsafe(sql, ...params)) as unknown[];
      return { rows, rowCount: Array.isArray(rows) ? rows.length : 0 };
    },
  };
}

type Row = {
  user_id: string;
  role: string;
  first_requested_at: Date;
  requested_at: Date;
  request_count: number;
};

const toMine = (r: Pick<Row, 'first_requested_at' | 'requested_at' | 'request_count'>) => ({
  firstRequestedAt: r.first_requested_at,
  requestedAt: r.requested_at,
  requestCount: r.request_count,
  canResendAt: canResend(r.requested_at),
});

/**
 * Sends (or sends again, after 7 days) the person's request and tells the owner and the admins.
 * `requesterName` comes from the caller's session (the Hub), never from the browser.
 */
export async function requestApplicationAccess(
  ctx: OrgContext,
  input: { requesterName: string },
): Promise<MyAccessRequest> {
  if (IMPLICIT.has(ctx.role)) throw new InvalidInput('role', 'owner and admin have every app');
  const name = input.requesterName?.trim();
  if (!name || name.length > 200) throw new InvalidInput('requesterName');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getOrgDb().$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${ctx.organizationId}, true)`;
    const org = (await tx.$queryRaw`
      SELECT name, status::text AS status FROM organizations.organization
       WHERE id = ${ctx.organizationId}::uuid`) as { name: string; status: string }[];
    if (!org[0]) throw new ForbiddenError();
    if (org[0].status === 'suspended') throw new OrganizationSuspendedError();
    const member = (await tx.$queryRaw`
      SELECT role::text AS role FROM organizations.membership
       WHERE organization_id = ${ctx.organizationId}::uuid AND user_id = ${ctx.userId}::uuid
         AND status = 'active'`) as { role: string }[];
    if (!member[0]) throw new ForbiddenError();

    const existing = (await tx.$queryRaw`
      SELECT requested_at, request_count FROM organizations.access_request
       WHERE organization_id = ${ctx.organizationId}::uuid AND user_id = ${ctx.userId}::uuid
       FOR UPDATE`) as { requested_at: Date; request_count: number }[];
    const prev = existing[0];
    if (prev && canResend(prev.requested_at).getTime() > Date.now()) {
      throw new AccessRequestTooSoon(canResend(prev.requested_at));
    }
    const rows = (await tx.$queryRaw`
      INSERT INTO organizations.access_request (organization_id, user_id)
      VALUES (${ctx.organizationId}::uuid, ${ctx.userId}::uuid)
      ON CONFLICT (organization_id, user_id) DO UPDATE
         SET requested_at = now(),
             request_count = organizations.access_request.request_count + 1
      RETURNING first_requested_at, requested_at, request_count`) as Row[];
    const saved = rows[0]!;

    // the owner and the admins, in the app (Activitate); the same transaction
    const recipients = (await tx.$queryRaw`
      SELECT user_id::text AS user_id, role::text AS role FROM organizations.membership
       WHERE organization_id = ${ctx.organizationId}::uuid AND status = 'active'
         AND role IN ('owner', 'admin')`) as { user_id: string; role: string }[];
    if (recipients.length) {
      await sendNotification(sqlClientOf(tx), {
        category: 'operational',
        type: ACCESS_REQUEST_TYPE,
        version: 1,
        organizationId: ctx.organizationId,
        recipientUserIds: recipients.map((r) => r.user_id),
        ownerUserIds: recipients.filter((r) => r.role === 'owner').map((r) => r.user_id),
        idempotencyKey: `access-request:${ctx.organizationId}:${ctx.userId}:${saved.request_count}`,
        params: {
          name,
          role: { type: 'key', key: `email.roles.${member[0].role}` },
          business: org[0].name,
        },
      });
    }
    await appendAuditEventInTx(prismaTxExecutor(tx), {
      category: 'organization',
      action: AuditActions.membershipAccessRequested,
      outcome: 'success',
      actorType: 'user',
      actorId: ctx.userId,
      organizationId: ctx.organizationId,
      targetType: 'user',
      targetId: ctx.userId,
      metadata: { requestCount: saved.request_count },
    });
    return toMine(saved);
  });
}

/** The person's own request in this business (null if never sent). */
export async function getMyAccessRequest(ctx: OrgContext): Promise<MyAccessRequest | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getOrgDb().$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${ctx.organizationId}, true)`;
    const rows = (await tx.$queryRaw`
      SELECT first_requested_at, requested_at, request_count FROM organizations.access_request
       WHERE organization_id = ${ctx.organizationId}::uuid AND user_id = ${ctx.userId}::uuid`) as Row[];
    return rows[0] ? toMine(rows[0]) : null;
  });
}

/**
 * Owner and admin: the requests of the active members, newest first. The Hub keeps only the
 * people who still have no application (core/access).
 */
export async function listAccessRequests(ctx: OrgContext): Promise<AccessRequestRow[]> {
  if (!IMPLICIT.has(ctx.role)) throw new ForbiddenError();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getOrgDb().$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${ctx.organizationId}, true)`;
    const rows = (await tx.$queryRaw`
      SELECT r.user_id::text AS user_id, m.role::text AS role, r.first_requested_at,
             r.requested_at, r.request_count
        FROM organizations.access_request r
        JOIN organizations.membership m
          ON m.organization_id = r.organization_id AND m.user_id = r.user_id
       WHERE r.organization_id = ${ctx.organizationId}::uuid AND m.status = 'active'
       ORDER BY r.requested_at DESC`) as Row[];
    return rows.map((r) => ({ userId: r.user_id, role: r.role, ...toMine(r) }));
  });
}
