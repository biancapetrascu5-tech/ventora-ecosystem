import type { PoolClient } from 'pg';
import type { TenantContext } from '@ventora/access';
import { AuditActions, appendAuditEventInTx, type AuditSqlExecutor } from '@ventora/audit';
import { uuidv7 } from '@ventora/db-kit';
import { Conflict, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { withCrmTx } from './db';
import { LIMITS, optionalBoolean, requireId, requiredText } from './validation';

/*
 * Lot CR.3 — the business's own fields (design S132, „Câmpuri proprii”; checklist: „Câmpuri
 * personalizate pentru contacte și companii”). Managed with crm:settings.
 *
 * - At most 30 active fields per business (S132); the count runs under a transaction lock on the
 *   business, so two parallel creations cannot pass 30.
 * - The type is locked once the field has values on a contact or a company (S132).
 * - „Șterge” moves the field to a 30-day bin with its values (S132): its values are hidden and no
 *   longer validated; restoring within 30 days brings them back.
 * - A value is validated against the definition on every write (validateCustomValues): text up to
 *   500 characters, a number, an amount in minor units with RON / EUR, a date, one of the list
 *   options, yes / no. Required fields are checked when a contact or a company is created by hand,
 *   never on old or EasyBook contacts (S132).
 * - No field for medical data: the settings screen says so (S132); nothing here can enforce it.
 */

export const CUSTOM_FIELD_LIMITS = {
  active: 30,
  name: 60,
  options: 50,
  optionLength: 80,
  text: 500,
  amountMaxMinor: 1_000_000_000,
} as const;

export const FIELD_TYPES = ['text', 'number', 'amount', 'date', 'list', 'boolean'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
export const FIELD_TARGETS = ['contact', 'company', 'lead', 'deal'] as const;
export type FieldTarget = (typeof FIELD_TARGETS)[number];

export type CustomField = {
  id: string;
  name: string;
  type: FieldType;
  options: string[] | null;
  appliesTo: FieldTarget[];
  isRequired: boolean;
  showInList: boolean;
  inImport: boolean;
  sortOrder: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** An amount: minor units (bani / cents) and the currency. */
export type AmountValue = { minor: number; currency: 'RON' | 'EUR' };
export type CustomValue = string | number | boolean | AmountValue;
export type CustomValues = Record<string, CustomValue>;

type FieldRow = {
  id: string;
  name: string;
  field_type: FieldType;
  options: string[] | null;
  applies_to: FieldTarget[];
  is_required: boolean;
  show_in_list: boolean;
  in_import: boolean;
  sort_order: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

const COLUMNS = `id, name, field_type, options, applies_to, is_required, show_in_list, in_import,
  sort_order, deleted_at, created_at, updated_at`;

function toField(r: FieldRow): CustomField {
  return {
    id: r.id,
    name: r.name,
    type: r.field_type,
    options: r.options,
    appliesTo: r.applies_to,
    isRequired: r.is_required,
    showInList: r.show_in_list,
    inImport: r.in_import,
    sortOrder: r.sort_order,
    deletedAt: r.deleted_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function audit(
  exec: AuditSqlExecutor,
  ctx: TenantContext,
  action: string,
  targetId: string,
  metadata: Record<string, unknown>,
) {
  return appendAuditEventInTx(exec, {
    category: 'crm',
    action,
    outcome: 'success',
    actorType: 'user',
    actorId: ctx.userId,
    organizationId: ctx.organizationId,
    targetType: 'crm_custom_field',
    targetId,
    metadata,
  });
}

function normalizeType(value: unknown): FieldType {
  if (typeof value !== 'string' || !(FIELD_TYPES as readonly string[]).includes(value)) {
    throw new InvalidInput('type', 'invalid');
  }
  return value as FieldType;
}

function normalizeTargets(value: unknown): FieldTarget[] {
  if (!Array.isArray(value) || value.length === 0) throw new InvalidInput('appliesTo', 'required');
  const out = [...new Set(value)];
  for (const t of out) {
    if (!(FIELD_TARGETS as readonly unknown[]).includes(t))
      throw new InvalidInput('appliesTo', 'invalid');
  }
  return out as FieldTarget[];
}

function normalizeOptions(type: FieldType, value: unknown): string[] | null {
  if (type !== 'list') {
    if (value !== undefined && value !== null) throw new InvalidInput('options', 'invalid');
    return null;
  }
  if (!Array.isArray(value) || value.length === 0) throw new InvalidInput('options', 'required');
  if (value.length > CUSTOM_FIELD_LIMITS.options) throw new InvalidInput('options', 'too_many');
  const out: string[] = [];
  for (const o of value) {
    if (typeof o !== 'string') throw new InvalidInput('options', 'invalid');
    const v = o.trim().replace(/\s+/g, ' ');
    if (!v || v.length > CUSTOM_FIELD_LIMITS.optionLength)
      throw new InvalidInput('options', 'invalid');
    if (out.some((x) => x.toLocaleLowerCase('ro') === v.toLocaleLowerCase('ro'))) {
      throw new InvalidInput('options', 'duplicate');
    }
    out.push(v);
  }
  return out;
}

function normalizeSortOrder(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 10_000) {
    throw new InvalidInput('sortOrder', 'invalid');
  }
  return value as number;
}

function mapName(err: unknown): never {
  if (
    (err as { code?: string }).code === '23505' &&
    String((err as { constraint?: string }).constraint) === 'custom_field_active_name_key'
  ) {
    throw new Conflict('custom_field_name_taken');
  }
  throw err;
}

/** The fields of a business, in their order; with `includeDeleted` the bin too. */
export async function listCustomFieldsInOrg(
  ctx: TenantContext,
  opts: { includeDeleted?: boolean; target?: FieldTarget } = {},
): Promise<CustomField[]> {
  return withCrmTx(
    ctx.organizationId,
    async (client) => {
      const where = [opts.includeDeleted ? 'TRUE' : 'deleted_at IS NULL'];
      const args: unknown[] = [];
      if (opts.target) {
        args.push(opts.target);
        where.push(`$1 = ANY(applies_to)`);
      }
      const { rows } = await client.query<FieldRow>(
        `SELECT ${COLUMNS} FROM crm.custom_field WHERE ${where.join(' AND ')}
          ORDER BY sort_order, lower(name), id`,
        args,
      );
      return rows.map(toField);
    },
    true,
  );
}

/** Serializes the writes of a business's field list (the 30 limit, two parallel requests). */
async function lockFields(client: PoolClient, organizationId: string) {
  await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
    `crm.custom_field:${organizationId}`,
  ]);
}

async function countActive(client: PoolClient): Promise<number> {
  const { rows } = await client.query<{ n: string }>(
    `SELECT count(*) AS n FROM crm.custom_field WHERE deleted_at IS NULL`,
  );
  return Number(rows[0]?.n ?? 0);
}

export async function createCustomFieldInOrg(
  ctx: TenantContext,
  input: {
    name?: unknown;
    type?: unknown;
    options?: unknown;
    appliesTo?: unknown;
    isRequired?: unknown;
    showInList?: unknown;
    inImport?: unknown;
    sortOrder?: unknown;
  },
): Promise<CustomField> {
  const name = requiredText('name', input.name, CUSTOM_FIELD_LIMITS.name);
  const type = normalizeType(input.type);
  const options = normalizeOptions(type, input.options);
  const appliesTo = normalizeTargets(input.appliesTo);
  const isRequired = optionalBoolean('isRequired', input.isRequired) ?? false;
  const showInList = optionalBoolean('showInList', input.showInList) ?? false;
  const inImport = optionalBoolean('inImport', input.inImport) ?? true;
  const id = uuidv7();
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    await lockFields(client, ctx.organizationId);
    const active = await countActive(client);
    if (active >= CUSTOM_FIELD_LIMITS.active) throw new Conflict('custom_fields_limit');
    const sortOrder = normalizeSortOrder(input.sortOrder) ?? active;
    const { rows } = await client
      .query<FieldRow>(
        `INSERT INTO crm.custom_field
           (id, organization_id, name, field_type, options, applies_to, is_required, show_in_list,
            in_import, sort_order, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::text[], $7, $8, $9, $10, $11)
         RETURNING ${COLUMNS}`,
        [
          id,
          ctx.organizationId,
          name,
          type,
          options ? JSON.stringify(options) : null,
          appliesTo,
          isRequired,
          showInList,
          inImport,
          sortOrder,
          ctx.userId,
        ],
      )
      .catch(mapName);
    await audit(exec, ctx, AuditActions.crmCustomFieldCreated, id, { type, appliesTo });
    return toField(rows[0]!);
  });
}

async function readField(client: PoolClient, id: string, lock = false): Promise<FieldRow> {
  const { rows } = await client.query<FieldRow>(
    `SELECT ${COLUMNS} FROM crm.custom_field WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
  if (!rows[0]) throw new ResourceNotFound();
  return rows[0];
}

/** Whether any contact or company holds a value for the field (the type is then locked). */
async function hasValues(client: PoolClient, id: string): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT 1 FROM crm.contact WHERE custom_values ? $1
     UNION ALL SELECT 1 FROM crm.company WHERE custom_values ? $1 LIMIT 1`,
    [id],
  );
  return rows.length > 0;
}

export async function updateCustomFieldInOrg(
  ctx: TenantContext,
  fieldId: string,
  input: {
    name?: unknown;
    type?: unknown;
    options?: unknown;
    appliesTo?: unknown;
    isRequired?: unknown;
    showInList?: unknown;
    inImport?: unknown;
    sortOrder?: unknown;
  },
): Promise<CustomField> {
  const id = requireId('fieldId', fieldId);
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const before = await readField(client, id, true);
    if (before.deleted_at) throw new Conflict('custom_field_deleted');
    const type = input.type === undefined ? before.field_type : normalizeType(input.type);
    if (type !== before.field_type && (await hasValues(client, id))) {
      throw new Conflict('custom_field_type_locked');
    }
    const options =
      input.options === undefined && type === before.field_type
        ? before.options
        : normalizeOptions(type, input.options);
    // a list option removed while contacts hold it would leave invalid values
    if (type === 'list' && before.field_type === 'list' && before.options && options) {
      const removed = before.options.filter((o) => !options.includes(o));
      for (const o of removed) {
        const used = await client.query(
          `SELECT 1 FROM crm.contact WHERE custom_values @> jsonb_build_object($1::text, $2::text)
           UNION ALL SELECT 1 FROM crm.company WHERE custom_values @> jsonb_build_object($1::text, $2::text) LIMIT 1`,
          [id, o],
        );
        if (used.rows[0]) throw new Conflict('custom_field_option_in_use');
      }
    }
    const patch: Record<string, unknown> = {
      name:
        input.name === undefined
          ? undefined
          : requiredText('name', input.name, CUSTOM_FIELD_LIMITS.name),
      field_type: type === before.field_type ? undefined : type,
      options:
        JSON.stringify(options) === JSON.stringify(before.options)
          ? undefined
          : options === null
            ? null
            : JSON.stringify(options),
      applies_to: input.appliesTo === undefined ? undefined : normalizeTargets(input.appliesTo),
      is_required: optionalBoolean('isRequired', input.isRequired),
      show_in_list: optionalBoolean('showInList', input.showInList),
      in_import: optionalBoolean('inImport', input.inImport),
      sort_order: normalizeSortOrder(input.sortOrder),
    };
    const fields = Object.keys(patch).filter((k) => patch[k] !== undefined);
    if (fields.length === 0) return toField(before);
    const cast = (f: string, i: number) =>
      f === 'options' ? `$${i}::jsonb` : f === 'applies_to' ? `$${i}::text[]` : `$${i}`;
    const { rows } = await client
      .query<FieldRow>(
        `UPDATE crm.custom_field SET ${fields.map((f, i) => `${f} = ${cast(f, i + 2)}`).join(', ')}
          WHERE id = $1 RETURNING ${COLUMNS}`,
        [id, ...fields.map((f) => patch[f])],
      )
      .catch(mapName);
    await audit(exec, ctx, AuditActions.crmCustomFieldUpdated, id, { fields });
    return toField(rows[0]!);
  });
}

