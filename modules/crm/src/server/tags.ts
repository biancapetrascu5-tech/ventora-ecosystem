import type { PoolClient } from 'pg';
import type { TenantContext } from '@ventora/access';
import { AuditActions, appendAuditEventInTx, type AuditSqlExecutor } from '@ventora/audit';
import { CrmContactUpdatedV1 } from '@ventora/contracts';
import { uuidv7, writeOutboxEvent } from '@ventora/db-kit';
import { Conflict, Forbidden, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { withCrmTx } from './db';
import { requireId, requiredText } from './validation';
import type { ContactScope } from './contacts';

/*
 * Lot CR.4 — the tags of ClientDesk (design S132 „Etichete și surse”, S130 contacts list). Every
 * member with crm:read sees the tags; creating, renaming, merging and deleting them needs
 * crm:settings; putting tags on contacts follows the contacts rule (crm:write, D-CRM-15).
 *
 * - A contact holds at most 50 tags (contact.tag_ids, a CHECK).
 * - „Unește cu…” (S132): the contacts of the merged tag get the target tag, the merged tag is
 *   deleted; the segments that used it then use the target (the rules are rewritten).
 * - „Șterge”: the tag leaves every contact and every segment rule; the row stays as deleted.
 * - Tagging in bulk (the list's bulk bar): at most 200 contacts per call, one audit row per contact.
 */

export const TAG_LIMITS = { name: 40, perContact: 50, bulk: 200 } as const;
/** The colour keys of the design tokens a tag may use. */
export const TAG_COLORS = [
  'neutral',
  'peach',
  'lime',
  'sky',
  'violet',
  'rose',
  'amber',
  'teal',
] as const;

export type Tag = {
  id: string;
  name: string;
  color: string;
  /** The active contacts carrying it. */
  contactsCount: number;
  deletedAt: Date | null;
  createdAt: Date;
};

type TagRow = {
  id: string;
  name: string;
  color: string;
  contacts_count: string;
  deleted_at: Date | null;
  created_at: Date;
};

const COLUMNS = `t.id, t.name, t.color, t.deleted_at, t.created_at,
  (SELECT count(*) FROM crm.contact c WHERE c.deleted_at IS NULL AND t.id = ANY(c.tag_ids)) AS contacts_count`;

function toTag(r: TagRow): Tag {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    contactsCount: Number(r.contacts_count),
    deletedAt: r.deleted_at,
    createdAt: r.created_at,
  };
}

function audit(
  exec: AuditSqlExecutor,
  ctx: TenantContext,
  action: string,
  targetType: 'crm_tag' | 'crm_contact',
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

function normalizeColor(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !(TAG_COLORS as readonly string[]).includes(value)) {
    throw new InvalidInput('color', 'invalid');
  }
  return value;
}

function mapName(err: unknown): never {
  if (
    (err as { code?: string }).code === '23505' &&
    String((err as { constraint?: string }).constraint) === 'tag_active_name_key'
  ) {
    throw new Conflict('tag_name_taken');
  }
  throw err;
}

async function readTag(client: PoolClient, id: string, lock = false): Promise<TagRow> {
  const { rows } = await client.query<TagRow>(
    `SELECT ${COLUMNS} FROM crm.tag t WHERE t.id = $1${lock ? ' FOR UPDATE OF t' : ''}`,
    [id],
  );
  if (!rows[0]) throw new ResourceNotFound();
  return rows[0];
}

export async function listTagsInOrg(ctx: TenantContext): Promise<Tag[]> {
  return withCrmTx(
    ctx.organizationId,
    async (client) => {
      const { rows } = await client.query<TagRow>(
        `SELECT ${COLUMNS} FROM crm.tag t WHERE t.deleted_at IS NULL ORDER BY lower(t.name), t.id`,
      );
      return rows.map(toTag);
    },
    true,
  );
}

