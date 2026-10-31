import type { PoolClient } from 'pg';
import { CommercialRequestDecidedV1 } from '@ventora/contracts';
import { Conflict, Forbidden, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { AuditActions, appendAuditEventInTx, pgExecutor } from '@ventora/audit';
import { writeOutboxEvent } from '@ventora/db-kit';
import { requireFounderSession } from '@ventora/identity';
import { withFounderRead, withFounderWrite, withOrganizationWrite } from './db';
import { addonAvailableInTx, computeEntitlementsInTx, currentVersionInTx } from './entitlements';

/*
 * Lot 3.4: the requests from the Hub (FounderRequests, S111). „Cere activare” — an add-on on
 * request (or any add-on for a business without a saved card, Lot 3.7) or an application on
 * request (D3-9) — and „Cere alt abonament” (D3-9: changing the plan is always a request). The
 * owner asks from the Hub (D3-8: only the owner buys, so only the owner asks); the Ventora team
 * does the change on the business page, then marks the request resolved, or refuses it with a
 * reason the person who asked sees in the Hub (notification: F4, through the outbox). Every step
 * is audited; the database lets a request be decided once.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const REQUEST_REASON_MAX = 1000;

export type RequestKind = 'activation' | 'plan_change';
export type RequestTargetType = 'addon' | 'application' | 'plan';
export type RequestStatus = 'new' | 'resolved' | 'refused';

/** The acting person, from authorize() (the TenantContext of core/access). */
export interface RequestActor {
  organizationId: string;
  userId: string;
  role: string;
  actor: 'user' | 'system' | 'support';
}

export interface CommercialRequestRow {
  id: string;
  organizationId: string;
  kind: RequestKind;
  targetType: RequestTargetType;
  targetId: string;
  requestedByUserId: string;
  requestedByRole: string;
  status: RequestStatus;
  refusalReason: string | null;
  decidedAt: Date | null;
  decidedByFounderId: string | null;
  createdAt: Date;
}

function uuid(field: string, value: string): string {
  if (!UUID_RE.test(value ?? '')) throw new InvalidInput(field);
  return value;
}

type RequestDbRow = {
  id: string;
  organization_id: string;
  kind: RequestKind;
  target_type: RequestTargetType;
  target_id: string;
  requested_by_user_id: string;
  requested_by_role: string;
  status: RequestStatus;
  refusal_reason: string | null;
  decided_at: Date | null;
  decided_by_founder_id: string | null;
  created_at: Date;
};

const toRow = (r: RequestDbRow): CommercialRequestRow => ({
  id: r.id,
  organizationId: r.organization_id,
  kind: r.kind,
  targetType: r.target_type,
  targetId: r.target_id,
  requestedByUserId: r.requested_by_user_id,
  requestedByRole: r.requested_by_role,
  status: r.status,
  refusalReason: r.refusal_reason,
  decidedAt: r.decided_at,
  decidedByFounderId: r.decided_by_founder_id,
  createdAt: r.created_at,
});

/** What can be asked: an add-on of the plan on sale, an application not yet in it, another plan. */
async function checkTarget(
  client: PoolClient,
  organizationId: string,
  kind: RequestKind,
  targetType: RequestTargetType,
  targetId: string,
): Promise<void> {
  const entitlements = await computeEntitlementsInTx(client, organizationId, null);
  const versionNow = await currentVersionInTx(client);
  if (kind === 'plan_change') {
    if (targetType !== 'plan') throw new InvalidInput('targetType');
    const { rows } = await client.query<{ id: string }>(
      `SELECT p.id FROM commercial.plan p
        WHERE p.id = $1 AND EXISTS (
          SELECT 1 FROM commercial.plan_version v WHERE v.plan_id = p.id AND v.published_at IS NOT NULL)`,
      [uuid('targetId', targetId)],
    );
    if (!rows[0]) throw new InvalidInput('targetId', 'No published plan');
    if (versionNow) {
      const current = await client.query<{ plan_id: string }>(
        `SELECT v.plan_id FROM commercial.plan_version v WHERE v.id = $1`,
        [versionNow],
      );
      if (current.rows[0]?.plan_id === targetId) {
        throw new InvalidInput('targetId', 'The business is already on this plan');
      }
    }
    return;
  }
  if (targetType === 'application') {
    const { rows } = await client.query(
      `SELECT 1 FROM commercial.application WHERE id = $1 AND retired_at IS NULL AND NOT is_platform`,
      [targetId],
    );
    if (!rows[0]) throw new InvalidInput('targetId', 'Unknown application');
    if (entitlements.applications.includes(targetId)) {
      throw new InvalidInput('targetId', 'The application is already active');
    }
    return;
  }
  if (targetType !== 'addon') throw new InvalidInput('targetType');
  if (!entitlements.subscription) {
    throw new InvalidInput('targetId', 'The business has no subscription');
  }
  if (!(await addonAvailableInTx(client, organizationId, uuid('targetId', targetId)))) {
    throw new InvalidInput('targetId', 'Not available to this business');
  }
}

/**
 * „Cere activare” / „Cere alt abonament” from the Hub. `actor` comes from authorize() (never from
 * client input); only the owner asks (D3-8), checked here. One open request per item: asking
 * again returns the open one (idempotent for a double click).
 */
export async function createCommercialRequest(
  actor: RequestActor,
  input: { kind: RequestKind; targetType: RequestTargetType; targetId: string },
): Promise<{ requestId: string; created: boolean }> {
  const organizationId = uuid('organizationId', actor.organizationId);
  if (actor.actor !== 'user' || actor.role !== 'owner') {
    throw new Forbidden('Only the owner asks for an activation or another plan');
  }
  if (input.kind !== 'activation' && input.kind !== 'plan_change') {
    throw new InvalidInput('kind');
  }
  const targetId = String(input.targetId ?? '').trim();
  if (!targetId || targetId.length > 128) throw new InvalidInput('targetId');

  return withOrganizationWrite(organizationId, async (client) => {
    await checkTarget(client, organizationId, input.kind, input.targetType, targetId);
    const open = await client.query<{ id: string }>(
      `SELECT id FROM commercial.commercial_request
        WHERE kind = $1 AND target_type = $2 AND target_id = $3 AND status = 'new'`,
      [input.kind, input.targetType, targetId],
    );
    if (open.rows[0]) return { requestId: open.rows[0].id, created: false };
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO commercial.commercial_request
         (organization_id, kind, target_type, target_id, requested_by_user_id, requested_by_role)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [organizationId, input.kind, input.targetType, targetId, actor.userId, actor.role],
    );
    const requestId = rows[0]!.id;
    await appendAuditEventInTx(pgExecutor(client), {
      category: 'commercial',
      action: AuditActions.commercialRequestCreated,
      outcome: 'success',
      actorType: 'user',
      actorId: actor.userId,
      organizationId,
      targetType: 'commercial_request',
      targetId: requestId,
      metadata: { kind: input.kind, targetType: input.targetType, targetId },
    });
    return { requestId, created: true };
  });
}

