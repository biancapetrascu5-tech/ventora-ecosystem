import type { PoolClient } from 'pg';
import { getMemberApplicationAccess, type TenantContext } from '@ventora/access';
import { AuditActions, appendAuditEventInTx, type AuditSqlExecutor } from '@ventora/audit';
import {
  CrmContactCreatedV1,
  CrmContactDeletedV1,
  CrmContactRestoredV1,
  CrmContactUpdatedV1,
} from '@ventora/contracts';
import { uuidv7, writeOutboxEvent } from '@ventora/db-kit';
import { Conflict, Forbidden, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { commitQuota, freeStockQuota, releaseQuota, reserveQuota } from '@ventora/quota';
import { withCrmTx } from './db';
import { validateCustomValues, type CustomValues } from './custom-fields';
import { rulesSql, type SegmentRule } from './segments';
import {
  LIMITS,
  likePattern,
  normalizeBirthday,
  normalizeEmail,
  normalizeLocale,
  normalizePhone,
  normalizeSource,
  optionalBoolean,
  optionalText,
  page,
  requireId,
  requiredText,
  type ContactSource,
  type Locale,
} from './validation';

/*
 * Lot CR.2 — the contacts of ClientDesk (plans/CRM.md; design S130).
 *
 * - Who sees what (D-CRM-15 = a, S130): with crm:admin (owner, admin, application manager) every
 *   contact; a member the contacts assigned to them and the unassigned ones („Neatribuit”), which
 *   they can take. Another one answers Forbidden („Contactul e atribuit altui membru”).
 * - The quota crm.contacts (stock, D-CRM-4 = a): a contact created here reserves one unit
 *   (operation crm.contact:<id>), the transaction writes it, then the unit is committed; a failed
 *   transaction releases it, a stopped process is settled by the resolver (contactQuotaHeld).
 *   „Șterge” frees the unit; restoring from the bin reserves a new one. A contact from EasyBook
 *   (CR.12) holds none and is never deleted here (S130; a CHECK too).
 * - The basic data of a contact from EasyBook (name, phone, e-mail, language) is read-only here
 *   (D-CRM-1 = a): it changes only in EasyBook.
 * - Audit (category crm) and events (crm.contact.*) in the same transaction, without personal data.
 */

export const CONTACTS_QUOTA_KEY = 'crm.contacts';
export type ContactScope = 'all' | 'own';

/** The basic data of a contact from EasyBook: read-only in ClientDesk (D-CRM-1 = a). */
const EASYBOOK_FIELDS = ['name', 'phone', 'email', 'locale'] as const;

export type Contact = {
  id: string;
  name: string;
  phone: string | null;
  phoneAlt: string | null;
  email: string | null;
  emailAlt: string | null;
  locale: Locale;
  birthday: string | null;
  address: string | null;
  source: ContactSource;
  /** Linked to EasyBook: the basic data is read-only and the contact is never deleted here. */
  fromEasyBook: boolean;
  companyId: string | null;
  companyRole: string | null;
  isCompanyPrimary: boolean;
  ownerUserId: string | null;
  note: string | null;
  /** In the 30-day bin since then; null when active. */
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** CR.3: the business's own fields, { fieldId: value }, only of the active fields. */
  customValues: CustomValues;
  /** CR.4: the tags of the contact. */
  tagIds: string[];
};

export type ContactInput = {
  name?: unknown;
  phone?: unknown;
  phoneAlt?: unknown;
  email?: unknown;
  emailAlt?: unknown;
  locale?: unknown;
  birthday?: unknown;
  address?: unknown;
  note?: unknown;
};

type ContactRow = {
  id: string;
  name: string;
  phone: string | null;
  phone_alt: string | null;
  email: string | null;
  email_alt: string | null;
  locale: Locale;
  birthday: string | null;
  address: string | null;
  source: ContactSource;
  company_id: string | null;
  company_role: string | null;
  is_company_primary: boolean;
  owner_user_id: string | null;
  note: string | null;
  quota_operation_id: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
  custom_values: CustomValues;
  tag_ids: string[];
};

const COLUMNS = `id, name, phone, phone_alt, email, email_alt, locale, to_char(birthday, 'YYYY-MM-DD') AS birthday,
  address, source, company_id, company_role, is_company_primary, owner_user_id, note,
  quota_operation_id, deleted_at, created_at, updated_at, tag_ids,
  (SELECT COALESCE(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
     FROM jsonb_each(contact.custom_values) AS e
    WHERE EXISTS (SELECT 1 FROM crm.custom_field f
                   WHERE f.id::text = e.key AND f.deleted_at IS NULL)) AS custom_values`;

function toContact(r: ContactRow): Contact {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    phoneAlt: r.phone_alt,
    email: r.email,
    emailAlt: r.email_alt,
    locale: r.locale,
    birthday: r.birthday,
    address: r.address,
    source: r.source,
    fromEasyBook: r.source === 'easybook',
    companyId: r.company_id,
    companyRole: r.company_role,
    isCompanyPrimary: r.is_company_primary,
    ownerUserId: r.owner_user_id,
    note: r.note,
    deletedAt: r.deleted_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    customValues: r.custom_values ?? {},
    tagIds: r.tag_ids ?? [],
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
    targetType: 'crm_contact',
    targetId,
    metadata,
  });
}

