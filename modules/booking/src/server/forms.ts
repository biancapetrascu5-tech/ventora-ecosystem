import type { PoolClient } from 'pg';
import { AuditActions, appendAuditEventInTx, type AuditSqlExecutor } from '@ventora/audit';
import type { TenantContext } from '@ventora/access';
import { uuidv7 } from '@ventora/db-kit';
import { Forbidden, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { deleteFileAsSystem, getDownloadLink } from '@ventora/files';
import { withBookingTx } from './db';
import { isUuid } from './validation';
import { hubOnly } from './actor';

/*
 * Lot B.12 — the questions at booking (BOOKING.md §3 B.12; design BookingCustomForms, S127). The
 * salon defines them in Setări · „Rezervări online” · „Întrebări la rezervare” (booking:settings);
 * the client answers on the public page, at the details step, only those of the chosen service; the
 * team answers from the Hub only the questions marked „Apare și când echipa face programarea din
 * Hub”. The answers live on the booking, with the text of the question as it was asked.
 *
 * Health questions never go here (B.8, separate consent). S127, decided by the founder (11.11.2026):
 * at most 5 questions per service, with an optional photo (a question with „Clientul poate adăuga o
 * poză”; the photo is a file of core/files, PNG / JPEG up to 10 MB, bound to the answer); the
 * answers stay on the booking and the last answer to each question is shown on the client card, only
 * to the owner, the admins and the application manager (booking:admin). The changes of the questions
 * are logged as booking.settings_updated (no new audit code); the answers never go to the log, only
 * which questions (approved 11.11.2026).
 */

export const FORM_LIMITS = {
  label: 160,
  helpText: 240,
  options: 20,
  optionLength: 80,
  /** S127 (proposed): the active questions one service asks. */
  perService: 5,
  /** All the active questions of a business. */
  total: 50,
  shortText: 200,
  longText: 2000,
  number: 1_000_000_000,
} as const;

export const FORM_QUESTION_KINDS = [
  'short_text',
  'long_text',
  'yes_no',
  'choice',
  'multi',
  'number',
  'date',
] as const;
export type FormQuestionKind = (typeof FORM_QUESTION_KINDS)[number];

export type FormQuestion = {
  id: string;
  label: string;
  kind: FormQuestionKind;
  /** The options of „one choice” / „several choices”, in order; null otherwise. */
  options: string[] | null;
  helpText: string | null;
  /** null = „Toate serviciile”. */
  serviceIds: string[] | null;
  required: boolean;
  /** „Apare și când echipa face programarea din Hub”. */
  inHub: boolean;
  /** „Clientul poate adăuga o poză” (S127): an optional photo with the answer. */
  allowsPhoto: boolean;
  sortOrder: number;
  archivedAt: Date | null;
};

/** The question as the public page shows it (no archive, no Hub flag). */
export type PublicFormQuestion = Pick<
  FormQuestion,
  'id' | 'label' | 'kind' | 'options' | 'helpText' | 'serviceIds' | 'required' | 'allowsPhoto'
>;

/** yes / no as 'yes' | 'no'; a date as YYYY-MM-DD; several choices as the chosen options. */
export type FormAnswerValue = string | string[] | number;

export type FormAnswer = { questionId: string; label: string; value: FormAnswerValue };

/** „Răspunsuri la întrebări” on the booking: value null = „Fără răspuns” (or wiped). */
export type AppointmentAnswer = {
  questionId: string;
  label: string;
  kind: FormQuestionKind;
  value: FormAnswerValue | null;
  /** An optional photo (S127): its link comes from getAnswerPhotoLink. */
  hasPhoto: boolean;
  source: 'client' | 'team' | null;
};

/** The client card (booking:admin): the last answer to each question, from the client's bookings. */
export type ClientLastAnswer = {
  questionId: string;
  label: string;
  kind: FormQuestionKind;
  value: FormAnswerValue | null;
  hasPhoto: boolean;
  appointmentId: string;
  /** When the booking was (its start). */
  startsAt: Date;
};

type QuestionRow = {
  id: string;
  label: string;
  kind: FormQuestionKind;
  options: string[] | null;
  help_text: string | null;
  service_ids: string[] | null;
  required: boolean;
  in_hub: boolean;
  allows_photo: boolean;
  sort_order: number;
  archived_at: Date | null;
};

const QUESTION_COLUMNS = `id, label, kind, options, help_text, service_ids, required, in_hub,
  allows_photo, sort_order, archived_at`;

function toQuestion(r: QuestionRow): FormQuestion {
  return {
    id: r.id,
    label: r.label,
    kind: r.kind,
    options: r.options,
    helpText: r.help_text,
    serviceIds: r.service_ids,
    required: r.required,
    inHub: r.in_hub,
    allowsPhoto: r.allows_photo,
    sortOrder: r.sort_order,
    archivedAt: r.archived_at,
  };
}

export function toPublicQuestion(q: FormQuestion): PublicFormQuestion {
  return {
    id: q.id,
    label: q.label,
    kind: q.kind,
    options: q.options,
    helpText: q.helpText,
    serviceIds: q.serviceIds,
    required: q.required,
    allowsPhoto: q.allowsPhoto,
  };
}

function requireId(id: unknown): string {
  if (!isUuid(id)) throw new ResourceNotFound();
  return id;
}

function audit(
  exec: AuditSqlExecutor,
  ctx: TenantContext,
  metadata: Record<string, unknown>,
  action: string = AuditActions.bookingSettingsUpdated,
  targetType: 'booking_settings' | 'booking_appointment' = 'booking_settings',
  targetId: string = ctx.organizationId,
) {
  return appendAuditEventInTx(exec, {
    category: 'booking',
    action,
    outcome: 'success',
    actorType: 'user',
    actorId: ctx.userId,
    organizationId: ctx.organizationId,
    targetType,
    targetId,
    metadata,
  });
}

// ── the questions (Setări, booking:settings) ────────────────────────────────────────────────

export type FormQuestionInput = {
  label?: unknown;
  kind?: unknown;
  options?: unknown;
  helpText?: unknown;
  serviceIds?: unknown;
  required?: unknown;
  inHub?: unknown;
  allowsPhoto?: unknown;
  sortOrder?: unknown;
};

function validateQuestion(input: FormQuestionInput) {
  // „Scrieți întrebarea.”
  if (typeof input.label !== 'string') throw new InvalidInput('label', 'required');
  const label = input.label.trim();
  if (label.length < 1) throw new InvalidInput('label', 'required');
  if (label.length > FORM_LIMITS.label) throw new InvalidInput('label', 'too_long');
  const kind = input.kind as FormQuestionKind;
  if (!FORM_QUESTION_KINDS.includes(kind)) throw new InvalidInput('kind', 'invalid');
  let options: string[] | null = null;
  if (kind === 'choice' || kind === 'multi') {
    // „Adăugați cel puțin două variante.”
    if (!Array.isArray(input.options)) throw new InvalidInput('options', 'too_few');
    const opts = input.options.map((o) => (typeof o === 'string' ? o.trim() : ''));
    const filled = opts.filter((o) => o.length > 0);
    if (filled.length < 2) throw new InvalidInput('options', 'too_few');
    if (
      filled.length !== opts.length ||
      filled.length > FORM_LIMITS.options ||
      filled.some((o) => o.length > FORM_LIMITS.optionLength) ||
      new Set(filled).size !== filled.length
    ) {
      throw new InvalidInput('options', 'invalid');
    }
    options = filled;
  } else if (input.options !== undefined && input.options !== null) {
    if (!Array.isArray(input.options) || input.options.length > 0) {
      throw new InvalidInput('options', 'invalid');
    }
  }
  let helpText: string | null = null;
  if (input.helpText !== undefined && input.helpText !== null) {
    if (typeof input.helpText !== 'string') throw new InvalidInput('helpText', 'invalid');
    const h = input.helpText.trim();
    if (h.length > FORM_LIMITS.helpText) throw new InvalidInput('helpText', 'too_long');
    helpText = h.length > 0 ? h : null;
  }
  let serviceIds: string[] | null = null;
  if (input.serviceIds !== undefined && input.serviceIds !== null) {
    if (!Array.isArray(input.serviceIds) || !input.serviceIds.every(isUuid)) {
      throw new InvalidInput('serviceIds', 'invalid');
    }
    // empty = „Toate serviciile”
    serviceIds =
      input.serviceIds.length === 0 ? null : [...new Set(input.serviceIds as string[])].sort();
  }
  if (input.required !== undefined && typeof input.required !== 'boolean') {
    throw new InvalidInput('required', 'invalid');
  }
  if (input.inHub !== undefined && typeof input.inHub !== 'boolean') {
    throw new InvalidInput('inHub', 'invalid');
  }
  if (input.allowsPhoto !== undefined && typeof input.allowsPhoto !== 'boolean') {
    throw new InvalidInput('allowsPhoto', 'invalid');
  }
  const sortOrder = input.sortOrder;
  if (
    sortOrder !== undefined &&
    (typeof sortOrder !== 'number' ||
      !Number.isInteger(sortOrder) ||
      sortOrder < 0 ||
      sortOrder > 1_000_000)
  ) {
    throw new InvalidInput('sortOrder', 'invalid');
  }
  return {
    label,
    kind,
    options,
    helpText,
    serviceIds,
    required: input.required === true,
    inHub: input.inHub === true,
    allowsPhoto: input.allowsPhoto === true,
    sortOrder: sortOrder as number | undefined,
  };
}

/**
 * The questions of the business are changed one transaction at a time (the limits per service are
 * counted under this lock).
 */
async function lockQuestions(client: PoolClient, organizationId: string) {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('booking.form_question:' || $1))`, [
    organizationId,
  ]);
}

/** The services exist in this business (archived ones too: a question may outlive a service). */
async function requireServices(client: PoolClient, serviceIds: string[] | null) {
  if (!serviceIds) return;
  const { rows } = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM booking.service WHERE id = ANY($1::uuid[])`,
    [serviceIds],
  );
  if (rows[0]!.n !== serviceIds.length) throw new InvalidInput('serviceIds', 'invalid');
}

