import type { PoolClient } from 'pg';
import { AuditActions, appendAuditEventInTx, type AuditSqlExecutor } from '@ventora/audit';
import type { TenantContext } from '@ventora/access';
import { requireFeature } from '@ventora/commercial';
import { uuidv7 } from '@ventora/db-kit';
import { Conflict, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { withBookingTx } from './db';
import { decryptAnswer, encryptAnswer } from './medical-crypto';
import { isUuid } from './validation';

/*
 * Lot B.8 — the health fields (BOOKING.md §3 B.8, D-B-14; design BookingHealthFields). Only on the
 * businesses marked medical: the feature `booking.medical` (D-B-16 = a, proposed: Founder turns it
 * on per business), else FeatureNotIncluded — the fields do not exist. The answers are encrypted by
 * the application (medical-crypto.ts), visible only with booking:medical (T3), every read logged
 * (booking.medical_read). Nothing is saved without an active consent (the version of the text, the
 * date); a withdrawal wipes the answers. Real medical data only after the lawyer's opinion (§6).
 */

export const MEDICAL_FEATURE = 'booking.medical';

export const MEDICAL_LIMITS = {
  label: 160,
  options: 20,
  optionLength: 80,
  textAnswer: 2000,
} as const;

export type MedicalFieldKind = 'text' | 'yes_no' | 'choice';

export type MedicalField = {
  id: string;
  label: string;
  kind: MedicalFieldKind;
  options: string[] | null;
  /** null = every service. */
  serviceIds: string[] | null;
  required: boolean;
  sortOrder: number;
  archivedAt: Date | null;
};

export type MedicalConsent = {
  textVersion: string;
  givenAt: Date;
  source: 'team' | 'public';
};

export type MedicalAnswers = {
  consent: MedicalConsent | null;
  answers: Array<{ fieldId: string; label: string; value: string }>;
};

type FieldRow = {
  id: string;
  label: string;
  kind: MedicalFieldKind;
  options: string[] | null;
  service_ids: string[] | null;
  required: boolean;
  sort_order: number;
  archived_at: Date | null;
};

const FIELD_COLUMNS = `id, label, kind, options, service_ids, required, sort_order, archived_at`;

function toField(r: FieldRow): MedicalField {
  return {
    id: r.id,
    label: r.label,
    kind: r.kind,
    options: r.options,
    serviceIds: r.service_ids,
    required: r.required,
    sortOrder: r.sort_order,
    archivedAt: r.archived_at,
  };
}

function requireId(id: unknown): string {
  if (!isUuid(id)) throw new ResourceNotFound();
  return id;
}

function audit(
  exec: AuditSqlExecutor,
  ctx: TenantContext,
  action: string,
  targetType: 'booking_medical_field' | 'booking_client',
  targetId: string,
  metadata: Record<string, unknown>,
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

/** The business is marked medical (else FeatureNotIncluded: the fields do not exist). */
async function requireMedical(ctx: TenantContext) {
  await requireFeature(ctx, MEDICAL_FEATURE);
}

type FieldInput = {
  label?: unknown;
  kind?: unknown;
  options?: unknown;
  serviceIds?: unknown;
  required?: unknown;
  sortOrder?: unknown;
};

function validateField(input: FieldInput) {
  if (typeof input.label !== 'string') throw new InvalidInput('label', 'invalid');
  const label = input.label.trim();
  if (label.length < 1 || label.length > MEDICAL_LIMITS.label)
    throw new InvalidInput('label', 'invalid');
  const kind = input.kind;
  if (kind !== 'text' && kind !== 'yes_no' && kind !== 'choice')
    throw new InvalidInput('kind', 'invalid');
  let options: string[] | null = null;
  if (kind === 'choice') {
    if (
      !Array.isArray(input.options) ||
      input.options.length < 2 ||
      input.options.length > MEDICAL_LIMITS.options ||
      !input.options.every(
        (o) =>
          typeof o === 'string' &&
          o.trim().length > 0 &&
          o.trim().length <= MEDICAL_LIMITS.optionLength,
      )
    ) {
      throw new InvalidInput('options', 'invalid');
    }
    options = (input.options as string[]).map((o) => o.trim());
    if (new Set(options).size !== options.length) throw new InvalidInput('options', 'invalid');
  } else if (input.options !== undefined && input.options !== null) {
    throw new InvalidInput('options', 'invalid');
  }
  let serviceIds: string[] | null = null;
  if (input.serviceIds !== undefined && input.serviceIds !== null) {
    if (!Array.isArray(input.serviceIds) || !input.serviceIds.every(isUuid)) {
      throw new InvalidInput('serviceIds', 'invalid');
    }
    serviceIds = [...new Set(input.serviceIds as string[])];
  }
  if (input.required !== undefined && typeof input.required !== 'boolean') {
    throw new InvalidInput('required', 'invalid');
  }
  const sortOrder = input.sortOrder === undefined ? 0 : input.sortOrder;
  if (
    typeof sortOrder !== 'number' ||
    !Number.isInteger(sortOrder) ||
    sortOrder < 0 ||
    sortOrder > 1_000_000
  ) {
    throw new InvalidInput('sortOrder', 'invalid');
  }
  return { label, kind, options, serviceIds, required: input.required === true, sortOrder };
}

// ── the fields (Setări, booking:settings) ───────────────────────────────────────────────────

export async function listMedicalFieldsInOrg(
  ctx: TenantContext,
  includeArchived = false,
): Promise<MedicalField[]> {
  await requireMedical(ctx);
  return withBookingTx(
    ctx.organizationId,
    async (client) =>
      (
        await client.query<FieldRow>(
          `SELECT ${FIELD_COLUMNS} FROM booking.medical_field
            ${includeArchived ? '' : 'WHERE archived_at IS NULL'}
            ORDER BY sort_order, label, id`,
        )
      ).rows.map(toField),
    true,
  );
}

export async function createMedicalFieldInOrg(
  ctx: TenantContext,
  input: FieldInput,
): Promise<MedicalField> {
  await requireMedical(ctx);
  const f = validateField(input);
  return withBookingTx(ctx.organizationId, async (client, exec) => {
    const id = uuidv7();
    const { rows } = await client.query<FieldRow>(
      `INSERT INTO booking.medical_field
         (id, organization_id, label, kind, options, service_ids, required, sort_order, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${FIELD_COLUMNS}`,
      [
        id,
        ctx.organizationId,
        f.label,
        f.kind,
        f.options === null ? null : JSON.stringify(f.options),
        f.serviceIds,
        f.required,
        f.sortOrder,
        ctx.userId,
      ],
    );
    await audit(exec, ctx, AuditActions.bookingMedicalFieldCreated, 'booking_medical_field', id, {
      kind: f.kind,
    });
    return toField(rows[0]!);
  });
}

export async function updateMedicalFieldInOrg(
  ctx: TenantContext,
  fieldId: unknown,
  input: FieldInput,
): Promise<MedicalField> {
  await requireMedical(ctx);
  const id = requireId(fieldId);
  const f = validateField(input);
  return withBookingTx(ctx.organizationId, async (client, exec) => {
    const { rows } = await client.query<FieldRow>(
      `UPDATE booking.medical_field
          SET label = $2, kind = $3, options = $4, service_ids = $5, required = $6, sort_order = $7
        WHERE id = $1 RETURNING ${FIELD_COLUMNS}`,
      [
        id,
        f.label,
        f.kind,
        f.options === null ? null : JSON.stringify(f.options),
        f.serviceIds,
        f.required,
        f.sortOrder,
      ],
    );
    if (!rows[0]) throw new ResourceNotFound();
    await audit(exec, ctx, AuditActions.bookingMedicalFieldUpdated, 'booking_medical_field', id, {
      kind: f.kind,
    });
    return toField(rows[0]);
  });
}

export async function archiveMedicalFieldInOrg(
  ctx: TenantContext,
  fieldId: unknown,
): Promise<MedicalField> {
  await requireMedical(ctx);
  const id = requireId(fieldId);
  return withBookingTx(ctx.organizationId, async (client, exec) => {
    const { rows } = await client.query<FieldRow>(
      `UPDATE booking.medical_field SET archived_at = COALESCE(archived_at, now()),
              archived_by_user_id = COALESCE(archived_by_user_id, $2)
        WHERE id = $1 RETURNING ${FIELD_COLUMNS}`,
      [id, ctx.userId],
    );
    if (!rows[0]) throw new ResourceNotFound();
    await audit(
      exec,
      ctx,
      AuditActions.bookingMedicalFieldArchived,
      'booking_medical_field',
      id,
      {},
    );
    return toField(rows[0]);
  });
}

// ── the consent and the answers (booking:medical) ───────────────────────────────────────────

async function activeConsent(client: PoolClient, clientId: string): Promise<MedicalConsent | null> {
  const { rows } = await client.query<{
    text_version: string;
    given_at: Date;
    source: 'team' | 'public';
  }>(
    `SELECT text_version, given_at, source FROM booking.medical_consent
      WHERE client_id = $1 AND withdrawn_at IS NULL`,
    [clientId],
  );
  return rows[0]
    ? { textVersion: rows[0].text_version, givenAt: rows[0].given_at, source: rows[0].source }
    : null;
}

async function requireLiveClient(client: PoolClient, clientId: string) {
  const { rows } = await client.query<{
    erased_at: Date | null;
    merged_into_client_id: string | null;
  }>(`SELECT erased_at, merged_into_client_id FROM booking.client WHERE id = $1 FOR UPDATE`, [
    clientId,
  ]);
  if (!rows[0]) throw new ResourceNotFound();
  if (rows[0].erased_at) throw new Conflict('client_erased');
  if (rows[0].merged_into_client_id) throw new Conflict('client_merged');
}

/** The client's consent, recorded at the salon (the version of the text shown). */
export async function recordMedicalConsentInOrg(
  ctx: TenantContext,
  params: { clientId: unknown; textVersion: unknown },
): Promise<MedicalConsent> {
  await requireMedical(ctx);
  const clientId = requireId(params.clientId);
  if (
    typeof params.textVersion !== 'string' ||
    params.textVersion.trim().length < 1 ||
    params.textVersion.trim().length > 32
  ) {
    throw new InvalidInput('textVersion', 'invalid');
  }
  const textVersion = params.textVersion.trim();
  return withBookingTx(ctx.organizationId, async (client, exec) => {
    await requireLiveClient(client, clientId);
    const current = await activeConsent(client, clientId);
    if (current) {
      if (current.textVersion === textVersion) return current;
      // a new version of the text: the old consent closes, the new one is recorded
      await client.query(
        `UPDATE booking.medical_consent SET withdrawn_at = now(), withdrawn_by = 'business',
                withdrawn_by_user_id = $2 WHERE client_id = $1 AND withdrawn_at IS NULL`,
        [clientId, ctx.userId],
      );
    }
    await client.query(
      `INSERT INTO booking.medical_consent (id, organization_id, client_id, text_version, source, recorded_by_user_id)
       VALUES ($1, $2, $3, $4, 'team', $5)`,
      [uuidv7(), ctx.organizationId, clientId, textVersion, ctx.userId],
    );
    await audit(exec, ctx, AuditActions.bookingMedicalConsentGiven, 'booking_client', clientId, {
      textVersion,
      source: 'team',
    });
    return (await activeConsent(client, clientId))!;
  });
}

function validAnswer(field: FieldRow, value: unknown): string {
  if (typeof value !== 'string') throw new InvalidInput('answers', 'invalid');
  const v = value.trim();
  if (field.kind === 'yes_no' && v !== 'yes' && v !== 'no')
    throw new InvalidInput('answers', 'invalid');
  if (field.kind === 'choice' && !(field.options ?? []).includes(v))
    throw new InvalidInput('answers', 'invalid');
  if (field.kind === 'text' && (v.length < 1 || v.length > MEDICAL_LIMITS.textAnswer)) {
    throw new InvalidInput('answers', 'invalid');
  }
  return v;
}

/** Saves answers (encrypted); without an active consent nothing is saved (D-B-14). */
export async function saveMedicalAnswersInOrg(
  ctx: TenantContext,
  params: { clientId: unknown; answers: unknown },
): Promise<void> {
  await requireMedical(ctx);
  const clientId = requireId(params.clientId);
  if (
    !Array.isArray(params.answers) ||
    params.answers.length === 0 ||
    params.answers.length > 100
  ) {
    throw new InvalidInput('answers', 'invalid');
  }
  const answers = params.answers as Array<{ fieldId?: unknown; value?: unknown }>;
  if (!answers.every((a) => a && isUuid(a.fieldId))) throw new InvalidInput('answers', 'invalid');
  await withBookingTx(ctx.organizationId, async (client, exec) => {
    await requireLiveClient(client, clientId);
    if (!(await activeConsent(client, clientId))) throw new Conflict('medical_consent_required');
    const ids = answers.map((a) => a.fieldId as string);
    const fields = new Map(
      (
        await client.query<FieldRow>(
          `SELECT ${FIELD_COLUMNS} FROM booking.medical_field WHERE id = ANY($1::uuid[]) AND archived_at IS NULL`,
          [ids],
        )
      ).rows.map((r) => [r.id, r]),
    );
    for (const a of answers) {
      const field = fields.get(a.fieldId as string);
      if (!field) throw new InvalidInput('answers', 'invalid');
      const value = validAnswer(field, a.value);
      const encrypted = encryptAnswer(value, `${clientId}:${field.id}`);
      await client.query(
        `INSERT INTO booking.medical_answer (id, organization_id, client_id, field_id, value_encrypted, updated_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (client_id, field_id) DO UPDATE
           SET value_encrypted = EXCLUDED.value_encrypted, wiped_at = NULL,
               updated_by_user_id = EXCLUDED.updated_by_user_id`,
        [uuidv7(), ctx.organizationId, clientId, field.id, encrypted, ctx.userId],
      );
    }
    // never the answers in the log: which fields only
    await audit(exec, ctx, AuditActions.bookingMedicalAnswersSaved, 'booking_client', clientId, {
      fieldIds: ids,
    });
  });
}

/** The client's answers in clear (booking:medical); every read leaves an audit row. */
export async function getMedicalAnswersInOrg(
  ctx: TenantContext,
  clientIdRaw: unknown,
): Promise<MedicalAnswers> {
  await requireMedical(ctx);
  const clientId = requireId(clientIdRaw);
  return withBookingTx(ctx.organizationId, async (client, exec) => {
    const found = (await client.query(`SELECT 1 FROM booking.client WHERE id = $1`, [clientId]))
      .rows[0];
    if (!found) throw new ResourceNotFound();
    const consent = await activeConsent(client, clientId);
    const { rows } = await client.query<{
      field_id: string;
      label: string;
      value_encrypted: Buffer;
    }>(
      `SELECT a.field_id, f.label, a.value_encrypted
         FROM booking.medical_answer a JOIN booking.medical_field f ON f.id = a.field_id
        WHERE a.client_id = $1 AND a.wiped_at IS NULL
        ORDER BY f.sort_order, f.label, f.id`,
      [clientId],
    );
    const answers = rows.map((r) => ({
      fieldId: r.field_id,
      label: r.label,
      value: decryptAnswer(r.value_encrypted, `${clientId}:${r.field_id}`),
    }));
    await audit(exec, ctx, AuditActions.bookingMedicalRead, 'booking_client', clientId, {
      fields: answers.length,
    });
    return { consent, answers };
  });
}

/** „Retrage consimțământul” (by the salon): the consent closes, the answers are wiped. */
export async function withdrawMedicalConsentInOrg(
  ctx: TenantContext,
  clientIdRaw: unknown,
): Promise<void> {
  await requireMedical(ctx);
  const clientId = requireId(clientIdRaw);
  await withBookingTx(ctx.organizationId, async (client, exec) => {
    const found = (
      await client.query(`SELECT 1 FROM booking.client WHERE id = $1 FOR UPDATE`, [clientId])
    ).rows[0];
    if (!found) throw new ResourceNotFound();
    const closed = await client.query(
      `UPDATE booking.medical_consent SET withdrawn_at = now(), withdrawn_by = 'business',
              withdrawn_by_user_id = $2 WHERE client_id = $1 AND withdrawn_at IS NULL`,
      [clientId, ctx.userId],
    );
    const wiped = await client.query(
      `UPDATE booking.medical_answer SET value_encrypted = NULL, wiped_at = now(), updated_by_user_id = $2
        WHERE client_id = $1 AND wiped_at IS NULL`,
      [clientId, ctx.userId],
    );
    if (closed.rowCount || wiped.rowCount) {
      await audit(
        exec,
        ctx,
        AuditActions.bookingMedicalConsentWithdrawn,
        'booking_client',
        clientId,
        {
          by: 'business',
          answersWiped: wiped.rowCount ?? 0,
        },
      );
    }
  });
}