export async function createTagInOrg(
  ctx: TenantContext,
  input: { name?: unknown; color?: unknown },
): Promise<Tag> {
  const name = requiredText('name', input.name, TAG_LIMITS.name);
  const color = normalizeColor(input.color) ?? 'neutral';
  const id = uuidv7();
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    await client
      .query(
        `INSERT INTO crm.tag (id, organization_id, name, color, created_by_user_id) VALUES ($1, $2, $3, $4, $5)`,
        [id, ctx.organizationId, name, color, ctx.userId],
      )
      .catch(mapName);
    await audit(exec, ctx, AuditActions.crmTagCreated, 'crm_tag', id, { color });
    return toTag(await readTag(client, id));
  });
}

export async function updateTagInOrg(
  ctx: TenantContext,
  tagId: string,
  input: { name?: unknown; color?: unknown },
): Promise<Tag> {
  const id = requireId('tagId', tagId);
  const name =
    input.name === undefined ? undefined : requiredText('name', input.name, TAG_LIMITS.name);
  const color = normalizeColor(input.color);
  const patch: Record<string, unknown> = { name, color };
  const fields = Object.keys(patch).filter((k) => patch[k] !== undefined);
  if (fields.length === 0) throw new InvalidInput('tag', 'required');
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const before = await readTag(client, id, true);
    if (before.deleted_at) throw new Conflict('tag_deleted');
    await client
      .query(
        `UPDATE crm.tag SET ${fields.map((f, i) => `${f} = $${i + 2}`).join(', ')} WHERE id = $1`,
        [id, ...fields.map((f) => patch[f])],
      )
      .catch(mapName);
    await audit(exec, ctx, AuditActions.crmTagUpdated, 'crm_tag', id, { fields });
    return toTag(await readTag(client, id));
  });
}

/** Rewrites the segment rules that point at `fromId`: to `toId`, or out when toId is null. */
async function rewriteSegments(client: PoolClient, fromId: string, toId: string | null) {
  const { rows } = await client.query<{ id: string; rules: Array<Record<string, unknown>> }>(
    `SELECT id, rules FROM crm.segment
      WHERE deleted_at IS NULL AND rules @> jsonb_build_array(jsonb_build_object('field', 'tag', 'value', $1::text))`,
    [fromId],
  );
  for (const s of rows) {
    const rules = s.rules
      .map((r) =>
        r.field === 'tag' && r.value === fromId ? (toId ? { ...r, value: toId } : null) : r,
      )
      .filter(Boolean);
    await client.query(`UPDATE crm.segment SET rules = $2::jsonb WHERE id = $1`, [
      s.id,
      JSON.stringify(rules),
    ]);
  }
}

/** „Unește cu…”: the contacts of `tagId` get `intoId`; `tagId` is deleted (S132). */
export async function mergeTagInOrg(
  ctx: TenantContext,
  tagId: string,
  intoTagId: string,
): Promise<Tag> {
  const id = requireId('tagId', tagId);
  const into = requireId('intoTagId', intoTagId);
  if (id === into) throw new InvalidInput('intoTagId', 'invalid');
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const source = await readTag(client, id, true);
    const target = await readTag(client, into, true);
    if (source.deleted_at || target.deleted_at) throw new Conflict('tag_deleted');
    const moved = await client.query(
      `UPDATE crm.contact
          SET tag_ids = CASE WHEN $2::uuid = ANY(tag_ids) THEN array_remove(tag_ids, $1::uuid)
                             ELSE array_replace(tag_ids, $1::uuid, $2::uuid) END
        WHERE $1::uuid = ANY(tag_ids)`,
      [id, into],
    );
    await rewriteSegments(client, id, into);
    await client.query(
      `UPDATE crm.tag SET deleted_at = now(), deleted_by_user_id = $2 WHERE id = $1`,
      [id, ctx.userId],
    );
    await audit(exec, ctx, AuditActions.crmTagMerged, 'crm_tag', id, {
      intoTagId: into,
      contacts: moved.rowCount ?? 0,
    });
    return toTag(await readTag(client, into));
  });
}