/**
 * S127 (proposed): at most 5 active questions per service, at most 50 in all. `except` is the
 * question being changed; `serviceIds` its services after the change (null = all).
 */
async function checkLimits(client: PoolClient, serviceIds: string[] | null, except: string | null) {
  const others = (
    await client.query<{ service_ids: string[] | null }>(
      `SELECT service_ids FROM booking.form_question
        WHERE archived_at IS NULL AND ($1::uuid IS NULL OR id <> $1)`,
      [except],
    )
  ).rows;
  if (others.length + 1 > FORM_LIMITS.total) throw new InvalidInput('serviceIds', 'too_many');
  const forAll = others.filter((q) => q.service_ids === null).length;
  let targets: string[];
  if (serviceIds) {
    targets = serviceIds;
  } else {
    // a question for every service: each service the business has, and the services named by the
    // other questions (a service with no question of its own still counts the ones for all)
    targets = (
      await client.query<{ id: string }>(`SELECT id FROM booking.service WHERE archived_at IS NULL`)
    ).rows.map((r) => r.id);
    if (targets.length === 0 && forAll + 1 > FORM_LIMITS.perService) {
      throw new InvalidInput('serviceIds', 'too_many');
    }
  }
  for (const serviceId of targets) {
    const n = forAll + others.filter((q) => q.service_ids?.includes(serviceId)).length + 1;
    if (n > FORM_LIMITS.perService) throw new InvalidInput('serviceIds', 'too_many');
  }
}

