import type { PoolClient } from 'pg';
import { InvalidInput } from '@ventora/errors';
import { uuidv7 } from '@ventora/db-kit';
import {
  BODY_MAX,
  SUBJECT_MAX,
  SUPPORT_URGENCIES,
  eventKindOf,
  hubStatus,
  founderStatus,
  nextStatus,
  type FounderStatus,
  type HubStatus,
  type SupportAction,
  type SupportEventKind,
  type SupportStatus,
  type SupportUrgency,
} from './status';

export { SUPPORT_APPLICATIONS, isSupportApplication, supportApplicationFor } from './apps';
export type { SupportApplication } from './apps';

/*
 * Lot 4.6 — what the Hub and Founder share: the rows, the validation, the thread, one status
 * change (the request, its history row and the last message, in the caller's transaction).
 */

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const REF_RE = /^VS-\d{4}-\d{4,}$/;

/** Attachments on one message (PROPUS: the design draws up to 2; 10 keeps the thread readable). */
export const ATTACHMENTS_PER_MESSAGE_MAX = 10;

export function uuid(field: string, value: unknown): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) throw new InvalidInput(field);
  return value;
}

export function ref(value: unknown): string {
  if (typeof value !== 'string' || !REF_RE.test(value)) throw new InvalidInput('ref');
  return value;
}

export function text(field: string, value: unknown, max: number): string {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v || v.length > max) throw new InvalidInput(field);
  return v;
}

export function fileIds(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > ATTACHMENTS_PER_MESSAGE_MAX) {
    throw new InvalidInput('fileIds');
  }
  const ids = value.map((v) => uuid('fileIds', v));
  if (new Set(ids).size !== ids.length) throw new InvalidInput('fileIds');
  return ids;
}

export function urgency(value: unknown): SupportUrgency {
  if (!(SUPPORT_URGENCIES as readonly unknown[]).includes(value)) throw new InvalidInput('urgency');
  return value as SupportUrgency;
}

export { BODY_MAX, SUBJECT_MAX };

export interface SupportRequestRow {
  id: string;
  organizationId: string;
  ref: string;
  applicationId: string;
  requesterUserId: string;
  requesterName: string;
  subject: string;
  description: string;
  urgency: SupportUrgency;
  status: SupportStatus;
  hubStatus: HubStatus;
  founderStatus: FounderStatus;
  assigneeFounderId: string | null;
  assigneeName: string | null;
  responseDueAt: Date | null;
  autoCloseAt: Date | null;
  lastMessageAt: Date;
  lastMessageBy: 'business' | 'team';
  lastMessageName: string;
  closedAt: Date | null;
  closedByType: 'team' | 'system' | null;
  createdAt: Date;
}

export interface SupportAttachment {
  fileId: string;
  name: string;
  sizeBytes: number;
  contentType: string;
}

export interface SupportMessage {
  id: string;
  authorType: 'business' | 'team';
  authorId: string;
  authorName: string;
  body: string;
  kind: 'message' | 'reopen';
  createdAt: Date;
  attachments: SupportAttachment[];
}

export interface SupportHistoryItem {
  kind: SupportEventKind;
  actorType: 'business' | 'team' | 'system';
  actorId: string | null;
  actorName: string | null;
  createdAt: Date;
}

export interface SupportThread {
  request: SupportRequestRow;
  /** Oldest first (HubSupportThread). */
  messages: SupportMessage[];
  /** Newest first („Istoricul stării”). */
  history: SupportHistoryItem[];
}

const REQUEST_COLUMNS = `id::text, organization_id::text, ref, application_id, requester_user_id::text,
  requester_name, subject, description, urgency, status, assignee_founder_id::text, assignee_name,
  response_due_at, auto_close_at, last_message_at, last_message_by, last_message_name, closed_at,
  closed_by_type, created_at`;

