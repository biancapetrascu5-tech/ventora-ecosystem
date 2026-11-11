import type { PoolClient } from 'pg';
import {
  checkRolePermission,
  getMemberApplicationAccess,
  type TenantContext,
} from '@ventora/access';
import { Conflict, Forbidden, InvalidInput, ResourceNotFound } from '@ventora/errors';
import type { ContactScope } from './contacts';
import { requireId } from './validation';

/*
 * Lot CR.6 — the record a note, a comment or a file belongs to (its „subject”), and who may see it.
 * Contact and lead (CR.8): with crm:admin every one, otherwise the own and the unassigned ones
 * (D-CRM-15). Company: every member with crm:read. Deal comes with CR.9.
 *
 * A merged contact (CR.5) is in the bin with merged_into_id: its files stay its own in core/files,
 * so a file of it is reached through the contact that stayed (followMerge).
 */

export const SUBJECT_TYPES = ['contact', 'company', 'lead'] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

export type Subject = {
  type: SubjectType;
  id: string;
  /** The contact's or the lead's owner; null when unassigned and for a company. */
  ownerUserId: string | null;
  deleted: boolean;
};

const FOLLOW_MAX = 20;

export function requireSubjectType(value: unknown): SubjectType {
  if ((SUBJECT_TYPES as readonly unknown[]).includes(value)) return value as SubjectType;
  // deal: valid in the tables, not yet in ClientDesk (CR.9)
  if (value === 'deal') throw new InvalidInput('subjectType', 'not_available');
  throw new InvalidInput('subjectType', 'invalid');
}

/**
 * Reads the subject in the open crm transaction and checks the caller sees it. `write`: the subject
 * must not be in the bin. `followMerge`: a merged contact resolves to the contact that stayed.
 */
export async function readSubject(
  client: PoolClient,
  ctx: TenantContext,
  scope: ContactScope,
  type: SubjectType,
  rawId: unknown,
  options: { write?: boolean; followMerge?: boolean } = {},
): Promise<Subject> {
  let id = requireId('subjectId', rawId);
  if (type === 'company') {
    const { rows } = await client.query<{ deleted_at: Date | null }>(
      `SELECT deleted_at FROM crm.company WHERE id = $1`,
      [id],
    );
    if (!rows[0]) throw new ResourceNotFound();
    if (options.write && rows[0].deleted_at) throw new Conflict('company_deleted');
    return { type, id, ownerUserId: null, deleted: rows[0].deleted_at !== null };
  }
  if (type === 'lead') {
    // CR.8: a lead is seen as a contact is (D-CRM-15): crm:admin, its owner, or unassigned
    const { rows } = await client.query<{ owner_user_id: string | null; deleted_at: Date | null }>(
      `SELECT owner_user_id, deleted_at FROM crm.lead WHERE id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) throw new ResourceNotFound();
    if (scope !== 'all' && row.owner_user_id !== null && row.owner_user_id !== ctx.userId) {
      throw new Forbidden();
    }
    if (options.write && row.deleted_at) throw new Conflict('lead_deleted');
    return { type, id, ownerUserId: row.owner_user_id, deleted: row.deleted_at !== null };
  }
  for (let hop = 0; ; hop++) {
    const { rows } = await client.query<{
      owner_user_id: string | null;
      deleted_at: Date | null;
      merged_into_id: string | null;
    }>(`SELECT owner_user_id, deleted_at, merged_into_id FROM crm.contact WHERE id = $1`, [id]);
    const row = rows[0];
    if (!row) throw new ResourceNotFound();
    if (options.followMerge && row.merged_into_id && hop < FOLLOW_MAX) {
      id = row.merged_into_id;
      continue;
    }
    if (scope !== 'all' && row.owner_user_id !== null && row.owner_user_id !== ctx.userId) {
      throw new Forbidden();
    }
    if (options.write && row.deleted_at) throw new Conflict('contact_deleted');
    return { type, id, ownerUserId: row.owner_user_id, deleted: row.deleted_at !== null };
  }
}

/** The contact and every contact merged into it (CR.5), at any depth. */
export async function mergedFamily(client: PoolClient, contactId: string): Promise<string[]> {
  const { rows } = await client.query<{ id: string }>(
    `WITH RECURSIVE m AS (
       SELECT id FROM crm.contact WHERE id = $1
       UNION
       SELECT c.id FROM crm.contact c JOIN m ON c.merged_into_id = m.id
     )
     SELECT id FROM m`,
    [contactId],
  );
  return rows.map((r) => r.id);
}

/**
 * S130: only people who see the record can be mentioned (CR.6), own a task or take part in a
 * meeting (CR.7) — an active member with access to ClientDesk; on an assigned contact, its owner or
 * someone with crm:admin. No record (a standalone task): any active member with access.
 */
export async function requireMentionable(
  ctx: TenantContext,
  subject: Subject | null,
  userIds: string[],
  field = 'mentions',
): Promise<void> {
  for (const userId of userIds) {
    const access = await getMemberApplicationAccess(ctx, userId, 'crm');
    if (access.status !== 'active' || !access.hasAccess) {
      throw new InvalidInput(field, 'not_member');
    }
    if (!subject || subject.type === 'company' || subject.ownerUserId === null) continue;
    if (userId === subject.ownerUserId) continue;
    if (!(await checkRolePermission(access.role, 'crm', 'crm:admin')))
      throw new InvalidInput(field, 'cannot_see');
  }
}