export async function listFormQuestionsInOrg(
  ctx: TenantContext,
  includeArchived = false,
): Promise<FormQuestion[]> {
  hubOnly(ctx);
  return withBookingTx(
    ctx.organizationId,
    async (client) =>
      (
        await client.query<QuestionRow>(
          `SELECT ${QUESTION_COLUMNS} FROM booking.form_question
            ${includeArchived ? '' : 'WHERE archived_at IS NULL'}
            ORDER BY sort_order, created_at, id`,
        )
      ).rows.map(toQuestion),
    true,
  );
}

export async function createFormQuestionInOrg(
  ctx: TenantContext,
  input: FormQuestionInput,
): Promise<FormQuestion> {
  hubOnly(ctx);
  const q = validateQuestion(input);
  return withBookingTx(ctx.organizationId, async (client, exec) => {
    await lockQuestions(client, ctx.organizationId);
    await requireServices(client, q.serviceIds);
    await checkLimits(client, q.serviceIds, null);
    // a new question goes last, unless an order is given
    const sortOrder =
      q.sortOrder ??
      (
        await client.query<{ next: number }>(
          `SELECT COALESCE(max(sort_order) + 1, 0)::int AS next FROM booking.form_question
            WHERE archived_at IS NULL`,
        )
      ).rows[0]!.next;
    const id = uuidv7();
    const { rows } = await client.query<QuestionRow>(
      `INSERT INTO booking.form_question
         (id, organization_id, label, kind, options, help_text, service_ids, required, in_hub,
          sort_order, created_by_user_id, allows_photo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING ${QUESTION_COLUMNS}`,
      [
        id,
        ctx.organizationId,
        q.label,
        q.kind,
        q.options === null ? null : JSON.stringify(q.options),
        q.helpText,
        q.serviceIds,
        q.required,
        q.inHub,
        Math.min(sortOrder, 1_000_000),
        ctx.userId,
        q.allowsPhoto,
      ],
    );
    await audit(exec, ctx, { formQuestion: { op: 'created', id, kind: q.kind } });
    return toQuestion(rows[0]!);
  });
}

