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
import { isUuid, page, requireId, requiredText } from './validation';

/*
 * Lot CR.7 — the activities of ClientDesk (design S131 ClientDeskActivities): tasks („Next
 * Action”), logged calls, meetings and e-mails, reminders. Writing needs crm:write.
 *
 * - The record (contact / company; lead / deal from CR.8 / CR.9) is optional: a task may stand
 *   alone. With a record, it must be visible to the person and not in the bin (D-CRM-15).
 * - The owner („Responsabil”) is the creator by default; any member who sees the record may get it
 *   (S131 „atribuirea către membri”); the notification waits for core/notifications templates.
 * - Who sees an activity: crm:admin all; otherwise its owner, its creator, and everyone who sees
 *   its record.
 * - Who changes, ticks or deletes it: its owner, its creator or crm:admin. Deleted = the bin.
 * - The due day (due_on) and, optionally, the time (due_at); only timed activities show in the
 *   calendar. A reminder (at the time, 15 minutes, an hour or a day before) needs the time; the
 *   reminders job sends it once the templates exist (proposal); remind_at is ready for it.
 * - Overdue tasks stay overdue until ticked or moved, never closed automatically (S131).
 * - Calls, meetings and e-mails are logged as done unless `done: false` (a planned call).
 * - The audit gets the ids, the kind and the changed field names, never the texts.
 */

export const ACTIVITY_KINDS = ['task', 'call', 'meeting', 'email', 'reminder'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export const PRIORITIES = ['low', 'normal', 'high'] as const;
export type Priority = (typeof PRIORITIES)[number];
export const CALL_RESULTS = ['answered', 'no_answer', 'voicemail', 'wrong_number'] as const;
export type CallResult = (typeof CALL_RESULTS)[number];
export const MEETING_PLACES = ['client', 'salon', 'online', 'phone'] as const;
export type MeetingPlace = (typeof MEETING_PLACES)[number];
export const REMIND_BEFORE = [0, 15, 60, 1440] as const;
export const ACTIVITY_LIMITS = { title: 200, note: 2000, outcome: 500, participants: 20 } as const;

export type Activity = {
  id: string;
  kind: ActivityKind;
  title: string;
  note: string | null;
  priority: Priority;
  subjectType: SubjectType | null;
  subjectId: string | null;
  ownerUserId: string;
  /** YYYY-MM-DD */
  dueOn: string | null;
  dueAt: Date | null;
  durationMinutes: number | null;
  remindBeforeMinutes: number | null;
  remindAt: Date | null;
  callResult: CallResult | null;
  meetingPlace: MeetingPlace | null;
  participantUserIds: string[];
  outcome: string | null;
  status: 'open' | 'done';
  doneAt: Date | null;
  doneByUserId: string | null;
  createdByUserId: string;
  deletedAt: Date | null;
  createdAt: Date;
};

export type ActivityRow = {
  id: string;
  kind: ActivityKind;
  title: string;
  note: string | null;
  priority: Priority;
  subject_type: SubjectType | null;
  subject_id: string | null;
  owner_user_id: string;
  due_on: string | null;
  due_at: Date | null;
  duration_minutes: number | null;
  remind_before_minutes: number | null;
  remind_at: Date | null;
  call_result: CallResult | null;
  meeting_place: MeetingPlace | null;
  participant_user_ids: string[];
  outcome: string | null;
  status: 'open' | 'done';
  done_at: Date | null;
  done_by_user_id: string | null;
  created_by_user_id: string;
  deleted_at: Date | null;
  created_at: Date;
};

const FIELDS = [
  'id',
  'kind',
  'title',
  'note',
  'priority',
  'subject_type',
  'subject_id',
  'owner_user_id',
  "to_char(due_on, 'YYYY-MM-DD') AS due_on",
  'due_at',
  'duration_minutes',
  'remind_before_minutes',
  'remind_at',
  'call_result',
  'meeting_place',
  'participant_user_ids',
  'outcome',
  'status',
  'done_at',
  'done_by_user_id',
  'created_by_user_id',
  'deleted_at',
  'created_at',
];
export const ACTIVITY_COLUMNS = FIELDS.join(', ');
const PREFIXED = FIELDS.map((f) =>
  f.startsWith('to_char') ? f.replace('due_on,', 'a.due_on,') : `a.${f}`,
).join(', ');

export function toActivity(r: ActivityRow): Activity {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    note: r.note,
    priority: r.priority,
    subjectType: r.subject_type,
    subjectId: r.subject_id,
    ownerUserId: r.owner_user_id,
    dueOn: r.due_on,
    dueAt: r.due_at,
    durationMinutes: r.duration_minutes,
    remindBeforeMinutes: r.remind_before_minutes,
    remindAt: r.remind_at,
    callResult: r.call_result,
    meetingPlace: r.meeting_place,
    participantUserIds: r.participant_user_ids ?? [],
    outcome: r.outcome,
    status: r.status,
    doneAt: r.done_at,
    doneByUserId: r.done_by_user_id,
    createdByUserId: r.created_by_user_id,
    deletedAt: r.deleted_at,
    createdAt: r.created_at,
  };
}