/** FounderRequests: the requests of every business, newest first („Noi” = only the new ones). */
export async function listRequestsForFounder(params: {
  founderHeaders: Headers;
  onlyNew?: boolean;
}): Promise<CommercialRequestRow[]> {
  await requireFounderSession(params.founderHeaders);
  return withFounderRead(async (client) => {
    const { rows } = await client.query<RequestDbRow>(
      `SELECT * FROM commercial.founder_list_requests($1)`,
      [params.onlyNew ?? false],
    );
    return rows.map(toRow);
  });
}

async function decide(
  params: { founderHeaders: Headers; organizationId: string; requestId: string },
  status: 'resolved' | 'refused',
  reason: string | null,
): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  const requestId = uuid('requestId', params.requestId);
  await withFounderWrite(organizationId, async (client, exec) => {
    const found = await client.query<{ status: RequestStatus; requested_by_user_id: string }>(
      `SELECT status, requested_by_user_id FROM commercial.commercial_request
        WHERE id = $1 FOR UPDATE`,
      [requestId],
    );
    const row = found.rows[0];
    if (!row) throw new ResourceNotFound('Request not found');
    if (row.status !== 'new') throw new Conflict('The request is already decided');
    await client.query(
      `UPDATE commercial.commercial_request
          SET status = $2, refusal_reason = $3, decided_by_founder_id = $4
        WHERE id = $1`,
      [requestId, status, reason, founder.userId],
    );
    await writeOutboxEvent(client, 'commercial', CommercialRequestDecidedV1, {
      organizationId,
      sourceApp: CommercialRequestDecidedV1.sourceApp,
      resourceId: requestId,
      payload: { requestId, requestedByUserId: row.requested_by_user_id, status },
    });
    await appendAuditEventInTx(exec, {
      category: 'commercial',
      action:
        status === 'resolved'
          ? AuditActions.commercialRequestResolved
          : AuditActions.commercialRequestRefused,
      outcome: 'success',
      actorType: 'founder',
      actorId: founder.userId,
      founderId: founder.userId,
      organizationId,
      targetType: 'commercial_request',
      targetId: requestId,
      metadata: reason ? { reason } : {},
    });
  });
}

/** „Marchează rezolvată”, after doing the change on the business page. */
export async function resolveRequest(params: {
  founderHeaders: Headers;
  organizationId: string;
  requestId: string;
}): Promise<void> {
  await decide(params, 'resolved', null);
}

/** „Refuză…”, with the reason the person who asked sees in the Hub notification. */
export async function refuseRequest(params: {
  founderHeaders: Headers;
  organizationId: string;
  requestId: string;
  reason: string;
}): Promise<void> {
  const reason = params.reason?.trim() ?? '';
  if (!reason || reason.length > REQUEST_REASON_MAX) {
    throw new InvalidInput('reason', `A reason of at most ${REQUEST_REASON_MAX} characters`);
  }
  await decide(params, 'refused', reason);
}
