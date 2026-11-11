import type { PoolClient } from 'pg';
import type { TenantContext } from '@ventora/access';
import { AuditActions, appendAuditEventInTx, type AuditSqlExecutor } from '@ventora/audit';
import { uuidv7 } from '@ventora/db-kit';
import { Conflict, Forbidden, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { withCrmTx } from './db';
import type { ContactScope } from './contacts';
import {
  readSubject,
  requireMentionable,
  requireSubjectType,
  type Subject,
  type SubjectType,
} from './subjects';
import { requireId } from './validation';

/*
 * Lot CR.6 — the notes and the internal comments of a contact or a company (design S130
 * ClientDeskContact, „Un singur istoric”). Writing needs crm:write and a record the person sees
 * (D-CRM-15) that is not in the bin.
 *
 * - kind: note („Notiță”) or comment („Comentariu”, with @mentions).
 * - The text keeps its lines; 1–5 000 characters after trimming.
 * - Mentions: at most 20, only people who see the record (S130); checked on every write. Their
 *   notification waits for the templates of core/notifications (a Core PR, proposal).
 * - The author edits (edited_at shows „editat”); the author or crm:admin deletes, into the bin.
 * - The audit gets the ids, the kind and the number of mentions, never the text.
 */

export const NOTE_KINDS = ['note', 'comment'] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];
export const NOTE_LIMITS = { body: 5000, mentions: 20 } as const;

export type Note = {
  id: string;
  kind: NoteKind;
  subjectType: SubjectType;
  subjectId: string;
  body: string;
  mentions: string[];
  authorUserId: string;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
};

type NoteRow = {
  id: string;
  kind: NoteKind;
  subject_type: SubjectType;
  subject_id: string;
  body: string;
  mentions: string[];
  created_by_user_id: string;
  edited_at: Date | null;
  deleted_at: Date | null;
  created_at: Date;
};

export const NOTE_COLUMNS = `id, kind, subject_type, subject_id, body, mentions, created_by_user_id,
  edited_at, deleted_at, created_at`;

export function toNote(r: NoteRow): Note {
  return {
    id: r.id,
    kind: r.kind,
    subjectType: r.subject_type,
    subjectId: r.subject_id,
    body: r.body,
    mentions: r.mentions ?? [],
    authorUserId: r.created_by_user_id,
    editedAt: r.edited_at,
    deletedAt: r.deleted_at,
    createdAt: r.created_at,
  };
}

export type { NoteRow };

/** The text of a note: its lines kept, the ends trimmed, 1–5 000 characters. */
export function normalizeBody(value: unknown): string {
  if (typeof value !== 'string') throw new InvalidInput('body', 'required');
  const v = value.replace(/\r\n?/g, '\n').trim();
  if (v === '') throw new InvalidInput('body', 'required');
  if (v.length > NOTE_LIMITS.body) throw new InvalidInput('body', 'too_long');
  return v;
}

/** The people mentioned: distinct ids, at most 20. */
export function normalizeMentions(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new InvalidInput('mentions', 'invalid');
  const ids = [...new Set(value.map((v) => requireId('mentions', v)))];
  if (ids.length > NOTE_LIMITS.mentions) throw new InvalidInput('mentions', 'too_many');
  return ids;
}

function normalizeKind(value: unknown): NoteKind {
  if (value === undefined) return 'note';
  if ((NOTE_KINDS as readonly unknown[]).includes(value)) return value as NoteKind;
  throw new InvalidInput('kind', 'invalid');
}

function audit(
  exec: AuditSqlExecutor,
  ctx: TenantContext,
  action: string,
  note: { id: string; kind: NoteKind; subject_type: string; subject_id: string },
  mentionsCount: number,
) {
  return appendAuditEventInTx(exec, {
    category: 'crm',
    action,
    outcome: 'success',
    actorType: 'user',
    actorId: ctx.userId,
    organizationId: ctx.organizationId,
    targetType: 'crm_note',
    targetId: note.id,
    metadata: {
      kind: note.kind,
      subjectType: note.subject_type,
      subjectId: note.subject_id,
      mentionsCount,
    },
  });
}