export async function updateFormQuestionInOrg(
  ctx: TenantContext,
  questionId: unknown,
  input: FormQuestionInput,
): Promise<FormQuestion> {
  hubOnly(ctx);
  const id = requireId(questionId);
  const q = validateQuestion(input);
  return withBookingTx(ctx.organizationId, async (client, exec) => {
    await lockQuestions(client, ctx.organizationId);
    const current = (
      await client.query<QuestionRow>(
        `SELECT ${QUESTION_COLUMNS} FROM booking.form_question WHERE id = $1 FOR UPDATE`,
        [id],
      )
    ).rows[0];
    if (!current) throw new ResourceNotFound();
    await requireServices(client, q.serviceIds);
    if (!current.archived_at) await checkLimits(client, q.serviceIds, id);
    const { rows } = await client.query<QuestionRow>(
      `UPDATE booking.form_question
          SET label = $2, kind = $3, options = $4, help_text = $5, service_ids = $6, required = $7,
              in_hub = $8, sort_order = COALESCE($9, sort_order), allows_photo = $10
        WHERE id = $1 RETURNING ${QUESTION_COLUMNS}`,
      [
        id,
        q.label,
        q.kind,
        q.options === null ? null : JSON.stringify(q.options),
        q.helpText,
        q.serviceIds,
        q.required,
        q.inHub,
        q.sortOrder ?? null,
        q.allowsPhoto,
      ],
    );
    await audit(exec, ctx, { formQuestion: { op: 'updated', id, kind: q.kind } });
    return toQuestion(rows[0]!);
  });
}

/** „Șterge întrebarea”: archived (the answers already given stay on their bookings). */
export async function archiveFormQuestionInOrg(
  ctx: TenantContext,
  questionId: unknown,
): Promise<FormQuestion> {
  hubOnly(ctx);
  const id = requireId(questionId);
  return withBookingTx(ctx.organizationId, async (client, exec) => {
    const { rows } = await client.query<QuestionRow>(
      `UPDATE booking.form_question SET archived_at = COALESCE(archived_at, now()),
              archived_by_user_id = COALESCE(archived_by_user_id, $2)
        WHERE id = $1 RETURNING ${QUESTION_COLUMNS}`,
      [id, ctx.userId],
    );
    if (!rows[0]) throw new ResourceNotFound();
    await audit(exec, ctx, { formQuestion: { op: 'archived', id } });
    return toQuestion(rows[0]);
  });
}

/**
 * The order the client sees (drag handle; „Mută mai sus / mai jos” on a phone): every active
 * question, once, in the new order.
 */
export async function reorderFormQuestionsInOrg(
  ctx: TenantContext,
  questionIds: unknown,
): Promise<FormQuestion[]> {
  hubOnly(ctx);
  if (
    !Array.isArray(questionIds) ||
    questionIds.length > FORM_LIMITS.total ||
    !questionIds.every(isUuid) ||
    new Set(questionIds).size !== questionIds.length
  ) {
    throw new InvalidInput('questionIds', 'invalid');
  }
  const ids = questionIds as string[];
  return withBookingTx(ctx.organizationId, async (client, exec) => {
    await lockQuestions(client, ctx.organizationId);
    const active = (
      await client.query<{ id: string }>(
        `SELECT id FROM booking.form_question WHERE archived_at IS NULL FOR UPDATE`,
      )
    ).rows.map((r) => r.id);
    if (active.length !== ids.length || !active.every((id) => ids.includes(id))) {
      throw new InvalidInput('questionIds', 'invalid');
    }
    await client.query(
      `UPDATE booking.form_question q SET sort_order = o.ord - 1
         FROM unnest($1::uuid[]) WITH ORDINALITY AS o(id, ord)
        WHERE q.id = o.id AND q.sort_order <> o.ord - 1`,
      [ids],
    );
    await audit(exec, ctx, { formQuestion: { op: 'reordered', count: ids.length } });
    return (
      await client.query<QuestionRow>(
        `SELECT ${QUESTION_COLUMNS} FROM booking.form_question WHERE archived_at IS NULL
          ORDER BY sort_order, created_at, id`,
      )
    ).rows.map(toQuestion);
  });
}

