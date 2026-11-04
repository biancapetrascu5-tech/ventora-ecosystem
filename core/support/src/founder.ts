import { InvalidInput, ResourceNotFound } from '@ventora/errors';
import { AuditActions, appendAuditEventInTx } from '@ventora/audit';
import { writeOutboxEvent } from '@ventora/db-kit';
import { SupportReplyPostedV1 } from '@ventora/contracts';
import { requireFounderSession } from '@ventora/identity';
import {
  checkAttachments,
  finishAttachmentUpload,
  startAttachmentUpload,
  type Uploader,
} from './attachments';
import { withFounderListTx, withFounderTx } from './db';
import { withFiles, type HubSupportThread } from './hub';
import {
  BODY_MAX,
  applyAction,
  fileIds,
  findRequest,
  insertMessage,
  readThread,
  ref as refOf,
  text,
  uuid,
  type SupportAttachment,
  type SupportRequestRow,
} from './model';
import type { SupportStatus, SupportUrgency } from './status';

/*
 * Lot 4.6 — Founder · Suport (FounderSupportInbox, D4-14 b). Every call needs the Founder session
 * with 2FA. The list across businesses goes through support.founder_list_requests (SECURITY
 * DEFINER, founder_runtime); a request and its thread are read and written as support_founder in
 * that business's context. Every write has its audit row in the same transaction; a reply also
 * writes support.reply.posted (outbox), which becomes „Răspuns nou” and e-mail E-7 in the Hub.
 */

export type FounderSupportGroup = 'open' | 'progress' | 'closed';

export interface FounderSupportListItem {
  id: string;
  organizationId: string;
  ref: string;
  applicationId: string;
  subject: string;
  urgency: SupportUrgency;
  status: SupportStatus;
  requesterName: string;
  assigneeName: string | null;
  lastMessageAt: Date;
  lastMessageBy: 'business' | 'team';
  lastMessageName: string;
  responseDueAt: Date | null;
  /** D4-15 = b: waiting for the team past the answer term. */
  overdue: boolean;
  createdAt: Date;
}

export interface FounderSupportCounts {
  open: number;
  progress: number;
  overdue: number;
}

const GROUPS = new Set<FounderSupportGroup>(['open', 'progress', 'closed']);

export async function listSupportRequestsForFounder(params: {
  founderHeaders: Headers;
  group: FounderSupportGroup;
  applicationId?: string | null;
  organizationId?: string | null;
  search?: string | null;
}): Promise<FounderSupportListItem[]> {
  await requireFounderSession(params.founderHeaders);
  if (!GROUPS.has(params.group)) throw new InvalidInput('group');
  const org = params.organizationId ? uuid('organizationId', params.organizationId) : null;
  const app = params.applicationId?.trim() || null;
  const search = (params.search ?? '').trim().slice(0, 200) || null;
  return withFounderListTx(async (client) => {
    const { rows } = await client.query<{
      id: string;
      organization_id: string;
      ref: string;
      application_id: string;
      subject: string;
      urgency: SupportUrgency;
      status: SupportStatus;
      requester_name: string;
      assignee_name: string | null;
      last_message_at: Date;
      last_message_by: 'business' | 'team';
      last_message_name: string;
      response_due_at: Date | null;
      created_at: Date;
    }>(
      `SELECT id::text, organization_id::text, ref, application_id, subject, urgency, status,
              requester_name, assignee_name, last_message_at, last_message_by, last_message_name,
              response_due_at, created_at
         FROM support.founder_list_requests($1, $2, $3::uuid, $4, 500)`,
      [params.group, app, org, search],
    );
    const now = Date.now();
    return rows.map((r) => ({
      id: r.id,
      organizationId: r.organization_id,
      ref: r.ref,
      applicationId: r.application_id,
      subject: r.subject,
      urgency: r.urgency,
      status: r.status,
      requesterName: r.requester_name,
      assigneeName: r.assignee_name,
      lastMessageAt: r.last_message_at,
      lastMessageBy: r.last_message_by,
      lastMessageName: r.last_message_name,
      responseDueAt: r.response_due_at,
      overdue: r.status === 'open' && !!r.response_due_at && r.response_due_at.getTime() <= now,
      createdAt: r.created_at,
    }));
  });
}

