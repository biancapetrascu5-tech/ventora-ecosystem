import type { PoolClient } from 'pg';
import type { TenantContext } from '@ventora/access';
import { AuditActions, appendAuditEventInTx, type AuditSqlExecutor } from '@ventora/audit';
import { uuidv7 } from '@ventora/db-kit';
import { Conflict, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { withCrmTx } from './db';
import { requireId, requiredText } from './validation';

/*
 * Lot CR.8b — the lead sources of a business (decision of 11.11.2026, as in S132 „Etichete și
 * surse”). The built-in ones (form, phone, e-mail, referral, event, manual) are written once per
 * business and named by their key on screen; they can be renamed or hidden, never deleted, so the
 * forms and EasyBook always have a source. The business's own can be added, renamed and deleted
 * (into the bin: the leads keep them). Managing them needs crm:settings; reading, crm:read.
 */

export const BUILTIN_SOURCES = ['form', 'phone', 'email', 'referral', 'event', 'manual'] as const;
export type BuiltinSource = (typeof BUILTIN_SOURCES)[number];
export const SOURCE_LIMITS = { label: 60, own: 30 } as const;

export type LeadSourceDef = {
  id: string;
  /** A built-in source; null for the business's own. */
  key: BuiltinSource | null;
  /** The business's name for it; a built-in one without it is translated on screen. */
  label: string | null;
  hidden: boolean;
  sortOrder: number;
};

type Row = {
  id: string;
  key: BuiltinSource | null;
  label: string | null;
  hidden: boolean;
  sort_order: number;
  deleted_at: Date | null;
};

const toDef = (r: Row): LeadSourceDef => ({
  id: r.id,
  key: r.key,
  label: r.label,
  hidden: r.hidden,
  sortOrder: r.sort_order,
});

function audit(
  exec: AuditSqlExecutor,
  ctx: TenantContext,
  action: string,
  id: string,
  metadata: Record<string, unknown>,
) {
  return appendAuditEventInTx(exec, {
    category: 'crm',
    action,
    outcome: 'success',
    actorType: 'user',
    actorId: ctx.userId,
    organizationId: ctx.organizationId,
    targetType: 'crm_lead_source',
    targetId: id,
    metadata,
  });
}

/** The built-in sources, once per business (in the open transaction). */
export async function ensureBuiltinSources(client: PoolClient, ctx: TenantContext): Promise<void> {
  const { rows } = await client.query(
    `SELECT 1 FROM crm.lead_source WHERE key IS NOT NULL LIMIT 1`,
  );
  if (rows.length) return;
  let order = 0;
  for (const key of BUILTIN_SOURCES) {
    await client.query(
      `INSERT INTO crm.lead_source (id, organization_id, key, sort_order) VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id, key) WHERE key IS NOT NULL DO NOTHING`,
      [uuidv7(), ctx.organizationId, key, order++],
    );
  }
}

/** The active sources (the hidden ones included, flagged): the inbox filter shows all of them. */
export async function listLeadSourcesInOrg(ctx: TenantContext): Promise<LeadSourceDef[]> {
  return withCrmTx(ctx.organizationId, async (client) => {
    await ensureBuiltinSources(client, ctx);
    const { rows } = await client.query<Row>(
      `SELECT id, key, label, hidden, sort_order, deleted_at FROM crm.lead_source
        WHERE deleted_at IS NULL ORDER BY sort_order, created_at, id`,
    );
    return rows.map(toDef);
  });
}

export async function createLeadSourceInOrg(
  ctx: TenantContext,
  input: { label?: unknown },
): Promise<LeadSourceDef> {
  const label = requiredText('label', input.label, SOURCE_LIMITS.label);
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    await ensureBuiltinSources(client, ctx);
    const { rows: n } = await client.query<{ n: string }>(
      `SELECT count(*) AS n FROM crm.lead_source WHERE key IS NULL AND deleted_at IS NULL`,
    );
    if (Number(n[0]!.n) >= SOURCE_LIMITS.own) throw new Conflict('source_limit');
    const id = uuidv7();
    const { rows } = await client.query<Row>(
      `INSERT INTO crm.lead_source (id, organization_id, label, sort_order, created_by_user_id)
       SELECT $1, $2, $3, COALESCE(max(sort_order), -1) + 1, $4 FROM crm.lead_source
       RETURNING id, key, label, hidden, sort_order, deleted_at`,
      [id, ctx.organizationId, label, ctx.userId],
    );
    await audit(exec, ctx, AuditActions.crmLeadSourceCreated, id, {});
    return toDef(rows[0]!);
  });
}