/** „Șterge”: off every contact and every segment rule; the row stays as deleted. */
export async function deleteTagInOrg(ctx: TenantContext, tagId: string): Promise<Tag> {
  const id = requireId('tagId', tagId);
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const before = await readTag(client, id, true);
    if (before.deleted_at) throw new Conflict('tag_deleted');
    const removed = await client.query(
      `UPDATE crm.contact SET tag_ids = array_remove(tag_ids, $1::uuid) WHERE $1::uuid = ANY(tag_ids)`,
      [id],
    );
    await rewriteSegments(client, id, null);
    await client.query(
      `UPDATE crm.tag SET deleted_at = now(), deleted_by_user_id = $2 WHERE id = $1`,
      [id, ctx.userId],
    );
    await audit(exec, ctx, AuditActions.crmTagDeleted, 'crm_tag', id, {
      contacts: removed.rowCount ?? 0,
    });
    return toTag(await readTag(client, id));
  });
}

/**
 * „Etichetă” (one contact or the bulk bar): adds and removes tags on up to 200 contacts, each one
 * visible to the person (D-CRM-15), active. One audit row per contact and one event.
 */
export async function tagContactsInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  input: { contactIds?: unknown; add?: unknown; remove?: unknown },
): Promise<{ updated: number }> {
  const ids = Array.isArray(input.contactIds) ? [...new Set(input.contactIds)] : null;
  if (!ids || ids.length === 0) throw new InvalidInput('contactIds', 'required');
  if (ids.length > TAG_LIMITS.bulk) throw new InvalidInput('contactIds', 'too_many');
  const contactIds = ids.map((v) => requireId('contactIds', v));
  const list = (v: unknown, field: string) =>
    v === undefined
      ? []
      : Array.isArray(v)
        ? [...new Set(v)].map((x) => requireId(field, x))
        : (() => {
            throw new InvalidInput(field, 'invalid');
          })();
  const add = list(input.add, 'add');
  const remove = list(input.remove, 'remove');
  if (add.length === 0 && remove.length === 0) throw new InvalidInput('add', 'required');
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    if (add.length > 0) {
      const ok = await client.query(
        `SELECT id FROM crm.tag WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
        [add],
      );
      if (ok.rowCount !== add.length) throw new ResourceNotFound();
    }
    const { rows } = await client.query<{
      id: string;
      owner_user_id: string | null;
      deleted_at: Date | null;
      tag_ids: string[];
    }>(
      `SELECT id, owner_user_id, deleted_at, tag_ids FROM crm.contact WHERE id = ANY($1::uuid[]) FOR UPDATE`,
      [contactIds],
    );
    if (rows.length !== contactIds.length) throw new ResourceNotFound();
    for (const c of rows) {
      if (scope === 'own' && c.owner_user_id !== null && c.owner_user_id !== ctx.userId)
        throw new Forbidden();
      if (c.deleted_at) throw new Conflict('contact_deleted');
    }
    let updated = 0;
    for (const c of rows) {
      const next = [...new Set([...c.tag_ids.filter((t) => !remove.includes(t)), ...add])];
      const added = next.filter((t) => !c.tag_ids.includes(t));
      const removedHere = c.tag_ids.filter((t) => !next.includes(t));
      if (added.length === 0 && removedHere.length === 0) continue;
      if (next.length > TAG_LIMITS.perContact) throw new InvalidInput('add', 'too_many');
      await client.query(`UPDATE crm.contact SET tag_ids = $2::uuid[] WHERE id = $1`, [c.id, next]);
      if (added.length > 0) {
        await audit(exec, ctx, AuditActions.crmContactTagged, 'crm_contact', c.id, {
          tagIds: added,
        });
      }
      if (removedHere.length > 0) {
        await audit(exec, ctx, AuditActions.crmContactUntagged, 'crm_contact', c.id, {
          tagIds: removedHere,
        });
      }
      await writeOutboxEvent(client, 'crm', CrmContactUpdatedV1, {
        organizationId: ctx.organizationId,
        sourceApp: 'platform',
        resourceId: c.id,
        payload: { contactId: c.id, fields: ['tag_ids'] },
      });
      updated += 1;
    }
    return { updated };
  });
}
