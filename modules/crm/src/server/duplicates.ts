import type { PoolClient } from 'pg';
import type { TenantContext } from '@ventora/access';
import { AuditActions, appendAuditEventInTx, type AuditSqlExecutor } from '@ventora/audit';
import { CrmContactDeletedV1, CrmContactUpdatedV1 } from '@ventora/contracts';
import { uuidv7, writeOutboxEvent } from '@ventora/db-kit';
import { Conflict, Forbidden, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { freeStockQuota } from '@ventora/quota';
import { withCrmTx } from './db';
import { CONTACTS_QUOTA_KEY, type ContactScope } from './contacts';
import { normalizeEmail, normalizePhone, optionalText, requireId, LIMITS } from './validation';

/*
 * Lot CR.5 — the duplicates and the merge of contacts (design S132 ClientDeskDuplicates;
 * D-CRM-8 = a: exact rules; D-CRM-9 = a).
 *
 * - The pairs: two active contacts of the business with the same phone (main or second), the same
 *   e-mail (main or second) or the same normalised name (contact.name_key, at least 3 characters),
 *   with their reasons; a pair marked „Nu sunt duplicate” does not come back. Found live on every
 *   read (the nightly check of S132 is the same query; the design's „Verificat azi la 06:00” comes
 *   with the job in CR.13). A member sees only the pairs whose both contacts they see.
 * - The warning on the spot (S132): the contacts matching a name, phone or e-mail being typed.
 * - The merge and „Nu sunt duplicate” need crm:admin (they change contacts of others).
 *   - Two EasyBook contacts: Conflict merge_in_easybook (merged only in EasyBook, S130 / D-CRM-9).
 *   - One from EasyBook: it is the one that stays (Conflict easybook_must_stay otherwise) and its
 *     name, phone, e-mail and language cannot come from the other (D-CRM-1).
 *   - The chosen fields come from the merged contact; tags are joined; own fields missing on the
 *     kept contact are filled; the merged contact goes to the bin with merged_into_id, its unit of
 *     crm.contacts is freed, a log row is written (contact_merge). Undo: proposal (S132, 30 days).
 *     CR.6: its notes and comments move onto the kept contact; its files show in the kept one's
 *     history.
 *   - CR.7 / CR.9: its activities, tasks and deals move too.
 */

export type DuplicateReason = 'phone' | 'email' | 'name';
export type DuplicatePair = {
  contactAId: string;
  contactBId: string;
  reasons: DuplicateReason[];
  /** Both come from EasyBook: merged only there (S132 „Îmbină în EasyBook”). */
  bothFromEasyBook: boolean;
};

/** The fields a merge may take from the merged contact. */
export const MERGE_FIELDS = [
  'name',
  'phone',
  'phone_alt',
  'email',
  'email_alt',
  'locale',
  'birthday',
  'address',
  'note',
  'company',
  'owner',
] as const;
export type MergeField = (typeof MERGE_FIELDS)[number];
const EASYBOOK_LOCKED: readonly MergeField[] = ['name', 'phone', 'email', 'locale'];

function audit(
  exec: AuditSqlExecutor,
  ctx: TenantContext,
  action: string,
  targetType: 'crm_contact' | 'crm_duplicate',
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
    targetType,
    targetId,
    metadata,
  });
}