// ── validation ─────────────────────────────────────────────────────────────────────────────────

function oneOf<T extends string | number>(
  field: string,
  allowed: readonly T[],
  value: unknown,
): T | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if ((allowed as readonly unknown[]).includes(value)) return value as T;
  throw new InvalidInput(field, 'invalid');
}

/** A text that keeps its lines; '' and null clear it. */
function multiline(field: string, value: unknown, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw new InvalidInput(field, 'invalid');
  const v = value.replace(/\r\n?/g, '\n').trim();
  if (v === '') return null;
  if (v.length > max) throw new InvalidInput(field, 'too_long');
  return v;
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function normalizeDay(field: string, value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const m = typeof value === 'string' ? DAY_RE.exec(value) : null;
  if (!m) throw new InvalidInput(field, 'invalid');
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) {
    throw new InvalidInput(field, 'invalid');
  }
  return value as string;
}

function normalizeTime(field: string, value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const d = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) throw new InvalidInput(field, 'invalid');
  return d;
}

function normalizeDuration(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 1440) {
    throw new InvalidInput('durationMinutes', 'invalid');
  }
  return value as number;
}

function normalizeParticipants(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (value === null) return [];
  if (!Array.isArray(value)) throw new InvalidInput('participantUserIds', 'invalid');
  const ids = [...new Set(value.map((v) => requireId('participantUserIds', v)))];
  if (ids.length > ACTIVITY_LIMITS.participants) {
    throw new InvalidInput('participantUserIds', 'too_many');
  }
  return ids;
}

export type ActivityInput = {
  title?: unknown;
  note?: unknown;
  priority?: unknown;
  ownerUserId?: unknown;
  dueOn?: unknown;
  dueAt?: unknown;
  durationMinutes?: unknown;
  remindBeforeMinutes?: unknown;
  callResult?: unknown;
  meetingPlace?: unknown;
  participantUserIds?: unknown;
  outcome?: unknown;
};

type State = {
  title: string;
  note: string | null;
  priority: Priority;
  ownerUserId: string;
  dueOn: string | null;
  dueAt: Date | null;
  durationMinutes: number | null;
  remindBeforeMinutes: number | null;
  callResult: CallResult | null;
  meetingPlace: MeetingPlace | null;
  participantUserIds: string[];
  outcome: string | null;
};

/** The patch over the current state, checked as a whole (kind-specific fields, the reminder). */
function merge(kind: ActivityKind, base: State, input: ActivityInput): State {
  const pick = <T>(v: T | undefined, current: T): T => (v === undefined ? current : v);
  const next: State = {
    title:
      input.title === undefined
        ? base.title
        : requiredText('title', input.title, ACTIVITY_LIMITS.title),
    note: pick(multiline('note', input.note, ACTIVITY_LIMITS.note), base.note),
    priority: pick(oneOf('priority', PRIORITIES, input.priority), base.priority) ?? 'normal',
    ownerUserId:
      input.ownerUserId === undefined
        ? base.ownerUserId
        : requireId('ownerUserId', input.ownerUserId),
    dueOn: pick(normalizeDay('dueOn', input.dueOn), base.dueOn),
    dueAt: pick(normalizeTime('dueAt', input.dueAt), base.dueAt),
    durationMinutes: pick(normalizeDuration(input.durationMinutes), base.durationMinutes),
    remindBeforeMinutes: pick(
      oneOf('remindBeforeMinutes', REMIND_BEFORE, input.remindBeforeMinutes),
      base.remindBeforeMinutes,
    ),
    callResult: pick(oneOf('callResult', CALL_RESULTS, input.callResult), base.callResult),
    meetingPlace: pick(
      oneOf('meetingPlace', MEETING_PLACES, input.meetingPlace),
      base.meetingPlace,
    ),
    participantUserIds: pick(
      normalizeParticipants(input.participantUserIds),
      base.participantUserIds,
    ),
    outcome: pick(multiline('outcome', input.outcome, ACTIVITY_LIMITS.outcome), base.outcome),
  };
  if (next.dueAt && !next.dueOn) throw new InvalidInput('dueOn', 'required');
  // the time removed: the reminder goes with it
  if (!next.dueAt && input.dueAt === null) next.remindBeforeMinutes = null;
  if (next.remindBeforeMinutes !== null && !next.dueAt) {
    throw new InvalidInput('remindBeforeMinutes', 'needs_time');
  }
  if (next.callResult && kind !== 'call') throw new InvalidInput('callResult', 'invalid');
  if (next.meetingPlace && kind !== 'meeting') throw new InvalidInput('meetingPlace', 'invalid');
  if (next.participantUserIds.length && kind !== 'meeting') {
    throw new InvalidInput('participantUserIds', 'invalid');
  }
  return next;
}