async function readNote(client: PoolClient, id: string, lock = false): Promise<NoteRow> {
  const { rows } = await client.query<NoteRow>(
    `SELECT ${NOTE_COLUMNS} FROM crm.note WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
  if (!rows[0]) throw new ResourceNotFound();
  return rows[0];
}

/** The subject of a note, as the caller sees it (read-only transaction). */
async function subjectOf(
  ctx: TenantContext,
  scope: ContactScope,
  type: SubjectType,
  id: unknown,
): Promise<Subject> {
  return withCrmTx(
    ctx.organizationId,
    (client) => readSubject(client, ctx, scope, type, id, { write: true }),
    true,
  );
}

// ── write ──────────────────────────────────────────────────────────────────────────────────────

export async function createNoteInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  input: {
    subjectType?: unknown;
    subjectId?: unknown;
    kind?: unknown;
    body?: unknown;
    mentions?: unknown;
  },
): Promise<Note> {
  const type = requireSubjectType(input.subjectType);
  const kind = normalizeKind(input.kind);
  const body = normalizeBody(input.body);
  const mentions = normalizeMentions(input.mentions);
  // the mentions are checked against the record as it is now (other pools: before the write)
  const subject = await subjectOf(ctx, scope, type, input.subjectId);
  await requireMentionable(ctx, subject, mentions);

  return withCrmTx(ctx.organizationId, async (client, exec) => {
    // the record again, in the write: it may have gone to the bin or changed owner meanwhile
    const now = await readSubject(client, ctx, scope, type, subject.id, { write: true });
    if (now.ownerUserId !== subject.ownerUserId) throw new Conflict('subject_changed');
    const { rows } = await client.query<NoteRow>(
      `INSERT INTO crm.note (id, organization_id, kind, subject_type, subject_id, body, mentions, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7::uuid[], $8)
       RETURNING ${NOTE_COLUMNS}`,
      [uuidv7(), ctx.organizationId, kind, type, subject.id, body, mentions, ctx.userId],
    );
    const row = rows[0]!;
    await audit(exec, ctx, AuditActions.crmNoteCreated, row, mentions.length);
    return toNote(row);
  });
}

/** The author changes the text and the mentions; „editat” from now on. */
export async function updateNoteInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  noteId: string,
  input: { body?: unknown; mentions?: unknown },
): Promise<Note> {
  const id = requireId('noteId', noteId);
  const body = input.body === undefined ? undefined : normalizeBody(input.body);
  const mentions = input.mentions === undefined ? undefined : normalizeMentions(input.mentions);
  if (body === undefined && mentions === undefined) throw new InvalidInput('body', 'required');

  const current = await withCrmTx(ctx.organizationId, (client) => readNote(client, id), true);
  if (current.created_by_user_id !== ctx.userId) throw new Forbidden();
  if (current.deleted_at) throw new Conflict('note_deleted');
  const subject = await subjectOf(ctx, scope, current.subject_type, current.subject_id);
  if (mentions) await requireMentionable(ctx, subject, mentions);

  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const row = await readNote(client, id, true);
    if (row.deleted_at) throw new Conflict('note_deleted');
    // a merge (CR.5) may have moved it meanwhile: the record it now belongs to must be visible too
    const now = await readSubject(client, ctx, scope, row.subject_type, row.subject_id, {
      write: true,
    });
    if (mentions && now.ownerUserId !== subject.ownerUserId) throw new Conflict('subject_changed');
    const { rows } = await client.query<NoteRow>(
      `UPDATE crm.note
          SET body = COALESCE($2, body), mentions = COALESCE($3::uuid[], mentions), edited_at = now()
        WHERE id = $1
        RETURNING ${NOTE_COLUMNS}`,
      [id, body ?? null, mentions ?? null],
    );
    const updated = rows[0]!;
    await audit(exec, ctx, AuditActions.crmNoteUpdated, updated, updated.mentions.length);
    return toNote(updated);
  });
}

/** „Șterge”: the author or crm:admin; into the bin, never a physical delete. */
export async function deleteNoteInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  noteId: string,
): Promise<Note> {
  const id = requireId('noteId', noteId);
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const row = await readNote(client, id, true);
    // the record must be visible (a member never reaches a note of a contact they do not see)
    await readSubject(client, ctx, scope, row.subject_type, row.subject_id);
    if (row.created_by_user_id !== ctx.userId && scope !== 'all') throw new Forbidden();
    if (row.deleted_at) return toNote(row);
    const { rows } = await client.query<NoteRow>(
      `UPDATE crm.note SET deleted_at = now(), deleted_by_user_id = $2 WHERE id = $1
       RETURNING ${NOTE_COLUMNS}`,
      [id, ctx.userId],
    );
    const deleted = rows[0]!;
    await audit(exec, ctx, AuditActions.crmNoteDeleted, deleted, deleted.mentions.length);
    return toNote(deleted);
  });
}

/** „Mențiunile mele”: the notes that mention the caller, on records they see, newest first. */
export async function listMyMentionsInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  params: { limit: number; offset: number },
): Promise<Note[]> {
  return withCrmTx(
    ctx.organizationId,
    async (client) => {
      const { rows } = await client.query<NoteRow>(
        `SELECT n.id, n.kind, n.subject_type, n.subject_id, n.body, n.mentions, n.created_by_user_id,
                n.edited_at, n.deleted_at, n.created_at
           FROM crm.note n
           LEFT JOIN crm.contact c ON n.subject_type = 'contact' AND c.id = n.subject_id
          WHERE $1::uuid = ANY(n.mentions) AND n.deleted_at IS NULL
            AND (n.subject_type <> 'contact'
                 OR (c.deleted_at IS NULL
                     AND ($2 OR c.owner_user_id IS NULL OR c.owner_user_id = $1::uuid)))
          ORDER BY n.created_at DESC, n.id DESC
          LIMIT $3 OFFSET $4`,
        [ctx.userId, scope === 'all', params.limit, params.offset],
      );
      return rows.map(toNote);
    },
    true,
  );
}