/** The pairs of the business (or of one contact), at most 200, the newest contacts first. */
export async function listDuplicatesInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  opts: { reason?: unknown; contactId?: unknown } = {},
): Promise<DuplicatePair[]> {
  const reason = opts.reason;
  if (reason !== undefined && reason !== 'phone' && reason !== 'email' && reason !== 'name') {
    throw new InvalidInput('reason', 'invalid');
  }
  const contactId = opts.contactId === undefined ? null : requireId('contactId', opts.contactId);
  return withCrmTx(
    ctx.organizationId,
    async (client) => {
      const args: unknown[] = [];
      const arg = (v: unknown) => {
        args.push(v);
        return `$${args.length}`;
      };
      const seen = (alias: string) =>
        scope === 'own'
          ? ` AND (${alias}.owner_user_id IS NULL OR ${alias}.owner_user_id = ${arg(ctx.userId)}::uuid)`
          : '';
      const only = contactId ? ` AND ${arg(contactId)}::uuid IN (a.id, b.id)` : '';
      const { rows } = await client.query<{
        a: string;
        b: string;
        phone: boolean;
        email: boolean;
        name: boolean;
        both_easybook: boolean;
      }>(
        `SELECT a.id AS a, b.id AS b,
                (a.phone IS NOT NULL AND a.phone IN (b.phone, b.phone_alt))
                  OR (a.phone_alt IS NOT NULL AND a.phone_alt IN (b.phone, b.phone_alt)) AS phone,
                (a.email IS NOT NULL AND a.email IN (b.email, b.email_alt))
                  OR (a.email_alt IS NOT NULL AND a.email_alt IN (b.email, b.email_alt)) AS email,
                (char_length(a.name_key) >= 3 AND a.name_key = b.name_key) AS name,
                (a.source = 'easybook' AND b.source = 'easybook') AS both_easybook
           FROM crm.contact a
           JOIN crm.contact b ON a.id < b.id
          WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL
            AND (   (a.phone IS NOT NULL AND a.phone IN (b.phone, b.phone_alt))
                 OR (a.phone_alt IS NOT NULL AND a.phone_alt IN (b.phone, b.phone_alt))
                 OR (a.email IS NOT NULL AND a.email IN (b.email, b.email_alt))
                 OR (a.email_alt IS NOT NULL AND a.email_alt IN (b.email, b.email_alt))
                 OR (char_length(a.name_key) >= 3 AND a.name_key = b.name_key))
            AND NOT EXISTS (SELECT 1 FROM crm.duplicate_dismissal d
                             WHERE d.contact_a_id = a.id AND d.contact_b_id = b.id AND d.undone_at IS NULL)
            ${seen('a')}${seen('b')}${only}
          ORDER BY greatest(a.created_at, b.created_at) DESC, a.id, b.id
          LIMIT 200`,
        args,
      );
      return rows
        .map((r) => ({
          contactAId: r.a,
          contactBId: r.b,
          reasons: (['phone', 'email', 'name'] as const).filter((k) => r[k]),
          bothFromEasyBook: r.both_easybook,
        }))
        .filter((p) => !reason || p.reasons.includes(reason as DuplicateReason));
    },
    true,
  );
}

/** The warning while adding a contact (S132): up to 5 visible contacts with that phone, e-mail or name. */
export async function checkDuplicatesInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  input: { name?: unknown; phone?: unknown; email?: unknown },
): Promise<{ contactId: string; reasons: DuplicateReason[] }[]> {
  const name = optionalText('name', input.name, LIMITS.name) ?? null;
  const phone = normalizePhone('phone', input.phone) ?? null;
  const email = normalizeEmail('email', input.email) ?? null;
  if (!name && !phone && !email) return [];
  return withCrmTx(
    ctx.organizationId,
    async (client) => {
      const { rows } = await client.query<{
        id: string;
        phone: boolean;
        email: boolean;
        name: boolean;
      }>(
        `WITH k AS (SELECT crm.name_key($1::text) AS key)
         SELECT c.id,
                ($2::text IS NOT NULL AND $2::text IN (c.phone, c.phone_alt)) AS phone,
                ($3::text IS NOT NULL AND $3::text IN (c.email, c.email_alt)) AS email,
                (char_length(k.key) >= 3 AND c.name_key = k.key) AS name
           FROM crm.contact c, k
          WHERE c.deleted_at IS NULL
            AND (($2::text IS NOT NULL AND $2::text IN (c.phone, c.phone_alt))
              OR ($3::text IS NOT NULL AND $3::text IN (c.email, c.email_alt))
              OR (char_length(k.key) >= 3 AND c.name_key = k.key))
            ${scope === 'own' ? 'AND (c.owner_user_id IS NULL OR c.owner_user_id = $4::uuid)' : ''}
          ORDER BY c.created_at DESC LIMIT 5`,
        scope === 'own' ? [name ?? '', phone, email, ctx.userId] : [name ?? '', phone, email],
      );
      return rows.map((r) => ({
        contactId: r.id,
        reasons: (['phone', 'email', 'name'] as const).filter((k) => r[k]),
      }));
    },
    true,
  );
}