function emit<T>(
  client: PoolClient,
  ctx: TenantContext,
  def: Parameters<typeof writeOutboxEvent>[2],
  id: string,
  payload: T,
) {
  return writeOutboxEvent(client, 'crm', def, {
    organizationId: ctx.organizationId,
    sourceApp: 'platform',
    resourceId: id,
    payload,
  });
}

function visible(ctx: TenantContext, scope: ContactScope, row: { owner_user_id: string | null }) {
  return scope === 'all' || row.owner_user_id === null || row.owner_user_id === ctx.userId;
}

async function readContact(client: PoolClient, id: string, lock = false): Promise<ContactRow> {
  const { rows } = await client.query<ContactRow>(
    `SELECT ${COLUMNS} FROM crm.contact WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
  if (!rows[0]) throw new ResourceNotFound();
  return rows[0];
}

/** An owner is an active member of the business with access to ClientDesk. */
async function requireOwner(ctx: TenantContext, userId: string): Promise<void> {
  const access = await getMemberApplicationAccess(ctx, userId, 'crm');
  if (access.status !== 'active' || !access.hasAccess) {
    throw new InvalidInput('ownerUserId', 'not_member');
  }
}

/** The owner a person may give: with crm:admin anyone; a member only themselves or nobody. */
async function ownerFor(
  ctx: TenantContext,
  scope: ContactScope,
  value: unknown,
): Promise<string | null> {
  if (value === null) return null;
  const owner = requireId('ownerUserId', value);
  if (scope === 'own' && owner !== ctx.userId) throw new Forbidden();
  if (owner !== ctx.userId) await requireOwner(ctx, owner);
  return owner;
}

function details(input: ContactInput) {
  return {
    phone: normalizePhone('phone', input.phone),
    phoneAlt: normalizePhone('phoneAlt', input.phoneAlt),
    email: normalizeEmail('email', input.email),
    emailAlt: normalizeEmail('emailAlt', input.emailAlt),
    locale: normalizeLocale(input.locale),
    birthday: normalizeBirthday(input.birthday),
    address: optionalText('address', input.address, LIMITS.address),
    note: optionalText('note', input.note, LIMITS.note),
  };
}

/** Makes a contact the „Principal” of its company: the previous one stops being it. */
async function clearPrimary(client: PoolClient, companyId: string, exceptId: string) {
  await client.query(
    `UPDATE crm.contact SET is_company_primary = false
      WHERE company_id = $1 AND is_company_primary AND deleted_at IS NULL AND id <> $2`,
    [companyId, exceptId],
  );
}

/** The trigger contact_guard refused the company (another business's, or in the bin). */
function mapGuard(err: unknown): never {
  if (
    (err as { code?: string }).code === '23514' &&
    /company/.test(String((err as Error).message))
  ) {
    throw new ResourceNotFound();
  }
  throw err;
}

// ── create ─────────────────────────────────────────────────────────────────────────────────────

export async function createContactInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  input: ContactInput & {
    source?: unknown;
    ownerUserId?: unknown;
    companyId?: unknown;
    companyRole?: unknown;
    isCompanyPrimary?: unknown;
    /** CR.3: { fieldId: value }; the required contact fields must be there (S132). */
    customValues?: unknown;
  },
): Promise<Contact> {
  const name = requiredText('name', input.name, LIMITS.name);
  const d = details(input);
  const source = normalizeSource(input.source);
  // the creator by default; null = „Neatribuit”
  const owner =
    input.ownerUserId === undefined ? ctx.userId : await ownerFor(ctx, scope, input.ownerUserId);
  const companyId =
    input.companyId === undefined || input.companyId === null
      ? null
      : requireId('companyId', input.companyId);
  const companyRole = optionalText('companyRole', input.companyRole, LIMITS.companyRole) ?? null;
  const primary = optionalBoolean('isCompanyPrimary', input.isCompanyPrimary) ?? false;
  if (!companyId && (companyRole || primary)) throw new InvalidInput('companyId', 'required');

  const id = uuidv7();
  const operationId = `crm.contact:${id}`;
  // the quota first: at the limit nothing is written (S130: adding and importing stop)
  await reserveQuota(ctx, CONTACTS_QUOTA_KEY, 1, operationId);
  let created: Contact;
  try {
    created = await withCrmTx(ctx.organizationId, async (client, exec) => {
      const custom = await validateCustomValues(client, 'contact', input.customValues, {
        required: true,
      });
      if (companyId && primary) await clearPrimary(client, companyId, id);
      const { rows } = await client
        .query<ContactRow>(
          `INSERT INTO crm.contact
             (id, organization_id, name, phone, phone_alt, email, email_alt, locale, birthday,
              address, source, company_id, company_role, is_company_primary, owner_user_id, note,
              quota_operation_id, created_by_user_id, custom_values)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb)
           RETURNING ${COLUMNS}`,
          [
            id,
            ctx.organizationId,
            name,
            d.phone ?? null,
            d.phoneAlt ?? null,
            d.email ?? null,
            d.emailAlt ?? null,
            d.locale ?? 'ro',
            d.birthday ?? null,
            d.address ?? null,
            source,
            companyId,
            companyRole,
            primary,
            owner,
            d.note ?? null,
            operationId,
            ctx.userId,
            JSON.stringify(custom.set),
          ],
        )
        .catch(mapGuard);
      await audit(exec, ctx, AuditActions.crmContactCreated, id, {
        source,
        companyId,
        ownerUserId: owner,
        customFieldIds: Object.keys(custom.set),
      });
      await emit(client, ctx, CrmContactCreatedV1, id, {
        contactId: id,
        source,
        companyId,
        ownerUserId: owner,
      });
      return toContact(rows[0]!);
    });
  } catch (err) {
    await releaseQuota(ctx, operationId).catch(() => {});
    throw err;
  }
  // a failed commit is settled by the reconciliation (the contact exists → committed)
  await commitQuota(ctx, operationId).catch(() => {});
  return created;
}

// ── update ─────────────────────────────────────────────────────────────────────────────────────

/** Changes the data of the contact; only the fields sent. */
export async function updateContactInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  contactId: string,
  input: ContactInput,
): Promise<Contact> {
  const id = requireId('contactId', contactId);
  const name = input.name === undefined ? undefined : requiredText('name', input.name, LIMITS.name);
  const d = details(input);
  const patch: Record<string, unknown> = {
    name,
    phone: d.phone,
    phone_alt: d.phoneAlt,
    email: d.email,
    email_alt: d.emailAlt,
    locale: d.locale,
    birthday: d.birthday,
    address: d.address,
    note: d.note,
  };
  const fields = Object.keys(patch).filter((k) => patch[k] !== undefined);
  if (fields.length === 0) throw new InvalidInput('contact', 'required');

  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const before = await readContact(client, id, true);
    if (!visible(ctx, scope, before)) throw new Forbidden();
    if (before.deleted_at) throw new Conflict('contact_deleted');
    if (before.source === 'easybook') {
      const locked = EASYBOOK_FIELDS.filter((f) => patch[f] !== undefined);
      if (locked.length > 0) throw new Conflict('easybook_read_only');
    }
    const sets = fields.map((f, i) =>
      f === 'birthday' ? `${f} = $${i + 2}::date` : `${f} = $${i + 2}`,
    );
    const { rows } = await client.query<ContactRow>(
      `UPDATE crm.contact SET ${sets.join(', ')} WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, ...fields.map((f) => patch[f])],
    );
    await audit(exec, ctx, AuditActions.crmContactUpdated, id, { fields });
    await emit(client, ctx, CrmContactUpdatedV1, id, { contactId: id, fields });
    return toContact(rows[0]!);
  });
}