/** „Deschise · {n}”, „În lucru · {n}”, the Spine number and the overdue badge (S-6). */
export async function countSupportRequestsForFounder(params: {
  founderHeaders: Headers;
}): Promise<FounderSupportCounts> {
  await requireFounderSession(params.founderHeaders);
  return withFounderListTx(async (client) => {
    const { rows } = await client.query<{
      open_count: string;
      progress_count: string;
      overdue_count: string;
    }>(`SELECT open_count, progress_count, overdue_count FROM support.founder_request_counts()`);
    const r = rows[0];
    return {
      open: Number(r?.open_count ?? 0),
      progress: Number(r?.progress_count ?? 0),
      overdue: Number(r?.overdue_count ?? 0),
    };
  });
}

/** The business a reference belongs to (the address of the thread has only the reference). */
async function locate(ref: string): Promise<string> {
  const found = await withFounderListTx(async (client) => {
    for (const group of ['open', 'progress', 'closed'] as const) {
      const { rows } = await client.query<{ organization_id: string; ref: string }>(
        `SELECT organization_id::text, ref FROM support.founder_list_requests($1, NULL, NULL, $2, 500)`,
        [group, ref],
      );
      const hit = rows.find((r) => r.ref === ref);
      if (hit) return hit.organization_id;
    }
    return null;
  });
  if (!found) throw new ResourceNotFound('Request not found');
  return found;
}

const founderUploader = (organizationId: string, founderId: string): Uploader => ({
  organizationId,
  userId: founderId,
  connection: 'founder',
});

/** FounderSupportInbox · the thread: the request, the messages with attachments, the history. */
export async function getSupportThreadForFounder(params: {
  founderHeaders: Headers;
  ref: string;
}): Promise<HubSupportThread> {
  const founder = await requireFounderSession(params.founderHeaders);
  const wanted = refOf(params.ref);
  const organizationId = await locate(wanted);
  const { request, thread } = await withFounderTx(
    organizationId,
    async (client) => {
      const request = await findRequest(client, { ref: wanted });
      if (!request) throw new ResourceNotFound('Request not found');
      return { request, thread: await readThread(client, request) };
    },
    true,
  );
  return withFiles(founderUploader(organizationId, founder.userId), request, thread);
}

type TeamAction = 'reply' | 'reply_close' | 'mark_in_progress' | 'close';