function pair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/** „Nu sunt duplicate”: the pair no longer comes back (crm:admin). */
export async function dismissDuplicateInOrg(
  ctx: TenantContext,
  aId: string,
  bId: string,
): Promise<string> {
  const [a, b] = pair(requireId('contactAId', aId), requireId('contactBId', bId));
  if (a === b) throw new InvalidInput('contactBId', 'invalid');
  const id = uuidv7();
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const found = await client.query(`SELECT id FROM crm.contact WHERE id = ANY($1::uuid[])`, [
      [a, b],
    ]);
    if (found.rowCount !== 2) throw new ResourceNotFound();
    const inserted = await client.query(
      `INSERT INTO crm.duplicate_dismissal (id, organization_id, contact_a_id, contact_b_id, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
      [id, ctx.organizationId, a, b, ctx.userId],
    );
    if (inserted.rowCount === 0) throw new Conflict('duplicate_already_dismissed');
    await audit(exec, ctx, AuditActions.crmDuplicateDismissed, 'crm_duplicate', id, {
      contactAId: a,
      contactBId: b,
    });
    return id;
  });
}

/** Undo „Nu sunt duplicate” (from the business log, S132). */
export async function restoreDuplicateInOrg(
  ctx: TenantContext,
  dismissalId: string,
): Promise<void> {
  const id = requireId('dismissalId', dismissalId);
  await withCrmTx(ctx.organizationId, async (client, exec) => {
    const r = await client.query(
      `UPDATE crm.duplicate_dismissal SET undone_at = now(), undone_by_user_id = $2
        WHERE id = $1 AND undone_at IS NULL`,
      [id, ctx.userId],
    );
    if (r.rowCount === 0) throw new ResourceNotFound();
    await audit(exec, ctx, AuditActions.crmDuplicateRestored, 'crm_duplicate', id, {});
  });
}

type MergeRow = {
  id: string;
  source: string;
  name: string;
  phone: string | null;
  phone_alt: string | null;
  email: string | null;
  email_alt: string | null;
  locale: string;
  birthday: string | null;
  address: string | null;
  note: string | null;
  company_id: string | null;
  company_role: string | null;
  owner_user_id: string | null;
  tag_ids: string[];
  custom_values: Record<string, unknown>;
  quota_operation_id: string | null;
  deleted_at: Date | null;
};

const MERGE_COLUMNS = `id, source, name, phone, phone_alt, email, email_alt, locale,
  to_char(birthday, 'YYYY-MM-DD') AS birthday, address, note, company_id, company_role, owner_user_id,
  tag_ids, custom_values, quota_operation_id, deleted_at`;

/**
 * „Îmbină” (crm:admin): `mergeId` disappears into `keepId`; `fromMerged` lists the fields whose
 * value comes from the merged contact. Returns the kept contact's id.
 */
export async function mergeContactsInOrg(
  ctx: TenantContext,
  input: { keepId?: unknown; mergeId?: unknown; fromMerged?: unknown },
): Promise<{ keptId: string; mergedId: string }> {
  const keepId = requireId('keepId', input.keepId);
  const mergeId = requireId('mergeId', input.mergeId);
  if (keepId === mergeId) throw new InvalidInput('mergeId', 'invalid');
  const fromMerged = input.fromMerged === undefined ? [] : input.fromMerged;
  if (!Array.isArray(fromMerged)) throw new InvalidInput('fromMerged', 'invalid');
  const fields = [...new Set(fromMerged)] as MergeField[];
  for (const f of fields) {
    if (!(MERGE_FIELDS as readonly unknown[]).includes(f))
      throw new InvalidInput('fromMerged', 'invalid');
  }

  const merged = await withCrmTx(
    ctx.organizationId,
    async (client) => {
      const { rows } = await client.query<MergeRow>(
        `SELECT ${MERGE_COLUMNS} FROM crm.contact WHERE id = ANY($1::uuid[])`,
        [[keepId, mergeId]],
      );
      return rows;
    },
    true,
  );
  const keep = merged.find((r) => r.id === keepId);
  const lost = merged.find((r) => r.id === mergeId);
  if (!keep || !lost) throw new ResourceNotFound();
  if (keep.deleted_at || lost.deleted_at) throw new Conflict('contact_deleted');
  if (keep.source === 'easybook' && lost.source === 'easybook')
    throw new Conflict('merge_in_easybook');
  if (lost.source === 'easybook') throw new Conflict('easybook_must_stay');
  if (keep.source === 'easybook' && fields.some((f) => EASYBOOK_LOCKED.includes(f))) {
    throw new Conflict('easybook_read_only');
  }

  // the unit of the merged contact first (idempotent on its reservation, as deleteContact)
  if (lost.quota_operation_id) {
    await freeStockQuota(
      ctx,
      CONTACTS_QUOTA_KEY,
      1,
      `crm.contact.merge:${lost.quota_operation_id}`,
    );
  }

  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const rows = await lockBoth(client, keepId, mergeId);
    const k = rows.keep;
    const m = rows.lost;
    if (k.deleted_at || m.deleted_at) throw new Conflict('contact_deleted');
    const pick = <K extends keyof MergeRow>(field: MergeField, col: K) =>
      fields.includes(field) ? m[col] : k[col];
    const tags = [...new Set([...k.tag_ids, ...m.tag_ids])].slice(0, 50);
    const custom = { ...m.custom_values, ...k.custom_values };
    // the merged one leaves its company „Principal” mark; it goes to the bin first (unique indexes)
    await client.query(
      `UPDATE crm.contact
          SET deleted_at = now(), deleted_by_user_id = $2, merged_into_id = $3, is_company_primary = false
        WHERE id = $1`,
      [mergeId, ctx.userId, keepId],
    );
    await client
      .query(
        `UPDATE crm.contact
            SET name = $2, phone = $3, phone_alt = $4, email = $5, email_alt = $6, locale = $7,
                birthday = $8::date, address = $9, note = $10, company_id = $11, company_role = $12,
                is_company_primary = CASE WHEN $11::uuid IS DISTINCT FROM company_id THEN false ELSE is_company_primary END,
                owner_user_id = $13, tag_ids = $14::uuid[], custom_values = $15::jsonb
          WHERE id = $1`,
        [
          keepId,
          pick('name', 'name'),
          pick('phone', 'phone'),
          pick('phone_alt', 'phone_alt'),
          pick('email', 'email'),
          pick('email_alt', 'email_alt'),
          pick('locale', 'locale'),
          pick('birthday', 'birthday'),
          pick('address', 'address'),
          pick('note', 'note'),
          pick('company', 'company_id'),
          pick('company', 'company_role'),
          pick('owner', 'owner_user_id'),
          tags,
          JSON.stringify(custom),
        ],
      )
      .catch((err: { code?: string }) => {
        // the company of the merged contact went to the bin meanwhile (contact_guard)
        if (err.code === '23514') throw new Conflict('company_deleted');
        throw err;
      });
    // CR.6: the notes and comments follow the contact that stays; its files are found through
    // merged_into_id (timeline.ts), core/files keeps their owner
    await client.query(
      `UPDATE crm.note SET subject_id = $1 WHERE subject_type = 'contact' AND subject_id = $2`,
      [keepId, mergeId],
    );
    // CR.7: so do its activities and tasks
    await client.query(
      `UPDATE crm.activity SET subject_id = $1 WHERE subject_type = 'contact' AND subject_id = $2`,
      [keepId, mergeId],
    );
    // CR.9: and its deals
    await client.query(`UPDATE crm.deal SET contact_id = $1 WHERE contact_id = $2`, [
      keepId,
      mergeId,
    ]);
    const mergeRowId = uuidv7();
    await client.query(
      `INSERT INTO crm.contact_merge (id, organization_id, kept_contact_id, merged_contact_id, fields_from_merged, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5::text[], $6)`,
      [mergeRowId, ctx.organizationId, keepId, mergeId, fields, ctx.userId],
    );
    await audit(exec, ctx, AuditActions.crmContactMerged, 'crm_contact', keepId, {
      mergedContactId: mergeId,
      fieldsFromMerged: fields,
    });
    await writeOutboxEvent(client, 'crm', CrmContactUpdatedV1, {
      organizationId: ctx.organizationId,
      sourceApp: 'platform',
      resourceId: keepId,
      payload: { contactId: keepId, fields: ['merged'] },
    });
    await writeOutboxEvent(client, 'crm', CrmContactDeletedV1, {
      organizationId: ctx.organizationId,
      sourceApp: 'platform',
      resourceId: mergeId,
      payload: { contactId: mergeId },
    });
    return { keptId: keepId, mergedId: mergeId };
  });
}

async function lockBoth(client: PoolClient, keepId: string, mergeId: string) {
  const { rows } = await client.query<MergeRow>(
    `SELECT ${MERGE_COLUMNS} FROM crm.contact WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
    [[keepId, mergeId]],
  );
  const keep = rows.find((r) => r.id === keepId);
  const lost = rows.find((r) => r.id === mergeId);
  if (!keep || !lost) throw new ResourceNotFound();
  return { keep, lost };
}

export { Forbidden };