/**
 * „Responsabil”: with crm:admin to any member with access to ClientDesk, or nobody; a member only
 * takes an unassigned contact („Ia contactul”, D-CRM-15 / S130).
 */
export async function assignContactInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  contactId: string,
  ownerUserId: unknown,
): Promise<Contact> {
  const id = requireId('contactId', contactId);
  const owner = ownerUserId === null ? null : requireId('ownerUserId', ownerUserId);
  if (scope === 'all' && owner && owner !== ctx.userId) await requireOwner(ctx, owner);
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const before = await readContact(client, id, true);
    if (before.deleted_at) throw new Conflict('contact_deleted');
    if (scope === 'own' && !(before.owner_user_id === null && owner === ctx.userId)) {
      throw new Forbidden();
    }
    if (before.owner_user_id === owner) return toContact(before);
    const { rows } = await client.query<ContactRow>(
      `UPDATE crm.contact SET owner_user_id = $2 WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, owner],
    );
    await audit(exec, ctx, AuditActions.crmContactOwnerChanged, id, {
      from: before.owner_user_id,
      to: owner,
    });
    await emit(client, ctx, CrmContactUpdatedV1, id, { contactId: id, fields: ['owner_user_id'] });
    return toContact(rows[0]!);
  });
}

/**
 * The company of the contact (S130: one company per contact): another one moves it, the history
 * stays; null takes it out of its company. „Principal” takes the mark from the previous one.
 */
export async function setContactCompanyInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  contactId: string,
  input: { companyId: unknown; companyRole?: unknown; isCompanyPrimary?: unknown },
): Promise<Contact> {
  const id = requireId('contactId', contactId);
  const companyId = input.companyId === null ? null : requireId('companyId', input.companyId);
  const companyRole = optionalText('companyRole', input.companyRole, LIMITS.companyRole) ?? null;
  const primary = optionalBoolean('isCompanyPrimary', input.isCompanyPrimary) ?? false;
  if (!companyId && (companyRole || primary)) throw new InvalidInput('companyId', 'required');
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const before = await readContact(client, id, true);
    if (!visible(ctx, scope, before)) throw new Forbidden();
    if (before.deleted_at) throw new Conflict('contact_deleted');
    if (companyId && primary) await clearPrimary(client, companyId, id);
    const { rows } = await client
      .query<ContactRow>(
        `UPDATE crm.contact SET company_id = $2, company_role = $3, is_company_primary = $4
          WHERE id = $1 RETURNING ${COLUMNS}`,
        [id, companyId, companyRole, primary],
      )
      .catch(mapGuard);
    const fields = ['company_id', 'company_role', 'is_company_primary'];
    await audit(exec, ctx, AuditActions.crmContactUpdated, id, {
      fields,
      fromCompanyId: before.company_id,
      toCompanyId: companyId,
    });
    await emit(client, ctx, CrmContactUpdatedV1, id, { contactId: id, fields });
    return toContact(rows[0]!);
  });
}

/**
 * CR.3: the business's own fields of a contact, { fieldId: value | null } (null clears). Allowed on
 * an EasyBook contact too (ClientDesk data, D-CRM-1). A required field cannot be cleared; it is not
 * demanded on contacts that never had it (old or EasyBook contacts, S132).
 */
export async function setContactCustomValuesInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  contactId: string,
  values: unknown,
): Promise<Contact> {
  const id = requireId('contactId', contactId);
  if (values === undefined || values === null) throw new InvalidInput('values', 'required');
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const before = await readContact(client, id, true);
    if (!visible(ctx, scope, before)) throw new Forbidden();
    if (before.deleted_at) throw new Conflict('contact_deleted');
    const custom = await validateCustomValues(client, 'contact', values);
    if (custom.fields.length === 0) return toContact(before);
    const required = await client.query<{ id: string }>(
      `SELECT id FROM crm.custom_field
        WHERE deleted_at IS NULL AND is_required AND 'contact' = ANY(applies_to) AND id::text = ANY($1::text[])`,
      [custom.unset],
    );
    if (required.rows[0]) throw new InvalidInput(`customValues.${required.rows[0].id}`, 'required');
    const { rows } = await client.query<ContactRow>(
      `UPDATE crm.contact SET custom_values = (custom_values || $2::jsonb) - $3::text[]
        WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, JSON.stringify(custom.set), custom.unset],
    );
    await audit(exec, ctx, AuditActions.crmContactUpdated, id, {
      fields: ['custom_values'],
      customFieldIds: custom.fields,
    });
    await emit(client, ctx, CrmContactUpdatedV1, id, { contactId: id, fields: ['custom_values'] });
    return toContact(rows[0]!);
  });
}