type RequestDbRow = {
  id: string;
  organization_id: string;
  ref: string;
  application_id: string;
  requester_user_id: string;
  requester_name: string;
  subject: string;
  description: string;
  urgency: SupportUrgency;
  status: SupportStatus;
  assignee_founder_id: string | null;
  assignee_name: string | null;
  response_due_at: Date | null;
  auto_close_at: Date | null;
  last_message_at: Date;
  last_message_by: 'business' | 'team';
  last_message_name: string;
  closed_at: Date | null;
  closed_by_type: 'team' | 'system' | null;
  created_at: Date;
};

export function toRequest(r: RequestDbRow): SupportRequestRow {
  return {
    id: r.id,
    organizationId: r.organization_id,
    ref: r.ref,
    applicationId: r.application_id,
    requesterUserId: r.requester_user_id,
    requesterName: r.requester_name,
    subject: r.subject,
    description: r.description,
    urgency: r.urgency,
    status: r.status,
    hubStatus: hubStatus(r.status),
    founderStatus: founderStatus(r.status),
    assigneeFounderId: r.assignee_founder_id,
    assigneeName: r.assignee_name,
    responseDueAt: r.response_due_at,
    autoCloseAt: r.auto_close_at,
    lastMessageAt: r.last_message_at,
    lastMessageBy: r.last_message_by,
    lastMessageName: r.last_message_name,
    closedAt: r.closed_at,
    closedByType: r.closed_by_type,
    createdAt: r.created_at,
  };
}

/** The request of the organization in context (RLS), by reference or id; FOR UPDATE to write. */
export async function findRequest(
  client: PoolClient,
  by: { ref: string } | { id: string },
  lock = false,
): Promise<SupportRequestRow | null> {
  const where = 'ref' in by ? 'ref = $1' : 'id = $1::uuid';
  const value = 'ref' in by ? by.ref : by.id;
  const { rows } = await client.query<RequestDbRow>(
    `SELECT ${REQUEST_COLUMNS} FROM support.support_request WHERE ${where}${lock ? ' FOR UPDATE' : ''}`,
    [value],
  );
  return rows[0] ? toRequest(rows[0]) : null;
}

export async function listRequests(
  client: PoolClient,
  filter: { requesterUserId?: string },
): Promise<SupportRequestRow[]> {
  const { rows } = await client.query<RequestDbRow>(
    `SELECT ${REQUEST_COLUMNS} FROM support.support_request
      WHERE ($1::uuid IS NULL OR requester_user_id = $1::uuid)
      ORDER BY last_message_at DESC, id
      LIMIT 200`,
    [filter.requesterUserId ?? null],
  );
  return rows.map(toRequest);
}

/** The thread and the history of a request, without the attachments' metadata (files). */
export async function readThread(
  client: PoolClient,
  request: SupportRequestRow,
): Promise<{
  messages: Omit<SupportMessage, 'attachments'>[];
  fileIds: Map<string, string[]>;
  history: SupportHistoryItem[];
}> {
  const messages = await client.query<{
    id: string;
    author_type: 'business' | 'team';
    author_id: string;
    author_name: string;
    body: string;
    kind: 'message' | 'reopen';
    created_at: Date;
  }>(
    `SELECT id::text, author_type, author_id::text, author_name, body, kind, created_at
       FROM support.support_message WHERE request_id = $1::uuid
      ORDER BY created_at, id`,
    [request.id],
  );
  const attachments = await client.query<{ message_id: string; file_id: string }>(
    `SELECT message_id::text, file_id::text FROM support.support_attachment
      WHERE request_id = $1::uuid ORDER BY created_at, file_id`,
    [request.id],
  );
  const history = await client.query<{
    kind: SupportEventKind;
    actor_type: 'business' | 'team' | 'system';
    actor_id: string | null;
    actor_name: string | null;
    created_at: Date;
  }>(
    `SELECT kind, actor_type, actor_id::text, actor_name, created_at
       FROM support.support_status_event WHERE request_id = $1::uuid
      ORDER BY created_at DESC, id DESC`,
    [request.id],
  );
  const byMessage = new Map<string, string[]>();
  for (const a of attachments.rows) {
    byMessage.set(a.message_id, [...(byMessage.get(a.message_id) ?? []), a.file_id]);
  }
  return {
    messages: messages.rows.map((m) => ({
      id: m.id,
      authorType: m.author_type,
      authorId: m.author_id,
      authorName: m.author_name,
      body: m.body,
      kind: m.kind,
      createdAt: m.created_at,
    })),
    fileIds: byMessage,
    history: history.rows.map((h) => ({
      kind: h.kind,
      actorType: h.actor_type,
      actorId: h.actor_id,
      actorName: h.actor_name,
      createdAt: h.created_at,
    })),
  };
}