async function teamAction(
  params: {
    founderHeaders: Headers;
    organizationId: string;
    requestId: string;
    body?: string;
    fileIds?: readonly string[];
  },
  kind: TeamAction,
): Promise<SupportRequestRow> {
  const founder = await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  const requestId = uuid('requestId', params.requestId);
  const replying = kind === 'reply' || kind === 'reply_close';
  const body = replying ? text('body', params.body, BODY_MAX) : null;
  const files = replying ? fileIds(params.fileIds) : [];
  if (files.length) {
    await checkAttachments(founderUploader(organizationId, founder.userId), requestId, files);
  }
  const author = { type: 'team' as const, id: founder.userId, name: founder.name };

  return withFounderTx(organizationId, async (client, exec) => {
    const request = await findRequest(client, { id: requestId }, true);
    if (!request) throw new ResourceNotFound('Request not found');
    const assignee = { founderId: founder.userId, name: founder.name };
    let messageId: string | null = null;
    let to: SupportStatus;
    if (replying) {
      // the reply first moves the status (awaiting_business: „Răspuns nou” in the Hub)…
      to = await applyAction(client, request, 'team_reply', author, { message: true, assignee });
      messageId = await insertMessage(client, request, author, body!, 'message', files);
      await writeOutboxEvent(client, 'support', SupportReplyPostedV1, {
        organizationId,
        sourceApp: SupportReplyPostedV1.sourceApp,
        resourceId: request.id,
        payload: { requestId: request.id, messageId },
      });
      // …„Trimite și închide” then closes it („Rezolvat” in the Hub)
      if (kind === 'reply_close') {
        const after = (await findRequest(client, { id: request.id }, true))!;
        to = await applyAction(client, after, 'team_close', author);
      }
    } else {
      to = await applyAction(
        client,
        request,
        kind === 'close' ? 'team_close' : 'team_mark_in_progress',
        author,
        kind === 'mark_in_progress' ? { assignee } : {},
      );
    }
    await appendAuditEventInTx(exec, {
      category: 'support',
      action: replying
        ? AuditActions.supportTeamReplied
        : kind === 'close'
          ? AuditActions.supportRequestClosed
          : AuditActions.supportRequestMarkedInProgress,
      outcome: 'success',
      actorType: 'founder',
      actorId: founder.userId,
      founderId: founder.userId,
      organizationId,
      targetType: 'support_request',
      targetId: request.id,
      metadata: {
        ref: request.ref,
        from: request.status,
        to,
        ...(messageId ? { messageId, attachments: files.length } : {}),
      },
    });
    return (await findRequest(client, { id: request.id }))!;
  });
}

/** „Trimite răspunsul” / „Trimite și închide”. */
export function replyAsTeam(params: {
  founderHeaders: Headers;
  organizationId: string;
  requestId: string;
  body: string;
  fileIds?: readonly string[];
  close?: boolean;
}): Promise<SupportRequestRow> {
  return teamAction(params, params.close ? 'reply_close' : 'reply');
}

/** „Marchează „În lucru”” (only a request that waits for the team). */
export function markSupportRequestInProgress(params: {
  founderHeaders: Headers;
  organizationId: string;
  requestId: string;
}): Promise<SupportRequestRow> {
  return teamAction(params, 'mark_in_progress');
}

/** „Închide solicitarea” („Rezolvat” in the Hub; the business can reopen it). */
export function closeSupportRequestAsTeam(params: {
  founderHeaders: Headers;
  organizationId: string;
  requestId: string;
}): Promise<SupportRequestRow> {
  return teamAction(params, 'close');
}

/** An attachment of the team's reply (files_founder, S-5 = b). */
export async function startTeamUpload(params: {
  founderHeaders: Headers;
  organizationId: string;
  requestId: string;
  file: { name: string; contentType: string; sizeBytes: number };
}): Promise<{ fileId: string; uploadUrl: string; expiresAt: Date }> {
  const founder = await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  const requestId = uuid('requestId', params.requestId);
  const exists = await withFounderTx(
    organizationId,
    (c) => findRequest(c, { id: requestId }),
    true,
  );
  if (!exists) throw new ResourceNotFound('Request not found');
  return startAttachmentUpload(
    founderUploader(organizationId, founder.userId),
    requestId,
    params.file,
  );
}

export async function finishTeamUpload(params: {
  founderHeaders: Headers;
  organizationId: string;
  fileId: string;
}): Promise<SupportAttachment> {
  const founder = await requireFounderSession(params.founderHeaders);
  return finishAttachmentUpload(
    founderUploader(uuid('organizationId', params.organizationId), founder.userId),
    uuid('fileId', params.fileId),
  );
}

/**
 * S-4 = a: the reference of a support session must be a request of the same business. True when
 * the business has a request with this reference (any status).
 */
export async function isSupportRequestRefOf(params: {
  founderHeaders: Headers;
  organizationId: string;
  ref: string;
}): Promise<boolean> {
  await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  const wanted = params.ref.trim();
  if (!/^VS-\d{4}-\d{4,}$/.test(wanted)) return false;
  return withFounderTx(
    organizationId,
    async (client) => !!(await findRequest(client, { ref: wanted })),
    true,
  );
}