// ── the bin ────────────────────────────────────────────────────────────────────────────────────

/** „Șterge”: into the 30-day bin (S130). A contact from EasyBook is never deleted here. */
export async function deleteContactInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  contactId: string,
): Promise<Contact> {
  const id = requireId('contactId', contactId);
  const current = await withCrmTx(ctx.organizationId, (client) => readContact(client, id), true);
  if (!visible(ctx, scope, current)) throw new Forbidden();
  if (current.source === 'easybook') throw new Conflict('easybook_contact');
  if (current.deleted_at) throw new Conflict('contact_deleted');
  // the unit first, idempotent on the reservation of this life of the contact (as workflows)
  if (current.quota_operation_id) {
    await freeStockQuota(
      ctx,
      CONTACTS_QUOTA_KEY,
      1,
      `crm.contact.delete:${current.quota_operation_id}`,
    );
  }
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const before = await readContact(client, id, true);
    if (before.deleted_at) throw new Conflict('contact_deleted');
    const { rows } = await client.query<ContactRow>(
      `UPDATE crm.contact SET deleted_at = now(), deleted_by_user_id = $2, is_company_primary = false
        WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, ctx.userId],
    );
    await audit(exec, ctx, AuditActions.crmContactDeleted, id, {});
    await emit(client, ctx, CrmContactDeletedV1, id, { contactId: id });
    return toContact(rows[0]!);
  });
}

/**
 * Back from the bin, within 30 days. It takes a new unit of crm.contacts (QuotaExceeded at the
 * limit). Its company, if it went to the bin meanwhile, is left out.
 */
export async function restoreContactInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  contactId: string,
): Promise<Contact> {
  const id = requireId('contactId', contactId);
  const current = await withCrmTx(ctx.organizationId, (client) => readContact(client, id), true);
  if (!visible(ctx, scope, current)) throw new Forbidden();
  if (!current.deleted_at) throw new Conflict('contact_not_deleted');
  if (Date.now() - current.deleted_at.getTime() > LIMITS.binDays * 86_400_000) {
    throw new Conflict('bin_expired');
  }
  const operationId = `crm.contact.restore:${id}:${uuidv7()}`;
  await reserveQuota(ctx, CONTACTS_QUOTA_KEY, 1, operationId);
  let restored: Contact;
  try {
    restored = await withCrmTx(ctx.organizationId, async (client, exec) => {
      const before = await readContact(client, id, true);
      if (!before.deleted_at) throw new Conflict('contact_not_deleted');
      let companyId = before.company_id;
      if (companyId) {
        const active = await client.query(
          `SELECT 1 FROM crm.company WHERE id = $1 AND deleted_at IS NULL FOR SHARE`,
          [companyId],
        );
        if (!active.rows[0]) companyId = null;
      }
      const { rows } = await client.query<ContactRow>(
        `UPDATE crm.contact
            SET deleted_at = NULL, deleted_by_user_id = NULL, quota_operation_id = $2,
                company_id = $3, company_role = CASE WHEN $3::uuid IS NULL THEN NULL ELSE company_role END,
                is_company_primary = false
          WHERE id = $1 RETURNING ${COLUMNS}`,
        [id, operationId, companyId],
      );
      await audit(exec, ctx, AuditActions.crmContactRestored, id, {
        companyRemoved: companyId !== before.company_id,
      });
      await emit(client, ctx, CrmContactRestoredV1, id, { contactId: id });
      return toContact(rows[0]!);
    });
  } catch (err) {
    await releaseQuota(ctx, operationId).catch(() => {});
    throw err;
  }
  await commitQuota(ctx, operationId).catch(() => {});
  return restored;
}

// ── read ───────────────────────────────────────────────────────────────────────────────────────

export async function getContactInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  contactId: string,
): Promise<Contact> {
  const id = requireId('contactId', contactId);
  const row = await withCrmTx(ctx.organizationId, (client) => readContact(client, id), true);
  if (!visible(ctx, scope, row)) throw new Forbidden();
  return toContact(row);
}

export type ListContactsParams = {
  /** Name, phone or e-mail. */
  q?: unknown;
  /** 'any' (default), 'me', 'unassigned' or a member's id. */
  owner?: unknown;
  companyId?: unknown;
  /** true: the bin (S130). */
  deleted?: unknown;
  /** CR.3: { fieldId: value } — contacts whose own field has exactly that value. */
  custom?: unknown;
  /** CR.4: the contacts carrying this tag. */
  tagId?: unknown;
  /** CR.4: the contacts a segment matches now (its rules; a member still sees only theirs). */
  segmentId?: unknown;
  limit?: unknown;
  offset?: unknown;
};

export async function listContactsInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  params: ListContactsParams,
): Promise<{ items: Contact[]; total: number }> {
  const { limit, offset } = page(params);
  const where: string[] = [];
  const args: unknown[] = [];
  const arg = (v: unknown) => {
    args.push(v);
    return `$${args.length}`;
  };
  where.push(params.deleted === true ? 'deleted_at IS NOT NULL' : 'deleted_at IS NULL');
  if (scope === 'own') where.push(`(owner_user_id IS NULL OR owner_user_id = ${arg(ctx.userId)})`);
  if (params.owner !== undefined && params.owner !== 'any') {
    if (params.owner === 'me') where.push(`owner_user_id = ${arg(ctx.userId)}`);
    else if (params.owner === 'unassigned') where.push('owner_user_id IS NULL');
    else where.push(`owner_user_id = ${arg(requireId('owner', params.owner))}`);
  }
  if (params.custom !== undefined && params.custom !== null) {
    const c = params.custom as Record<string, unknown>;
    if (typeof c !== 'object' || Array.isArray(c)) throw new InvalidInput('custom', 'invalid');
    const filter: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(c)) {
      requireId('custom', k);
      if (!['string', 'number', 'boolean'].includes(typeof v))
        throw new InvalidInput('custom', 'invalid');
      filter[k] = v;
    }
    if (Object.keys(filter).length > 0)
      where.push(`custom_values @> ${arg(JSON.stringify(filter))}::jsonb`);
  }
  if (params.tagId !== undefined)
    where.push(`${arg(requireId('tagId', params.tagId))}::uuid = ANY(tag_ids)`);
  if (params.companyId !== undefined)
    where.push(`company_id = ${arg(requireId('companyId', params.companyId))}`);
  if (params.q !== undefined && params.q !== null && params.q !== '') {
    if (typeof params.q !== 'string' || params.q.length > 100)
      throw new InvalidInput('q', 'invalid');
    const q = params.q.trim();
    if (q) {
      const text = arg(likePattern(q.toLowerCase()));
      const digits = q.replace(/[^0-9]/g, '');
      const phone =
        digits.length >= 3
          ? ` OR phone LIKE ${arg(likePattern(digits))} OR phone_alt LIKE $${args.length}`
          : '';
      where.push(
        `(lower(name) LIKE ${text} OR email LIKE ${text} OR email_alt LIKE ${text}${phone})`,
      );
    }
  }
  const segmentId =
    params.segmentId === undefined ? null : requireId('segmentId', params.segmentId);
  return withCrmTx(
    ctx.organizationId,
    async (client) => {
      if (segmentId) {
        const seg = await client.query<{
          rules: SegmentRule[];
          match: 'all' | 'any';
          kind: string;
          visibility: string;
          created_by_user_id: string | null;
          deleted_at: Date | null;
        }>(
          `SELECT rules, match, kind, visibility, created_by_user_id, deleted_at FROM crm.segment WHERE id = $1`,
          [segmentId],
        );
        const s = seg.rows[0];
        if (!s || s.deleted_at || (s.visibility === 'me' && s.created_by_user_id !== ctx.userId)) {
          throw new ResourceNotFound();
        }
        // the predefined segment needs the visits from EasyBook (CR.12)
        if (s.kind === 'lapsed') throw new Conflict('segment_unavailable');
        where.push(rulesSql(s.rules, s.match, arg, ctx.userId));
      }
      const sql = where.join(' AND ');
      const total = await client.query<{ n: string }>(
        `SELECT count(*) AS n FROM crm.contact WHERE ${sql}`,
        args,
      );
      const { rows } = await client.query<ContactRow>(
        `SELECT ${COLUMNS} FROM crm.contact WHERE ${sql}
          ORDER BY lower(name), id LIMIT ${arg(limit)} OFFSET ${arg(offset)}`,
        args,
      );
      return { items: rows.map(toContact), total: Number(total.rows[0]?.n ?? 0) };
    },
    true,
  );
}

/**
 * The reconciliation resolver of crm.contacts: a reservation left after 15 minutes is committed
 * when its contact holds it (exists, active, with this operation), released otherwise.
 */
export async function contactQuotaHeld(
  organizationId: string,
  operationId: string,
): Promise<boolean> {
  return withCrmTx(
    organizationId,
    async (client) => {
      const { rows } = await client.query(
        `SELECT 1 FROM crm.contact WHERE quota_operation_id = $1 AND deleted_at IS NULL`,
        [operationId],
      );
      return rows.length > 0;
    },
    true,
  );
}