export interface Author {
  type: 'business' | 'team';
  id: string;
  name: string;
}

/** A message of the thread and its attachments (already checked by the caller). */
export async function insertMessage(
  client: PoolClient,
  request: SupportRequestRow,
  author: Author,
  body: string,
  kind: 'message' | 'reopen',
  attachmentIds: readonly string[],
): Promise<string> {
  const id = uuidv7();
  await client.query(
    `INSERT INTO support.support_message
       (id, organization_id, request_id, author_type, author_id, author_name, body, kind)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      request.organizationId,
      request.id,
      author.type,
      author.id,
      author.name.slice(0, 255),
      body,
      kind,
    ],
  );
  for (const fileId of attachmentIds) {
    await client.query(
      `INSERT INTO support.support_attachment (message_id, file_id, organization_id, request_id)
       VALUES ($1, $2, $3, $4)`,
      [id, fileId, request.organizationId, request.id],
    );
  }
  return id;
}

/**
 * One action on a request: the new status (nextStatus, the same rules as the trigger), the
 * history row when the status changes, the last message when there is one. Returns the new status.
 */
export async function applyAction(
  client: PoolClient,
  request: SupportRequestRow,
  action: SupportAction,
  actor: { type: 'business' | 'team' | 'system'; id: string | null; name: string | null },
  options: { message?: boolean; assignee?: { founderId: string; name: string } } = {},
): Promise<SupportStatus> {
  const to = nextStatus(request.status, action);
  const closedBy = to === 'closed' ? (actor.type === 'system' ? 'system' : 'team') : null;
  const sets: string[] = ['status = $2'];
  const params: unknown[] = [request.id, to];
  if (to === 'closed' && request.status !== 'closed') {
    params.push(closedBy);
    sets.push(`closed_by_type = $${params.length}`);
  }
  if (options.message && actor.type !== 'system') {
    params.push(actor.type, (actor.name ?? '').slice(0, 255));
    sets.push(
      `last_message_at = now()`,
      `last_message_by = $${params.length - 1}`,
      `last_message_name = $${params.length}`,
    );
  }
  // D4-13 = a: the first team member who takes it becomes the assignee (internal, Founder only)
  if (options.assignee && !request.assigneeFounderId) {
    params.push(options.assignee.founderId, options.assignee.name.slice(0, 255));
    sets.push(
      `assignee_founder_id = $${params.length - 1}::uuid`,
      `assignee_name = $${params.length}`,
    );
  }
  await client.query(
    `UPDATE support.support_request SET ${sets.join(', ')} WHERE id = $1::uuid`,
    params,
  );
  const kind = eventKindOf(action, request.status, to);
  if (kind) await insertEvent(client, request, kind, request.status, to, actor);
  return to;
}

export async function insertEvent(
  client: PoolClient,
  request: Pick<SupportRequestRow, 'id' | 'organizationId'>,
  kind: SupportEventKind,
  from: SupportStatus | null,
  to: SupportStatus,
  actor: { type: 'business' | 'team' | 'system'; id: string | null; name: string | null },
): Promise<void> {
  await client.query(
    `INSERT INTO support.support_status_event
       (id, organization_id, request_id, kind, status_from, status_to, actor_type, actor_id, actor_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      uuidv7(),
      request.organizationId,
      request.id,
      kind,
      from,
      to,
      actor.type,
      actor.type === 'system' ? null : actor.id,
      actor.type === 'system' ? null : (actor.name ?? '').slice(0, 255),
    ],
  );
}