const remindAt = (s: State) =>
  s.dueAt && s.remindBeforeMinutes !== null
    ? new Date(s.dueAt.getTime() - s.remindBeforeMinutes * 60_000)
    : null;

function stateOf(r: ActivityRow): State {
  return {
    title: r.title,
    note: r.note,
    priority: r.priority,
    ownerUserId: r.owner_user_id,
    dueOn: r.due_on,
    dueAt: r.due_at,
    durationMinutes: r.duration_minutes,
    remindBeforeMinutes: r.remind_before_minutes,
    callResult: r.call_result,
    meetingPlace: r.meeting_place,
    participantUserIds: r.participant_user_ids ?? [],
    outcome: r.outcome,
  };
}

// ── access ─────────────────────────────────────────────────────────────────────────────────────

function audit(
  exec: AuditSqlExecutor,
  ctx: TenantContext,
  row: ActivityRow,
  verb: 'created' | 'updated' | 'completed' | 'deleted',
  fields: string[] = [],
) {
  const task = row.kind === 'task';
  const action = task
    ? {
        created: AuditActions.crmTaskCreated,
        updated: AuditActions.crmTaskUpdated,
        completed: AuditActions.crmTaskCompleted,
        deleted: AuditActions.crmTaskDeleted,
      }[verb]
    : {
        created: AuditActions.crmActivityCreated,
        updated: AuditActions.crmActivityUpdated,
        completed: AuditActions.crmActivityUpdated,
        deleted: AuditActions.crmActivityDeleted,
      }[verb];
  return appendAuditEventInTx(exec, {
    category: 'crm',
    action,
    outcome: 'success',
    actorType: 'user',
    actorId: ctx.userId,
    organizationId: ctx.organizationId,
    targetType: task ? 'crm_task' : 'crm_activity',
    targetId: row.id,
    metadata: {
      kind: row.kind,
      subjectType: row.subject_type,
      subjectId: row.subject_id,
      ownerUserId: row.owner_user_id,
      status: row.status,
      ...(fields.length ? { fields } : {}),
    },
  });
}