// ── the answers ─────────────────────────────────────────────────────────────────────────────

/** The active questions of one service, in order; `hub` keeps only those shown in the Hub. */
export async function questionsForService(
  client: PoolClient,
  serviceId: string,
  audience: 'public' | 'hub',
): Promise<FormQuestion[]> {
  return (
    await client.query<QuestionRow>(
      `SELECT ${QUESTION_COLUMNS} FROM booking.form_question
        WHERE archived_at IS NULL AND (service_ids IS NULL OR $1::uuid = ANY(service_ids))
          ${audience === 'hub' ? 'AND in_hub' : ''}
        ORDER BY sort_order, created_at, id`,
      [serviceId],
    )
  ).rows.map(toQuestion);
}

/** Every active question (the public page filters them by the chosen service). */
export async function activeQuestions(client: PoolClient): Promise<FormQuestion[]> {
  return (
    await client.query<QuestionRow>(
      `SELECT ${QUESTION_COLUMNS} FROM booking.form_question WHERE archived_at IS NULL
        ORDER BY sort_order, created_at, id`,
    )
  ).rows.map(toQuestion);
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function validDate(v: string): boolean {
  const m = DATE_RE.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === v;
}

/** One answer, normalized; null = empty (no answer). Throws on a wrong value. */
function answerValue(q: FormQuestion, raw: unknown): FormAnswerValue | null {
  const bad = () => new InvalidInput('answers', `invalid:${q.id}`);
  if (raw === undefined || raw === null) return null;
  switch (q.kind) {
    case 'short_text':
    case 'long_text': {
      if (typeof raw !== 'string') throw bad();
      const v = raw.trim();
      if (v.length === 0) return null;
      const max = q.kind === 'short_text' ? FORM_LIMITS.shortText : FORM_LIMITS.longText;
      if (v.length > max) throw bad();
      return v;
    }
    case 'yes_no':
      if (raw !== 'yes' && raw !== 'no') throw bad();
      return raw;
    case 'choice':
      if (raw === '') return null;
      if (typeof raw !== 'string' || !(q.options ?? []).includes(raw)) throw bad();
      return raw;
    case 'multi': {
      if (!Array.isArray(raw)) throw bad();
      if (raw.length === 0) return null;
      if (
        !raw.every((o) => typeof o === 'string' && (q.options ?? []).includes(o)) ||
        new Set(raw).size !== raw.length
      ) {
        throw bad();
      }
      // in the order of the options
      return (q.options ?? []).filter((o) => raw.includes(o));
    }
    case 'number': {
      if (raw === '') return null;
      const n = typeof raw === 'string' ? Number(raw.trim().replace(',', '.')) : raw;
      if (typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > FORM_LIMITS.number) {
        throw bad();
      }
      return n;
    }
    case 'date':
      if (raw === '') return null;
      if (typeof raw !== 'string' || !validDate(raw)) throw bad();
      return raw;
  }
}

/**
 * The answers to the questions of a service. Unknown questions or a question of another service:
 * InvalidInput('answers', 'invalid'). A required question left empty, when `requireAll`:
 * InvalidInput('answers', 'required:<questionId>') („Răspundeți la această întrebare.”).
 */
export function validateAnswers(
  questions: FormQuestion[],
  raw: unknown,
  requireAll: boolean,
): FormAnswer[] {
  if (raw === undefined || raw === null) raw = [];
  if (!Array.isArray(raw) || raw.length > FORM_LIMITS.total) {
    throw new InvalidInput('answers', 'invalid');
  }
  const given = new Map<string, unknown>();
  for (const a of raw as Array<{ questionId?: unknown; value?: unknown }>) {
    if (!a || typeof a !== 'object' || !isUuid(a.questionId) || given.has(a.questionId)) {
      throw new InvalidInput('answers', 'invalid');
    }
    given.set(a.questionId, a.value);
  }
  const byId = new Map(questions.map((q) => [q.id, q]));
  for (const id of given.keys()) {
    if (!byId.has(id)) throw new InvalidInput('answers', 'invalid');
  }
  const out: FormAnswer[] = [];
  for (const q of questions) {
    const value = answerValue(q, given.get(q.id));
    if (value === null) {
      if (requireAll && q.required) throw new InvalidInput('answers', `required:${q.id}`);
      continue;
    }
    out.push({ questionId: q.id, label: q.label, value });
  }
  return out;
}

/**
 * The photos given on the public page (S127), moved to the booking with the answers: one per
 * question, in the same row as the answer (a photo without a written answer is an answer too).
 */
export async function writePhotos(
  client: PoolClient,
  organizationId: string,
  appointmentId: string,
  photos: Array<{ questionId: string; label: string; fileId: string }>,
): Promise<void> {
  for (const p of photos) {
    await client.query(
      `INSERT INTO booking.appointment_answer
         (id, organization_id, appointment_id, question_id, question_label, photo_file_id, source)
       VALUES ($1, $2, $3, $4, $5, $6, 'client')
       ON CONFLICT (appointment_id, question_id) DO UPDATE
         SET photo_file_id = EXCLUDED.photo_file_id
       WHERE booking.appointment_answer.wiped_at IS NULL`,
      [uuidv7(), organizationId, appointmentId, p.questionId, p.label, p.fileId],
    );
  }
}

/** Writes the answers of a booking (one row per question; a new answer replaces the old one). */
export async function writeAnswers(
  client: PoolClient,
  organizationId: string,
  appointmentId: string,
  answers: FormAnswer[],
  by: { source: 'client' } | { source: 'team'; userId: string },
): Promise<void> {
  for (const a of answers) {
    await client.query(
      `INSERT INTO booking.appointment_answer
         (id, organization_id, appointment_id, question_id, question_label, value, source,
          updated_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (appointment_id, question_id) DO UPDATE
         SET question_label = EXCLUDED.question_label, value = EXCLUDED.value,
             source = EXCLUDED.source, updated_by_user_id = EXCLUDED.updated_by_user_id,
             wiped_at = NULL
       WHERE booking.appointment_answer.wiped_at IS NULL`,
      [
        uuidv7(),
        organizationId,
        appointmentId,
        a.questionId,
        a.label,
        JSON.stringify(a.value),
        by.source,
        by.source === 'team' ? by.userId : null,
      ],
    );
  }
}

type AppointmentRef = {
  service_id: string;
  staff_user_id: string | null;
  client_erased: boolean;
};

async function readAppointmentRef(
  client: PoolClient,
  appointmentId: string,
  lock: boolean,
): Promise<AppointmentRef> {
  const row = (
    await client.query<AppointmentRef>(
      `SELECT a.service_id, m.user_id AS staff_user_id,
              COALESCE(c.erased_at IS NOT NULL, false) AS client_erased
         FROM booking.appointment a
         JOIN booking.staff_member m ON m.id = a.staff_member_id
         LEFT JOIN booking.client c ON c.id = a.client_id
        WHERE a.id = $1${lock ? ' FOR UPDATE OF a' : ''}`,
      [appointmentId],
    )
  ).rows[0];
  if (!row) throw new ResourceNotFound();
  return row;
}

/**
 * „Răspunsuri la întrebări” (booking:read): the questions answered, in the order of the questions,
 * then the active questions of the service left empty („Fără răspuns”).
 */
export async function getAppointmentAnswersInOrg(
  ctx: TenantContext,
  appointmentIdRaw: unknown,
): Promise<AppointmentAnswer[]> {
  hubOnly(ctx);
  const appointmentId = requireId(appointmentIdRaw);
  return withBookingTx(
    ctx.organizationId,
    async (client) => {
      const ref = await readAppointmentRef(client, appointmentId, false);
      const answered = (
        await client.query<{
          question_id: string;
          question_label: string;
          kind: FormQuestionKind;
          value: FormAnswerValue | null;
          has_photo: boolean;
          source: 'client' | 'team';
        }>(
          `SELECT a.question_id, a.question_label, q.kind, a.value, a.source,
                  (a.photo_file_id IS NOT NULL AND a.wiped_at IS NULL
                   AND a.photo_deleted_at IS NULL) AS has_photo
             FROM booking.appointment_answer a
             JOIN booking.form_question q ON q.id = a.question_id
            WHERE a.appointment_id = $1
            ORDER BY q.sort_order, q.created_at, q.id`,
          [appointmentId],
        )
      ).rows;
      const seen = new Set(answered.map((a) => a.question_id));
      const empty = ref.client_erased
        ? []
        : (await questionsForService(client, ref.service_id, 'public')).filter(
            (q) => !seen.has(q.id),
          );
      return [
        ...answered.map((a) => ({
          questionId: a.question_id,
          label: a.question_label,
          kind: a.kind,
          value: a.value,
          hasPhoto: a.has_photo,
          source: a.value === null && !a.has_photo ? null : a.source,
        })),
        ...empty.map((q) => ({
          questionId: q.id,
          label: q.label,
          kind: q.kind,
          value: null,
          hasPhoto: false,
          source: null,
        })),
      ];
    },
    true,
  );
}

/**
 * The team answers from the Hub (booking:write; „own” only on its own bookings): only the questions
 * of the service marked „Apare și când echipa face programarea din Hub”. A required question may be
 * left for the client; an empty value leaves an earlier answer as it is.
 */
export async function saveAppointmentAnswersInOrg(
  ctx: TenantContext,
  scope: 'all' | 'own',
  appointmentIdRaw: unknown,
  answers: unknown,
): Promise<AppointmentAnswer[]> {
  hubOnly(ctx);
  const appointmentId = requireId(appointmentIdRaw);
  await withBookingTx(ctx.organizationId, async (client, exec) => {
    const ref = await readAppointmentRef(client, appointmentId, true);
    if (scope === 'own' && ref.staff_user_id !== ctx.userId) throw new Forbidden();
    if (ref.client_erased) throw new InvalidInput('answers', 'invalid');
    const valid = validateAnswers(
      await questionsForService(client, ref.service_id, 'hub'),
      answers,
      false,
    );
    if (valid.length === 0) return;
    await writeAnswers(client, ctx.organizationId, appointmentId, valid, {
      source: 'team',
      userId: ctx.userId,
    });
    // never the answers in the log: which questions only
    await audit(
      exec,
      ctx,
      { answers: valid.map((a) => a.questionId) },
      AuditActions.bookingAppointmentUpdated,
      'booking_appointment',
      appointmentId,
    );
  });
  return getAppointmentAnswersInOrg(ctx, appointmentId);
}

// ── the photos (S127) ───────────────────────────────────────────────────────────────────────

/** The owner of a photo in core/files: the hold (public page) and the question. */
export function photoOwner(holdId: string, questionId: string) {
  return { module: 'booking', resourceType: 'answer_photo', resourceId: `${holdId}:${questionId}` };
}

/** A signed, expiring link to the photo of an answer (booking:read), for the booking detail. */
export async function getAnswerPhotoLinkInOrg(
  ctx: TenantContext,
  appointmentIdRaw: unknown,
  questionIdRaw: unknown,
): Promise<{ url: string; expiresAt: Date }> {
  hubOnly(ctx);
  const appointmentId = requireId(appointmentIdRaw);
  const questionId = requireId(questionIdRaw);
  const fileId = await withBookingTx(
    ctx.organizationId,
    async (client) =>
      (
        await client.query<{ photo_file_id: string }>(
          `SELECT photo_file_id FROM booking.appointment_answer
            WHERE appointment_id = $1 AND question_id = $2 AND photo_file_id IS NOT NULL
              AND wiped_at IS NULL AND photo_deleted_at IS NULL`,
          [appointmentId, questionId],
        )
      ).rows[0]?.photo_file_id,
    true,
  );
  if (!fileId) throw new ResourceNotFound();
  return getDownloadLink({ organizationId: ctx.organizationId, userId: ctx.userId }, fileId);
}

/**
 * After the GDPR erasure (booking.erase_client marks the photos: the answer wiped, the file id kept):
 * each marked photo deleted by the system deletion of core/files (C.4f, reason client_erased, an
 * audit row `system`), then photo_deleted_at. `clientId` null = every marked photo of the business
 * (the cleanup job retries those the storage refused). Returns how many were deleted and how many
 * remain marked.
 */
export async function deleteMarkedPhotos(
  organizationId: string,
  clientId: string | null,
): Promise<{ deleted: number; pending: number }> {
  const marked = await withBookingTx(
    organizationId,
    async (client) =>
      (
        await client.query<{ id: string; photo_file_id: string }>(
          `SELECT q.id, q.photo_file_id FROM booking.appointment_answer q
             JOIN booking.appointment a ON a.id = q.appointment_id
             JOIN booking.client c ON c.id = a.client_id
            WHERE ($1::uuid IS NULL OR c.id = $1 OR c.merged_into_client_id = $1)
              AND q.wiped_at IS NOT NULL AND q.photo_file_id IS NOT NULL
              AND q.photo_deleted_at IS NULL
            LIMIT 500`,
          [clientId],
        )
      ).rows,
    true,
  );
  let deleted = 0;
  for (const m of marked) {
    try {
      await deleteFileAsSystem(organizationId, {
        fileId: m.photo_file_id,
        module: 'booking',
        reason: 'client_erased',
      });
    } catch (err) {
      if (!(err instanceof ResourceNotFound)) continue; // stays marked, retried by the job
    }
    await withBookingTx(organizationId, (client) =>
      client.query(
        `UPDATE booking.appointment_answer SET photo_deleted_at = now()
          WHERE id = $1 AND photo_deleted_at IS NULL`,
        [m.id],
      ),
    );
    deleted += 1;
  }
  return { deleted, pending: marked.length - deleted };
}

/** S146: the photos of the answers are kept 30 days after the booking. */
export const ANSWER_PHOTO_RETENTION_DAYS = 30;

/**
 * S146 (the founder's decision of 12.11.2026): the photos of the answers whose booking ended more
 * than 30 days ago, deleted by the system deletion of core/files (C.4f, reason photo_retention, an
 * audit row `system`), then photo_deleted_at; the answer itself stays. For the cleanup job; at most
 * 500 per run and business. A photo the storage refuses stays for the next run; one already gone
 * from core/files is only marked.
 */
export async function deleteExpiredAnswerPhotos(
  organizationId: string,
): Promise<{ deleted: number; pending: number }> {
  const due = await withBookingTx(
    organizationId,
    async (client) =>
      (
        await client.query<{ id: string; photo_file_id: string }>(
          `SELECT q.id, q.photo_file_id FROM booking.appointment_answer q
             JOIN booking.appointment a ON a.id = q.appointment_id
            WHERE q.photo_file_id IS NOT NULL AND q.photo_deleted_at IS NULL
              AND a.ends_at < now() - make_interval(days => $1)
            LIMIT 500`,
          [ANSWER_PHOTO_RETENTION_DAYS],
        )
      ).rows,
    true,
  );
  let deleted = 0;
  for (const d of due) {
    try {
      await deleteFileAsSystem(organizationId, {
        fileId: d.photo_file_id,
        module: 'booking',
        reason: 'photo_retention',
      });
    } catch (err) {
      if (!(err instanceof ResourceNotFound)) continue; // stays, retried by the next run
    }
    await withBookingTx(organizationId, (client) =>
      client.query(
        `UPDATE booking.appointment_answer SET photo_deleted_at = now()
          WHERE id = $1 AND photo_deleted_at IS NULL`,
        [d.id],
      ),
    );
    deleted += 1;
  }
  return { deleted, pending: due.length - deleted };
}

// ── the client card (S127: the last answer to each question; booking:admin) ──────────────────

export async function getClientLastAnswersInOrg(
  ctx: TenantContext,
  clientIdRaw: unknown,
): Promise<ClientLastAnswer[]> {
  hubOnly(ctx);
  const clientId = requireId(clientIdRaw);
  return withBookingTx(
    ctx.organizationId,
    async (client) => {
      const found = (await client.query(`SELECT 1 FROM booking.client WHERE id = $1`, [clientId]))
        .rows[0];
      if (!found) throw new ResourceNotFound();
      // the bookings of the client and of the cards merged into it; a wiped answer is not shown
      const { rows } = await client.query<{
        question_id: string;
        question_label: string;
        kind: FormQuestionKind;
        value: FormAnswerValue | null;
        has_photo: boolean;
        appointment_id: string;
        starts_at: Date;
      }>(
        `SELECT l.* FROM (
           SELECT DISTINCT ON (q.question_id)
                  q.question_id, q.question_label, f.kind, q.value,
                  (q.photo_file_id IS NOT NULL AND q.photo_deleted_at IS NULL) AS has_photo,
                  a.id AS appointment_id, a.starts_at, f.sort_order, f.created_at
             FROM booking.appointment_answer q
             JOIN booking.appointment a ON a.id = q.appointment_id
             JOIN booking.client c ON c.id = a.client_id
             JOIN booking.form_question f ON f.id = q.question_id
            WHERE (c.id = $1 OR c.merged_into_client_id = $1) AND q.wiped_at IS NULL
            ORDER BY q.question_id, a.starts_at DESC, q.updated_at DESC) l
          ORDER BY l.sort_order, l.created_at, l.question_id`,
        [clientId],
      );
      return rows.map((r) => ({
        questionId: r.question_id,
        label: r.question_label,
        kind: r.kind,
        value: r.value,
        hasPhoto: r.has_photo,
        appointmentId: r.appointment_id,
        startsAt: r.starts_at,
      }));
    },
    true,
  );
}