/** Rename (null: a built-in one goes back to its translated name) or hide / show. */
export async function updateLeadSourceInOrg(
  ctx: TenantContext,
  sourceId: string,
  input: { label?: unknown; hidden?: unknown },
): Promise<LeadSourceDef> {
  const id = requireId('sourceId', sourceId);
  if (input.hidden !== undefined && typeof input.hidden !== 'boolean') {
    throw new InvalidInput('hidden', 'invalid');
  }
  if (input.label === undefined && input.hidden === undefined)
    throw new InvalidInput('label', 'required');
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const { rows } = await client.query<Row>(
      `SELECT id, key, label, hidden, sort_order, deleted_at FROM crm.lead_source WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const row = rows[0];
    if (!row || row.deleted_at) throw new ResourceNotFound();
    let label = row.label;
    if (input.label !== undefined) {
      if (input.label === null) {
        if (!row.key) throw new InvalidInput('label', 'required');
        label = null;
      } else {
        label = requiredText('label', input.label, SOURCE_LIMITS.label);
      }
    }
    const hidden = input.hidden === undefined ? row.hidden : (input.hidden as boolean);
    const { rows: updated } = await client.query<Row>(
      `UPDATE crm.lead_source SET label = $2, hidden = $3 WHERE id = $1
       RETURNING id, key, label, hidden, sort_order, deleted_at`,
      [id, label, hidden],
    );
    await audit(exec, ctx, AuditActions.crmLeadSourceUpdated, id, {
      fields: [
        ...(input.label !== undefined ? ['label'] : []),
        ...(input.hidden !== undefined ? ['hidden'] : []),
      ],
    });
    return toDef(updated[0]!);
  });
}

/** Only the business's own; the leads keep it (shown as deleted). */
export async function deleteLeadSourceInOrg(ctx: TenantContext, sourceId: string): Promise<void> {
  const id = requireId('sourceId', sourceId);
  await withCrmTx(ctx.organizationId, async (client, exec) => {
    const { rows } = await client.query<Row>(
      `SELECT id, key, label, hidden, sort_order, deleted_at FROM crm.lead_source WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const row = rows[0];
    if (!row || row.deleted_at) throw new ResourceNotFound();
    if (row.key) throw new Conflict('source_builtin');
    await client.query(
      `UPDATE crm.lead_source SET deleted_at = now(), deleted_by_user_id = $2 WHERE id = $1`,
      [id, ctx.userId],
    );
    await audit(exec, ctx, AuditActions.crmLeadSourceDeleted, id, {});
  });
}

/**
 * The source a person picks for a lead: a built-in key (not hidden, never `form`: the forms write
 * it) or the id of the business's own active source.
 */
export async function pickSource(
  client: PoolClient,
  ctx: TenantContext,
  value: unknown,
): Promise<{ source: string; sourceId: string | null }> {
  await ensureBuiltinSources(client, ctx);
  if (typeof value !== 'string') throw new InvalidInput('source', 'invalid');
  if ((BUILTIN_SOURCES as readonly string[]).includes(value)) {
    if (value === 'form') throw new InvalidInput('source', 'invalid');
    const { rows } = await client.query<{ hidden: boolean }>(
      `SELECT hidden FROM crm.lead_source WHERE key = $1`,
      [value],
    );
    if (rows[0]?.hidden) throw new InvalidInput('source', 'hidden');
    return { source: value, sourceId: null };
  }
  const id = requireId('source', value);
  const { rows } = await client.query<{ key: string | null; deleted_at: Date | null }>(
    `SELECT key, deleted_at FROM crm.lead_source WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row || row.key !== null || row.deleted_at) throw new InvalidInput('source', 'invalid');
  return { source: 'custom', sourceId: id };
}