async function readActivity(client: PoolClient, id: string, lock = false): Promise<ActivityRow> {
  const { rows } = await client.query<ActivityRow>(
    `SELECT ${ACTIVITY_COLUMNS} FROM crm.activity WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
  if (!rows[0]) throw new ResourceNotFound();
  return rows[0];
}

/** Its owner, its creator, crm:admin, or someone who sees its record. Returns its record. */
async function requireVisible(
  client: PoolClient,
  ctx: TenantContext,
  scope: ContactScope,
  row: ActivityRow,
): Promise<Subject | null> {
  const mine = row.owner_user_id === ctx.userId || row.created_by_user_id === ctx.userId;
  if (!row.subject_type || !row.subject_id) {
    if (scope !== 'all' && !mine) throw new Forbidden();
    return null;
  }
  try {
    return await readSubject(client, ctx, scope, row.subject_type, row.subject_id);
  } catch (err) {
    if (err instanceof Forbidden && mine) {
      return readSubject(client, ctx, 'all', row.subject_type, row.subject_id);
    }
    throw err;
  }
}

function requireChanger(ctx: TenantContext, scope: ContactScope, row: ActivityRow) {
  if (scope === 'all') return;
  if (row.owner_user_id === ctx.userId || row.created_by_user_id === ctx.userId) return;
  throw new Forbidden();
}

/** The owner and the participants must see the record (or be members, without one). */
async function requirePeople(
  ctx: TenantContext,
  subject: Subject | null,
  next: State,
  before?: State,
) {
  if (next.ownerUserId !== ctx.userId && next.ownerUserId !== before?.ownerUserId) {
    await requireMentionable(ctx, subject, [next.ownerUserId], 'ownerUserId');
  }
  const added = next.participantUserIds.filter((id) => !before?.participantUserIds.includes(id));
  await requireMentionable(ctx, subject, added, 'participantUserIds');
}

// ── write ──────────────────────────────────────────────────────────────────────────────────────

export async function createActivityInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  input: ActivityInput & {
    kind?: unknown;
    subjectType?: unknown;
    subjectId?: unknown;
    done?: unknown;
  },
): Promise<Activity> {
  const kind = oneOf('kind', ACTIVITY_KINDS, input.kind);
  if (!kind) throw new InvalidInput('kind', 'required');
  if (input.title === undefined) throw new InvalidInput('title', 'required');
  const empty: State = {
    title: '',
    note: null,
    priority: 'normal',
    ownerUserId: ctx.userId,
    dueOn: null,
    dueAt: null,
    durationMinutes: null,
    remindBeforeMinutes: null,
    callResult: null,
    meetingPlace: null,
    participantUserIds: [],
    outcome: null,
  };
  const state = merge(kind, empty, input);
  if (input.done !== undefined && typeof input.done !== 'boolean') {
    throw new InvalidInput('done', 'invalid');
  }
  const done = (input.done as boolean | undefined) ?? ['call', 'meeting', 'email'].includes(kind);
  const hasSubject = input.subjectType !== undefined && input.subjectType !== null;
  const type = hasSubject ? requireSubjectType(input.subjectType) : null;
  if (!hasSubject && input.subjectId !== undefined && input.subjectId !== null) {
    throw new InvalidInput('subjectType', 'required');
  }
  const subject = type
    ? await withCrmTx(
        ctx.organizationId,
        (client) => readSubject(client, ctx, scope, type, input.subjectId, { write: true }),
        true,
      )
    : null;
  await requirePeople(ctx, subject, state);

  return withCrmTx(ctx.organizationId, async (client, exec) => {
    if (subject) {
      const now = await readSubject(client, ctx, scope, subject.type, subject.id, { write: true });
      if (now.ownerUserId !== subject.ownerUserId) throw new Conflict('subject_changed');
    }
    const { rows } = await client.query<ActivityRow>(
      `INSERT INTO crm.activity
         (id, organization_id, kind, title, note, priority, subject_type, subject_id, owner_user_id,
          due_on, due_at, duration_minutes, remind_before_minutes, remind_at, call_result,
          meeting_place, participant_user_ids, outcome, status, done_at, done_by_user_id,
          created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, $11, $12, $13, $14, $15, $16,
               $17::uuid[], $18, $19, CASE WHEN $19 = 'done' THEN now() END,
               CASE WHEN $19 = 'done' THEN $20::uuid END, $20)
       RETURNING ${ACTIVITY_COLUMNS}`,
      [
        uuidv7(),
        ctx.organizationId,
        kind,
        state.title,
        state.note,
        state.priority,
        subject?.type ?? null,
        subject?.id ?? null,
        state.ownerUserId,
        state.dueOn,
        state.dueAt,
        state.durationMinutes,
        state.remindBeforeMinutes,
        remindAt(state),
        state.callResult,
        state.meetingPlace,
        state.participantUserIds,
        state.outcome,
        done ? 'done' : 'open',
        ctx.userId,
      ],
    );
    const row = rows[0]!;
    await audit(exec, ctx, row, 'created');
    return toActivity(row);
  });
}

const COLUMN_OF: Record<keyof State, string> = {
  title: 'title',
  note: 'note',
  priority: 'priority',
  ownerUserId: 'owner_user_id',
  dueOn: 'due_on',
  dueAt: 'due_at',
  durationMinutes: 'duration_minutes',
  remindBeforeMinutes: 'remind_before_minutes',
  callResult: 'call_result',
  meetingPlace: 'meeting_place',
  participantUserIds: 'participant_user_ids',
  outcome: 'outcome',
};

function changed(a: State, b: State): (keyof State)[] {
  const same = (x: unknown, y: unknown) =>
    x instanceof Date && y instanceof Date
      ? x.getTime() === y.getTime()
      : JSON.stringify(x) === JSON.stringify(y);
  return (Object.keys(COLUMN_OF) as (keyof State)[]).filter((k) => !same(a[k], b[k]));
}

/** „Editează” / moving the due date: the owner, the creator or crm:admin. */
export async function updateActivityInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  activityId: string,
  input: ActivityInput,
): Promise<Activity> {
  const id = requireId('activityId', activityId);
  const { current, subject } = await withCrmTx(
    ctx.organizationId,
    async (client) => {
      const row = await readActivity(client, id);
      const subj = await requireVisible(client, ctx, scope, row);
      return { current: row, subject: subj };
    },
    true,
  );
  requireChanger(ctx, scope, current);
  if (current.deleted_at) throw new Conflict('activity_deleted');
  const before = stateOf(current);
  const next = merge(current.kind, before, input);
  await requirePeople(ctx, subject, next, before);

  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const row = await readActivity(client, id, true);
    if (row.deleted_at) throw new Conflict('activity_deleted');
    const base = stateOf(row);
    const fields = changed(base, next);
    if (!fields.length) return toActivity(row);
    const reminderMoved =
      (remindAt(base)?.getTime() ?? null) !== (remindAt(next)?.getTime() ?? null);
    const { rows } = await client.query<ActivityRow>(
      `UPDATE crm.activity
          SET title = $2, note = $3, priority = $4, owner_user_id = $5, due_on = $6::date,
              due_at = $7, duration_minutes = $8, remind_before_minutes = $9, remind_at = $10,
              call_result = $11, meeting_place = $12, participant_user_ids = $13::uuid[],
              outcome = $14, reminded_at = CASE WHEN $15 THEN NULL ELSE reminded_at END
        WHERE id = $1
        RETURNING ${ACTIVITY_COLUMNS}`,
      [
        id,
        next.title,
        next.note,
        next.priority,
        next.ownerUserId,
        next.dueOn,
        next.dueAt,
        next.durationMinutes,
        next.remindBeforeMinutes,
        remindAt(next),
        next.callResult,
        next.meetingPlace,
        next.participantUserIds,
        next.outcome,
        reminderMoved,
      ],
    );
    const updated = rows[0]!;
    await audit(
      exec,
      ctx,
      updated,
      'updated',
      fields.map((f) => COLUMN_OF[f]),
    );
    return toActivity(updated);
  });
}

/** The tick („Făcut”) and its undo. */
export async function setActivityDoneInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  activityId: string,
  done: boolean,
): Promise<Activity> {
  const id = requireId('activityId', activityId);
  if (typeof done !== 'boolean') throw new InvalidInput('done', 'invalid');
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const row = await readActivity(client, id, true);
    await requireVisible(client, ctx, scope, row);
    requireChanger(ctx, scope, row);
    if (row.deleted_at) throw new Conflict('activity_deleted');
    if ((row.status === 'done') === done) return toActivity(row);
    const { rows } = done
      ? await client.query<ActivityRow>(
          `UPDATE crm.activity SET status = 'done', done_at = now(), done_by_user_id = $2
            WHERE id = $1 RETURNING ${ACTIVITY_COLUMNS}`,
          [id, ctx.userId],
        )
      : await client.query<ActivityRow>(
          `UPDATE crm.activity SET status = 'open', done_at = NULL, done_by_user_id = NULL
            WHERE id = $1 RETURNING ${ACTIVITY_COLUMNS}`,
          [id],
        );
    const updated = rows[0]!;
    await audit(exec, ctx, updated, done ? 'completed' : 'updated', done ? [] : ['status']);
    return toActivity(updated);
  });
}

/** „Șterge”: the owner, the creator or crm:admin; into the bin. */
export async function deleteActivityInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  activityId: string,
): Promise<Activity> {
  const id = requireId('activityId', activityId);
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const row = await readActivity(client, id, true);
    await requireVisible(client, ctx, scope, row);
    requireChanger(ctx, scope, row);
    if (row.deleted_at) return toActivity(row);
    const { rows } = await client.query<ActivityRow>(
      `UPDATE crm.activity SET deleted_at = now(), deleted_by_user_id = $2 WHERE id = $1
       RETURNING ${ACTIVITY_COLUMNS}`,
      [id, ctx.userId],
    );
    const deleted = rows[0]!;
    await audit(exec, ctx, deleted, 'deleted');
    return toActivity(deleted);
  });
}

// ── read ───────────────────────────────────────────────────────────────────────────────────────

export async function getActivityInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  activityId: string,
): Promise<Activity> {
  const id = requireId('activityId', activityId);
  return withCrmTx(
    ctx.organizationId,
    async (client) => {
      const row = await readActivity(client, id);
      await requireVisible(client, ctx, scope, row);
      return toActivity(row);
    },
    true,
  );
}

export type ListActivitiesParams = {
  /** 'mine' (default: owned by the caller), 'team', or a member's id. */
  who?: unknown;
  kind?: unknown;
  /** 'open' (default), 'done' or 'all'. */
  status?: unknown;
  /** The due days, inclusive (YYYY-MM-DD). */
  from?: unknown;
  to?: unknown;
  /** The calendar: only the activities with a time. */
  timedOnly?: unknown;
  subjectType?: unknown;
  subjectId?: unknown;
  limit?: unknown;
  offset?: unknown;
};

/**
 * „Activitățile mele” / „Toată echipa” / a member, and the calendar: the open ones first by due
 * day and time (no due day last), the rest by creation.
 */
export async function listActivitiesInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  params: ListActivitiesParams,
): Promise<Activity[]> {
  const { limit, offset } = page(params);
  const where: string[] = ['a.deleted_at IS NULL'];
  const args: unknown[] = [];
  const arg = (v: unknown) => {
    args.push(v);
    return `$${args.length}`;
  };
  const who = params.who ?? 'mine';
  if (who === 'mine') where.push(`a.owner_user_id = ${arg(ctx.userId)}::uuid`);
  else if (isUuid(who)) where.push(`a.owner_user_id = ${arg(who.toLowerCase())}::uuid`);
  else if (who !== 'team') throw new InvalidInput('who', 'invalid');
  const kind = oneOf('kind', ACTIVITY_KINDS, params.kind);
  if (kind) where.push(`a.kind = ${arg(kind)}`);
  const status = params.status ?? 'open';
  if (status === 'open' || status === 'done') where.push(`a.status = ${arg(status)}`);
  else if (status !== 'all') throw new InvalidInput('status', 'invalid');
  const from = normalizeDay('from', params.from);
  const to = normalizeDay('to', params.to);
  if (from) where.push(`a.due_on >= ${arg(from)}::date`);
  if (to) where.push(`a.due_on <= ${arg(to)}::date`);
  if (params.timedOnly === true) where.push('a.due_at IS NOT NULL');
  else if (params.timedOnly !== undefined && params.timedOnly !== false) {
    throw new InvalidInput('timedOnly', 'invalid');
  }
  if (params.subjectType !== undefined) {
    const type = requireSubjectType(params.subjectType);
    where.push(`a.subject_type = ${arg(type)}`);
    where.push(`a.subject_id = ${arg(requireId('subjectId', params.subjectId))}::uuid`);
  }
  if (scope !== 'all') {
    const me = arg(ctx.userId);
    where.push(`(a.owner_user_id = ${me}::uuid OR a.created_by_user_id = ${me}::uuid
      OR a.subject_type = 'company'
      OR (a.subject_type = 'contact' AND (c.owner_user_id IS NULL OR c.owner_user_id = ${me}::uuid)))`);
  }
  return withCrmTx(
    ctx.organizationId,
    async (client) => {
      const { rows } = await client.query<ActivityRow>(
        `SELECT ${PREFIXED}
           FROM crm.activity a
           LEFT JOIN crm.contact c ON a.subject_type = 'contact' AND c.id = a.subject_id
          WHERE ${where.join(' AND ')}
          ORDER BY a.due_on NULLS LAST, a.due_at NULLS LAST, a.created_at, a.id
          LIMIT ${arg(limit)} OFFSET ${arg(offset)}`,
        args,
      );
      return rows.map(toActivity);
    },
    true,
  );
}

/** The done activities of a record, for its history (timeline.ts). */
export async function doneActivitiesOf(
  client: PoolClient,
  type: SubjectType,
  subjectId: string,
  limit: number,
): Promise<Activity[]> {
  const { rows } = await client.query<ActivityRow>(
    `SELECT ${ACTIVITY_COLUMNS} FROM crm.activity
      WHERE subject_type = $1 AND subject_id = $2 AND status = 'done' AND deleted_at IS NULL
      ORDER BY done_at DESC, id DESC
      LIMIT $3`,
    [type, subjectId, limit],
  );
  return rows.map(toActivity);
}