/** Into the 30-day bin with its values (S132). */
export async function deleteCustomFieldInOrg(
  ctx: TenantContext,
  fieldId: string,
): Promise<CustomField> {
  const id = requireId('fieldId', fieldId);
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const before = await readField(client, id, true);
    if (before.deleted_at) throw new Conflict('custom_field_deleted');
    const { rows } = await client.query<FieldRow>(
      `UPDATE crm.custom_field SET deleted_at = now(), deleted_by_user_id = $2 WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id, ctx.userId],
    );
    await audit(exec, ctx, AuditActions.crmCustomFieldDeleted, id, {});
    return toField(rows[0]!);
  });
}

/** Back from the bin within 30 days, if the limit of 30 and its name allow. */
export async function restoreCustomFieldInOrg(
  ctx: TenantContext,
  fieldId: string,
): Promise<CustomField> {
  const id = requireId('fieldId', fieldId);
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    await lockFields(client, ctx.organizationId);
    const before = await readField(client, id, true);
    if (!before.deleted_at) throw new Conflict('custom_field_not_deleted');
    if (Date.now() - before.deleted_at.getTime() > LIMITS.binDays * 86_400_000) {
      throw new Conflict('bin_expired');
    }
    if ((await countActive(client)) >= CUSTOM_FIELD_LIMITS.active) {
      throw new Conflict('custom_fields_limit');
    }
    const { rows } = await client
      .query<FieldRow>(
        `UPDATE crm.custom_field SET deleted_at = NULL, deleted_by_user_id = NULL WHERE id = $1
         RETURNING ${COLUMNS}`,
        [id],
      )
      .catch(mapName);
    await audit(exec, ctx, AuditActions.crmCustomFieldRestored, id, {});
    return toField(rows[0]!);
  });
}

// ── the values ─────────────────────────────────────────────────────────────────────────────────

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function validateValue(field: FieldRow, raw: unknown): CustomValue {
  const bad = () => new InvalidInput(`customValues.${field.id}`, 'invalid');
  switch (field.field_type) {
    case 'text': {
      if (typeof raw !== 'string') throw bad();
      const v = raw.trim();
      if (!v) throw bad();
      if (v.length > CUSTOM_FIELD_LIMITS.text) {
        throw new InvalidInput(`customValues.${field.id}`, 'too_long');
      }
      return v;
    }
    case 'number':
      if (typeof raw !== 'number' || !Number.isFinite(raw) || Math.abs(raw) > 1e12) throw bad();
      return raw;
    case 'amount': {
      const a = raw as { minor?: unknown; currency?: unknown } | null;
      if (
        !a ||
        typeof a !== 'object' ||
        !Number.isInteger(a.minor) ||
        Math.abs(a.minor as number) > CUSTOM_FIELD_LIMITS.amountMaxMinor ||
        (a.currency !== 'RON' && a.currency !== 'EUR')
      ) {
        throw bad();
      }
      return { minor: a.minor as number, currency: a.currency };
    }
    case 'date': {
      if (typeof raw !== 'string') throw bad();
      const m = DATE_RE.exec(raw);
      if (!m) throw bad();
      const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
      if (
        d.getUTCMonth() !== Number(m[2]) - 1 ||
        d.getUTCDate() !== Number(m[3]) ||
        Number(m[1]) < 1900
      ) {
        throw bad();
      }
      return raw;
    }
    case 'list':
      if (typeof raw !== 'string' || !(field.options ?? []).includes(raw)) throw bad();
      return raw;
    case 'boolean':
      if (typeof raw !== 'boolean') throw bad();
      return raw;
  }
}

/**
 * Validates the values sent for a contact or a company against the active fields of `target`:
 * { fieldId: value | null }; null clears the value. Returns the jsonb to merge (`set`) and the
 * keys to remove (`unset`). `required`: the required fields must have a value after the write
 * (a creation by hand); `current` is the row's values before.
 */
export async function validateCustomValues(
  client: PoolClient,
  target: 'contact' | 'company',
  raw: unknown,
  opts: { current?: CustomValues; required?: boolean } = {},
): Promise<{ set: CustomValues; unset: string[]; fields: string[] }> {
  if (raw === undefined && !opts.required) return { set: {}, unset: [], fields: [] };
  const input = (raw ?? {}) as Record<string, unknown>;
  if (typeof input !== 'object' || Array.isArray(input))
    throw new InvalidInput('customValues', 'invalid');
  const { rows } = await client.query<FieldRow>(
    `SELECT ${COLUMNS} FROM crm.custom_field WHERE deleted_at IS NULL AND $1 = ANY(applies_to)`,
    [target],
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const set: CustomValues = {};
  const unset: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    const field = byId.get(key);
    if (!field) throw new InvalidInput(`customValues.${key}`, 'unknown_field');
    if (value === null || value === '') unset.push(key);
    else set[key] = validateValue(field, value);
  }
  if (opts.required) {
    const after = { ...(opts.current ?? {}), ...set };
    for (const k of unset) delete after[k];
    for (const f of rows) {
      if (f.is_required && after[f.id] === undefined) {
        throw new InvalidInput(`customValues.${f.id}`, 'required');
      }
    }
  }
  return { set, unset, fields: [...Object.keys(set), ...unset] };
}

/** The values shown: only those of active fields (a field in the bin hides its values). */
export function visibleValues(values: CustomValues, active: ReadonlySet<string>): CustomValues {
  const out: CustomValues = {};
  for (const [k, v] of Object.entries(values ?? {})) if (active.has(k)) out[k] = v;
  return out;
}
