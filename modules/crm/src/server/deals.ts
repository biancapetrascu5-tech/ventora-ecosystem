import type { PoolClient } from 'pg';
import type { TenantContext } from '@ventora/access';
import { AuditActions, appendAuditEventInTx, type AuditSqlExecutor } from '@ventora/audit';
import { uuidv7 } from '@ventora/db-kit';
import {
  Conflict,
  Forbidden,
  InvalidInput,
  QuotaExceeded,
  ResourceNotFound,
} from '@ventora/errors';
import { commitQuota, freeStockQuota, releaseQuota, reserveQuota } from '@ventora/quota';
import { withCrmTx } from './db';
import type { ContactScope } from './contacts';
import { readSubject, requireMentionable } from './subjects';
import { isUuid, page, requireId, requiredText } from './validation';

/*
 * Lot CR.9 — the pipelines and the deals of ClientDesk (design S131 ClientDeskDeals; D-CRM-13).
 *
 * - Pipelines: the stock quota crm.pipelines (S131: 2 in the plan), reserved before the write,
 *   committed after, freed on delete; one is the default. ClientDesk creates the default one
 *   („Vânzări”, key `sales`) with the glossary stages (Contact nou 10 %, Ofertă trimisă 30 %,
 *   Negociere 60 %) at the first read; at a 0 limit there is none. Managing pipelines, stages and
 *   loss reasons needs crm:settings.
 * - Stages are the open steps; won and lost are the deal's status. A stage with open deals is not
 *   deleted; a pipeline keeps at least one stage; a pipeline with open deals is not deleted, nor
 *   the default one.
 * - Loss reasons: the S131 defaults (by key, translated on screen), written once per business;
 *   the business renames, adds and removes. A lost deal needs one (S131).
 * - Deals: as contacts for who sees them (D-CRM-15; crm:admin all, a member their own and the
 *   unassigned ones); a contact and / or a company the person sees; the items are free items with a
 *   price (EasyBook services with CR.12), the value is their sum; the probability starts from the
 *   stage (S131) and follows it on every move; every move is logged (deal_stage_change); won (final
 *   value, date, why) / lost (reason, note) / reopened; the bin.
 * - „Blocat de N zile”: `lastMovedAt` — the last stage change or activity on the deal.
 * - The events crm.deal.stage_changed / won / lost need their types in packages/contracts (a
 *   separate PR, proposal); the audit is here (ids, stages, amounts; never the texts).
 */

export const PIPELINES_QUOTA_KEY = 'crm.pipelines';
export const CURRENCIES = ['RON', 'EUR'] as const;
export type Currency = (typeof CURRENCIES)[number];
export const DEAL_LIMITS = {
  title: 160,
  pipelineName: 60,
  stageName: 40,
  lossLabel: 80,
  note: 500,
  items: 50,
  itemName: 160,
  quantityMax: 9999,
  priceMax: 1_000_000_000_00,
  stages: 12,
} as const;
const DEFAULT_STAGES = [
  { key: 'new_contact', probability: 10 },
  { key: 'proposal_sent', probability: 30 },
  { key: 'negotiation', probability: 60 },
] as const;
const DEFAULT_LOSS_REASONS = [
  'price',
  'competitor',
  'no_reply',
  'postponed',
  'no_budget',
  'other',
] as const;

export type Stage = {
  id: string;
  pipelineId: string;
  /** The default stages are named by their key (translated on screen). */
  key: string | null;
  name: string | null;
  sortOrder: number;
  probability: number;
};

export type Pipeline = {
  id: string;
  key: string | null;
  name: string | null;
  isDefault: boolean;
  sortOrder: number;
  stages: Stage[];
};

export type LossReason = {
  id: string;
  key: string | null;
  label: string | null;
  sortOrder: number;
};

export type DealItem = {
  kind: 'free';
  name: string;
  quantity: number;
  unitPriceMinor: number;
};

export type Deal = {
  id: string;
  pipelineId: string;
  stageId: string;
  title: string;
  contactId: string | null;
  companyId: string | null;
  leadId: string | null;
  currency: Currency;
  items: DealItem[];
  valueMinor: number;
  probability: number;
  /** YYYY-MM-DD */
  expectedCloseOn: string | null;
  ownerUserId: string | null;
  status: 'open' | 'won' | 'lost';
  stageChangedAt: Date;
  /** The last stage change or activity („Blocat de N zile”). */
  lastMovedAt: Date;
  wonValueMinor: number | null;
  closedOn: string | null;
  closeNote: string | null;
  lossReasonId: string | null;
  closedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
};

type DealRow = {
  id: string;
  pipeline_id: string;
  stage_id: string;
  title: string;
  contact_id: string | null;
  company_id: string | null;
  lead_id: string | null;
  currency: Currency;
  items: DealItem[];
  value_minor: string;
  probability: number;
  expected_close_on: string | null;
  owner_user_id: string | null;
  status: 'open' | 'won' | 'lost';
  stage_changed_at: Date;
  last_moved_at: Date;
  won_value_minor: string | null;
  closed_on: string | null;
  close_note: string | null;
  loss_reason_id: string | null;
  closed_at: Date | null;
  deleted_at: Date | null;
  created_at: Date;
};

const DEAL_COLUMNS = `d.id, d.pipeline_id, d.stage_id, d.title, d.contact_id, d.company_id, d.lead_id,
  d.currency, d.items, d.value_minor, d.probability,
  to_char(d.expected_close_on, 'YYYY-MM-DD') AS expected_close_on, d.owner_user_id, d.status,
  d.stage_changed_at,
  GREATEST(d.stage_changed_at, (SELECT max(COALESCE(a.done_at, a.created_at)) FROM crm.activity a
    WHERE a.subject_type = 'deal' AND a.subject_id = d.id AND a.deleted_at IS NULL)) AS last_moved_at,
  d.won_value_minor, to_char(d.closed_on, 'YYYY-MM-DD') AS closed_on, d.close_note,
  d.loss_reason_id, d.closed_at, d.deleted_at, d.created_at`;

function toDeal(r: DealRow): Deal {
  return {
    id: r.id,
    pipelineId: r.pipeline_id,
    stageId: r.stage_id,
    title: r.title,
    contactId: r.contact_id,
    companyId: r.company_id,
    leadId: r.lead_id,
    currency: r.currency,
    items: r.items ?? [],
    valueMinor: Number(r.value_minor),
    probability: r.probability,
    expectedCloseOn: r.expected_close_on,
    ownerUserId: r.owner_user_id,
    status: r.status,
    stageChangedAt: r.stage_changed_at,
    lastMovedAt: r.last_moved_at,
    wonValueMinor: r.won_value_minor === null ? null : Number(r.won_value_minor),
    closedOn: r.closed_on,
    closeNote: r.close_note,
    lossReasonId: r.loss_reason_id,
    closedAt: r.closed_at,
    deletedAt: r.deleted_at,
    createdAt: r.created_at,
  };
}

// ── validation ─────────────────────────────────────────────────────────────────────────────────

function oneOf<T extends string>(field: string, allowed: readonly T[], value: unknown): T {
  if ((allowed as readonly unknown[]).includes(value)) return value as T;
  throw new InvalidInput(field, 'invalid');
}

function probabilityOf(field: string, value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 100) {
    throw new InvalidInput(field, 'invalid');
  }
  return value as number;
}

function amount(field: string, value: unknown): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0 ||
    (value as number) > DEAL_LIMITS.priceMax
  ) {
    throw new InvalidInput(field, 'invalid');
  }
  return value as number;
}

function note(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new InvalidInput('note', 'invalid');
  const v = value.replace(/\r\n?/g, '\n').trim();
  if (v.length > DEAL_LIMITS.note) throw new InvalidInput('note', 'too_long');
  return v || null;
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function day(field: string, value: unknown): string | null | undefined {
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

/** The free items (S131 „Element liber”); the value is their sum. */
export function normalizeItems(value: unknown): { items: DealItem[]; valueMinor: number } {
  if (value === undefined || value === null) return { items: [], valueMinor: 0 };
  if (!Array.isArray(value)) throw new InvalidInput('items', 'invalid');
  if (value.length > DEAL_LIMITS.items) throw new InvalidInput('items', 'too_many');
  let total = 0;
  const items = value.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new InvalidInput('items', 'invalid');
    const r = raw as Record<string, unknown>;
    if (r.kind !== undefined && r.kind !== 'free') throw new InvalidInput('items', 'not_available');
    const name = requiredText('items', r.name, DEAL_LIMITS.itemName);
    const quantity = r.quantity === undefined ? 1 : r.quantity;
    if (
      !Number.isInteger(quantity) ||
      (quantity as number) < 1 ||
      (quantity as number) > DEAL_LIMITS.quantityMax
    ) {
      throw new InvalidInput('items', 'invalid');
    }
    const unitPriceMinor = amount('items', r.unitPriceMinor);
    total += (quantity as number) * unitPriceMinor;
    return { kind: 'free' as const, name, quantity: quantity as number, unitPriceMinor };
  });
  if (!Number.isSafeInteger(total)) throw new InvalidInput('items', 'invalid');
  return { items, valueMinor: total };
}

function audit(
  exec: AuditSqlExecutor,
  ctx: TenantContext,
  action: string,
  targetType: 'crm_pipeline' | 'crm_stage' | 'crm_deal' | 'crm_loss_reason',
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

// ── pipelines and stages ───────────────────────────────────────────────────────────────────────

type PipelineRow = {
  id: string;
  key: string | null;
  name: string | null;
  is_default: boolean;
  sort_order: number;
  quota_operation_id: string | null;
  deleted_at: Date | null;
};
type StageRow = {
  id: string;
  pipeline_id: string;
  key: string | null;
  name: string | null;
  sort_order: number;
  probability: number;
};

const toStage = (r: StageRow): Stage => ({
  id: r.id,
  pipelineId: r.pipeline_id,
  key: r.key,
  name: r.name,
  sortOrder: r.sort_order,
  probability: r.probability,
});

async function readPipelines(client: PoolClient): Promise<Pipeline[]> {
  const { rows } = await client.query<PipelineRow>(
    `SELECT id, key, name, is_default, sort_order, quota_operation_id, deleted_at
       FROM crm.pipeline WHERE deleted_at IS NULL ORDER BY sort_order, created_at, id`,
  );
  const { rows: stages } = await client.query<StageRow>(
    `SELECT id, pipeline_id, key, name, sort_order, probability
       FROM crm.stage WHERE deleted_at IS NULL ORDER BY sort_order, created_at, id`,
  );
  return rows.map((p) => ({
    id: p.id,
    key: p.key,
    name: p.name,
    isDefault: p.is_default,
    sortOrder: p.sort_order,
    stages: stages.filter((s) => s.pipeline_id === p.id).map(toStage),
  }));
}

async function readPipeline(client: PoolClient, id: string, lock = false): Promise<PipelineRow> {
  const { rows } = await client.query<PipelineRow>(
    `SELECT id, key, name, is_default, sort_order, quota_operation_id, deleted_at
       FROM crm.pipeline WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
  if (!rows[0] || rows[0].deleted_at) throw new ResourceNotFound();
  return rows[0];
}

async function insertStages(
  client: PoolClient,
  ctx: TenantContext,
  pipelineId: string,
  stages: { key?: string; name?: string; probability: number }[],
) {
  let order = 0;
  for (const s of stages) {
    await client.query(
      `INSERT INTO crm.stage (id, organization_id, pipeline_id, key, name, sort_order, probability)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        uuidv7(),
        ctx.organizationId,
        pipelineId,
        s.key ?? null,
        s.name ?? null,
        order++,
        s.probability,
      ],
    );
  }
}

/** Reserves one unit of crm.pipelines, writes the pipeline in `write`, commits; releases on failure. */
async function withPipelineUnit<T>(
  ctx: TenantContext,
  id: string,
  write: (operationId: string) => Promise<T>,
): Promise<T> {
  const operationId = `crm.pipeline:${id}`;
  await reserveQuota(ctx, PIPELINES_QUOTA_KEY, 1, operationId);
  let result: T;
  try {
    result = await write(operationId);
  } catch (err) {
    await releaseQuota(ctx, operationId).catch(() => {});
    throw err;
  }
  await commitQuota(ctx, operationId).catch(() => {});
  return result;
}

/** The default pipeline at the first read; none at a 0 limit (QuotaExceeded is swallowed). */
async function ensureDefaultPipeline(ctx: TenantContext): Promise<void> {
  const exists = await withCrmTx(
    ctx.organizationId,
    async (client) =>
      (await client.query(`SELECT 1 FROM crm.pipeline WHERE is_default LIMIT 1`)).rows.length > 0,
    true,
  );
  if (exists) return;
  const id = uuidv7();
  try {
    await withPipelineUnit(ctx, id, (operationId) =>
      withCrmTx(ctx.organizationId, async (client) => {
        await client.query(
          `INSERT INTO crm.pipeline (id, organization_id, key, is_default, quota_operation_id)
           VALUES ($1, $2, 'sales', true, $3)`,
          [id, ctx.organizationId, operationId],
        );
        await insertStages(client, ctx, id, [...DEFAULT_STAGES]);
      }),
    );
  } catch (err) {
    if (err instanceof QuotaExceeded) return;
    // another request created it first (pipeline_default_key)
    if ((err as { code?: string }).code === '23505') return;
    throw err;
  }
}

export async function listPipelinesInOrg(ctx: TenantContext): Promise<Pipeline[]> {
  await ensureDefaultPipeline(ctx);
  return withCrmTx(ctx.organizationId, readPipelines, true);
}

function stageInputs(value: unknown): { name: string; probability: number }[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length < 1 || value.length > DEAL_LIMITS.stages) {
    throw new InvalidInput('stages', 'invalid');
  }
  return value.map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    return {
      name: requiredText('stages', r.name, DEAL_LIMITS.stageName),
      probability: probabilityOf('stages', r.probability ?? 0),
    };
  });
}

/** „Pipeline nou” (crm:settings): one unit of crm.pipelines; the glossary stages by default. */
export async function createPipelineInOrg(
  ctx: TenantContext,
  input: { name?: unknown; stages?: unknown },
): Promise<Pipeline> {
  const name = requiredText('name', input.name, DEAL_LIMITS.pipelineName);
  const stages = stageInputs(input.stages);
  await ensureDefaultPipeline(ctx);
  const id = uuidv7();
  return withPipelineUnit(ctx, id, (operationId) =>
    withCrmTx(ctx.organizationId, async (client, exec) => {
      const { rows } = await client.query<{ n: number }>(
        `SELECT COALESCE(max(sort_order), 0) + 1 AS n FROM crm.pipeline WHERE deleted_at IS NULL`,
      );
      // the first pipeline of a business that had none (a 0 limit before) becomes the default
      const { rows: def } = await client.query(`SELECT 1 FROM crm.pipeline WHERE is_default`);
      await client.query(
        `INSERT INTO crm.pipeline
           (id, organization_id, name, is_default, sort_order, quota_operation_id, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, ctx.organizationId, name, def.length === 0, rows[0]!.n, operationId, ctx.userId],
      );
      await insertStages(client, ctx, id, stages ?? [...DEFAULT_STAGES]);
      await audit(exec, ctx, AuditActions.crmPipelineCreated, 'crm_pipeline', id, {
        stages: (stages ?? DEFAULT_STAGES).length,
      });
      return (await readPipelines(client)).find((p) => p.id === id)!;
    }),
  );
}

/** Rename, or make it the default (the previous one stops being it). */
export async function updatePipelineInOrg(
  ctx: TenantContext,
  pipelineId: string,
  input: { name?: unknown; isDefault?: unknown },
): Promise<Pipeline> {
  const id = requireId('pipelineId', pipelineId);
  const name =
    input.name === undefined
      ? undefined
      : requiredText('name', input.name, DEAL_LIMITS.pipelineName);
  if (input.isDefault !== undefined && input.isDefault !== true) {
    throw new InvalidInput('isDefault', 'invalid');
  }
  if (name === undefined && input.isDefault === undefined)
    throw new InvalidInput('name', 'required');
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const row = await readPipeline(client, id, true);
    if (name !== undefined) {
      await client.query(`UPDATE crm.pipeline SET name = $2 WHERE id = $1`, [id, name]);
    }
    if (input.isDefault === true && !row.is_default) {
      await client.query(
        `UPDATE crm.pipeline SET is_default = false WHERE is_default AND id <> $1`,
        [id],
      );
      await client.query(`UPDATE crm.pipeline SET is_default = true WHERE id = $1`, [id]);
    }
    await audit(exec, ctx, AuditActions.crmPipelineUpdated, 'crm_pipeline', id, {
      fields: [...(name !== undefined ? ['name'] : []), ...(input.isDefault ? ['is_default'] : [])],
    });
    return (await readPipelines(client)).find((p) => p.id === id)!;
  });
}

/** Not the default one, not with open deals; frees its unit of crm.pipelines. */
export async function deletePipelineInOrg(ctx: TenantContext, pipelineId: string): Promise<void> {
  const id = requireId('pipelineId', pipelineId);
  const row = await withCrmTx(
    ctx.organizationId,
    async (client) => {
      const p = await readPipeline(client, id);
      if (p.is_default) throw new Conflict('pipeline_default');
      const open = await client.query(
        `SELECT 1 FROM crm.deal WHERE pipeline_id = $1 AND status = 'open' AND deleted_at IS NULL LIMIT 1`,
        [id],
      );
      if (open.rows.length) throw new Conflict('pipeline_has_deals');
      return p;
    },
    true,
  );
  if (row.quota_operation_id) {
    await freeStockQuota(
      ctx,
      PIPELINES_QUOTA_KEY,
      1,
      `crm.pipeline.delete:${row.quota_operation_id}`,
    );
  }
  await withCrmTx(ctx.organizationId, async (client, exec) => {
    const p = await readPipeline(client, id, true);
    if (p.is_default) throw new Conflict('pipeline_default');
    await client.query(
      `UPDATE crm.pipeline SET deleted_at = now(), deleted_by_user_id = $2 WHERE id = $1`,
      [id, ctx.userId],
    );
    await audit(exec, ctx, AuditActions.crmPipelineDeleted, 'crm_pipeline', id, {});
  });
}

/** The reconciliation resolver of crm.pipelines: held while the pipeline is active. */
export async function pipelineQuotaHeld(
  organizationId: string,
  operationId: string,
): Promise<boolean> {
  return withCrmTx(
    organizationId,
    async (client) =>
      (
        await client.query(
          `SELECT 1 FROM crm.pipeline WHERE quota_operation_id = $1 AND deleted_at IS NULL`,
          [operationId],
        )
      ).rows.length > 0,
    true,
  );
}

async function readStage(client: PoolClient, id: string, lock = false): Promise<StageRow> {
  const { rows } = await client.query<StageRow & { deleted_at: Date | null }>(
    `SELECT s.id, s.pipeline_id, s.key, s.name, s.sort_order, s.probability, s.deleted_at
       FROM crm.stage s JOIN crm.pipeline p ON p.id = s.pipeline_id AND p.deleted_at IS NULL
      WHERE s.id = $1${lock ? ' FOR UPDATE OF s' : ''}`,
    [id],
  );
  if (!rows[0] || rows[0].deleted_at) throw new ResourceNotFound();
  return rows[0];
}

/** „Editează etapele”: a new stage at the end. */
export async function createStageInOrg(
  ctx: TenantContext,
  pipelineId: string,
  input: { name?: unknown; probability?: unknown },
): Promise<Stage> {
  const id = requireId('pipelineId', pipelineId);
  const name = requiredText('name', input.name, DEAL_LIMITS.stageName);
  const probability = probabilityOf('probability', input.probability ?? 0);
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    await readPipeline(client, id, true);
    const { rows } = await client.query<{ n: string; next: number }>(
      `SELECT count(*) AS n, COALESCE(max(sort_order), -1) + 1 AS next
         FROM crm.stage WHERE pipeline_id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (Number(rows[0]!.n) >= DEAL_LIMITS.stages) throw new Conflict('stage_limit');
    const stageId = uuidv7();
    const { rows: created } = await client.query<StageRow>(
      `INSERT INTO crm.stage (id, organization_id, pipeline_id, name, sort_order, probability)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, pipeline_id, key, name, sort_order, probability`,
      [stageId, ctx.organizationId, id, name, rows[0]!.next, probability],
    );
    await audit(exec, ctx, AuditActions.crmStageCreated, 'crm_stage', stageId, {
      pipelineId: id,
      probability,
    });
    return toStage(created[0]!);
  });
}

/** Rename (a default stage gets its own name) or change the default probability. */
export async function updateStageInOrg(
  ctx: TenantContext,
  stageId: string,
  input: { name?: unknown; probability?: unknown },
): Promise<Stage> {
  const id = requireId('stageId', stageId);
  const name =
    input.name === undefined ? undefined : requiredText('name', input.name, DEAL_LIMITS.stageName);
  const probability =
    input.probability === undefined ? undefined : probabilityOf('probability', input.probability);
  if (name === undefined && probability === undefined) throw new InvalidInput('name', 'required');
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    await readStage(client, id, true);
    const { rows } = await client.query<StageRow>(
      `UPDATE crm.stage SET name = COALESCE($2, name), probability = COALESCE($3, probability)
        WHERE id = $1 RETURNING id, pipeline_id, key, name, sort_order, probability`,
      [id, name ?? null, probability ?? null],
    );
    await audit(exec, ctx, AuditActions.crmStageUpdated, 'crm_stage', id, {
      fields: [
        ...(name !== undefined ? ['name'] : []),
        ...(probability !== undefined ? ['probability'] : []),
      ],
    });
    return toStage(rows[0]!);
  });
}

/** The order of a pipeline's stages: every active stage, once. */
export async function reorderStagesInOrg(
  ctx: TenantContext,
  pipelineId: string,
  stageIds: unknown,
): Promise<Stage[]> {
  const id = requireId('pipelineId', pipelineId);
  if (!Array.isArray(stageIds)) throw new InvalidInput('stageIds', 'invalid');
  const order = stageIds.map((s) => requireId('stageIds', s));
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    await readPipeline(client, id, true);
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM crm.stage WHERE pipeline_id = $1 AND deleted_at IS NULL`,
      [id],
    );
    const current = new Set(rows.map((r) => r.id));
    if (
      order.length !== current.size ||
      new Set(order).size !== order.length ||
      order.some((s) => !current.has(s))
    ) {
      throw new InvalidInput('stageIds', 'invalid');
    }
    for (let i = 0; i < order.length; i++) {
      await client.query(`UPDATE crm.stage SET sort_order = $2 WHERE id = $1`, [order[i], i]);
    }
    await audit(exec, ctx, AuditActions.crmStageUpdated, 'crm_pipeline', id, {
      fields: ['sort_order'],
    });
    const { rows: stages } = await client.query<StageRow>(
      `SELECT id, pipeline_id, key, name, sort_order, probability FROM crm.stage
        WHERE pipeline_id = $1 AND deleted_at IS NULL ORDER BY sort_order`,
      [id],
    );
    return stages.map(toStage);
  });
}

/** Not with open deals; a pipeline keeps at least one stage. */
export async function deleteStageInOrg(ctx: TenantContext, stageId: string): Promise<void> {
  const id = requireId('stageId', stageId);
  await withCrmTx(ctx.organizationId, async (client, exec) => {
    const stage = await readStage(client, id, true);
    const open = await client.query(
      `SELECT 1 FROM crm.deal WHERE stage_id = $1 AND status = 'open' AND deleted_at IS NULL LIMIT 1`,
      [id],
    );
    if (open.rows.length) throw new Conflict('stage_has_deals');
    const { rows } = await client.query<{ n: string }>(
      `SELECT count(*) AS n FROM crm.stage WHERE pipeline_id = $1 AND deleted_at IS NULL`,
      [stage.pipeline_id],
    );
    if (Number(rows[0]!.n) <= 1) throw new Conflict('last_stage');
    await client.query(
      `UPDATE crm.stage SET deleted_at = now(), deleted_by_user_id = $2 WHERE id = $1`,
      [id, ctx.userId],
    );
    await audit(exec, ctx, AuditActions.crmStageDeleted, 'crm_stage', id, {
      pipelineId: stage.pipeline_id,
    });
  });
}

// ── loss reasons ───────────────────────────────────────────────────────────────────────────────

type LossReasonRow = { id: string; key: string | null; label: string | null; sort_order: number };
const toLossReason = (r: LossReasonRow): LossReason => ({
  id: r.id,
  key: r.key,
  label: r.label,
  sortOrder: r.sort_order,
});

async function ensureLossReasons(client: PoolClient, ctx: TenantContext): Promise<void> {
  const { rows } = await client.query(
    `SELECT 1 FROM crm.loss_reason WHERE key IS NOT NULL LIMIT 1`,
  );
  if (rows.length) return;
  let order = 0;
  for (const key of DEFAULT_LOSS_REASONS) {
    await client.query(
      `INSERT INTO crm.loss_reason (id, organization_id, key, sort_order) VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id, key) WHERE key IS NOT NULL DO NOTHING`,
      [uuidv7(), ctx.organizationId, key, order++],
    );
  }
}

export async function listLossReasonsInOrg(ctx: TenantContext): Promise<LossReason[]> {
  return withCrmTx(ctx.organizationId, async (client) => {
    await ensureLossReasons(client, ctx);
    const { rows } = await client.query<LossReasonRow>(
      `SELECT id, key, label, sort_order FROM crm.loss_reason
        WHERE deleted_at IS NULL ORDER BY sort_order, created_at, id`,
    );
    return rows.map(toLossReason);
  });
}

export async function createLossReasonInOrg(
  ctx: TenantContext,
  input: { label?: unknown },
): Promise<LossReason> {
  const label = requiredText('label', input.label, DEAL_LIMITS.lossLabel);
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    await ensureLossReasons(client, ctx);
    const id = uuidv7();
    const { rows } = await client.query<LossReasonRow>(
      `INSERT INTO crm.loss_reason (id, organization_id, label, sort_order)
       SELECT $1, $2, $3, COALESCE(max(sort_order), -1) + 1 FROM crm.loss_reason
       RETURNING id, key, label, sort_order`,
      [id, ctx.organizationId, label],
    );
    await audit(exec, ctx, AuditActions.crmLossReasonCreated, 'crm_loss_reason', id, {});
    return toLossReason(rows[0]!);
  });
}

/** A default reason renamed keeps its key (the label shows instead of the translation). */
export async function updateLossReasonInOrg(
  ctx: TenantContext,
  lossReasonId: string,
  input: { label?: unknown },
): Promise<LossReason> {
  const id = requireId('lossReasonId', lossReasonId);
  const label = requiredText('label', input.label, DEAL_LIMITS.lossLabel);
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const { rows } = await client.query<LossReasonRow>(
      `UPDATE crm.loss_reason SET label = $2 WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, key, label, sort_order`,
      [id, label],
    );
    if (!rows[0]) throw new ResourceNotFound();
    await audit(exec, ctx, AuditActions.crmLossReasonUpdated, 'crm_loss_reason', id, {});
    return toLossReason(rows[0]);
  });
}

/** Out of the list; the deals lost with it keep it. */
export async function deleteLossReasonInOrg(
  ctx: TenantContext,
  lossReasonId: string,
): Promise<void> {
  const id = requireId('lossReasonId', lossReasonId);
  await withCrmTx(ctx.organizationId, async (client, exec) => {
    const { rows } = await client.query(
      `UPDATE crm.loss_reason SET deleted_at = now(), deleted_by_user_id = $2
        WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id, ctx.userId],
    );
    if (!rows[0]) throw new ResourceNotFound();
    await audit(exec, ctx, AuditActions.crmLossReasonDeleted, 'crm_loss_reason', id, {});
  });
}

// ── deals ──────────────────────────────────────────────────────────────────────────────────────

function visible(ctx: TenantContext, scope: ContactScope, row: { owner_user_id: string | null }) {
  return scope === 'all' || row.owner_user_id === null || row.owner_user_id === ctx.userId;
}

async function readDeal(client: PoolClient, id: string, lock = false): Promise<DealRow> {
  if (lock) await client.query(`SELECT 1 FROM crm.deal WHERE id = $1 FOR UPDATE`, [id]);
  const { rows } = await client.query<DealRow>(
    `SELECT ${DEAL_COLUMNS} FROM crm.deal d WHERE d.id = $1`,
    [id],
  );
  if (!rows[0]) throw new ResourceNotFound();
  return rows[0];
}

/** A visible deal, locked, not in the bin. */
async function writableDeal(
  client: PoolClient,
  ctx: TenantContext,
  scope: ContactScope,
  id: string,
): Promise<DealRow> {
  const row = await readDeal(client, id, true);
  if (!visible(ctx, scope, row)) throw new Forbidden();
  if (row.deleted_at) throw new Conflict('deal_deleted');
  return row;
}

async function ownerFor(
  ctx: TenantContext,
  scope: ContactScope,
  value: unknown,
): Promise<string | null> {
  if (value === null) return null;
  const owner = requireId('ownerUserId', value);
  if (scope === 'own' && owner !== ctx.userId) throw new Forbidden();
  if (owner !== ctx.userId) await requireMentionable(ctx, null, [owner], 'ownerUserId');
  return owner;
}

/** The contact and the company of a deal: visible to the person, not in the bin. */
async function checkParties(
  client: PoolClient,
  ctx: TenantContext,
  scope: ContactScope,
  contactId: string | null,
  companyId: string | null,
) {
  if (!contactId && !companyId) throw new InvalidInput('contactId', 'required');
  if (contactId) await readSubject(client, ctx, scope, 'contact', contactId, { write: true });
  if (companyId) await readSubject(client, ctx, scope, 'company', companyId, { write: true });
}

const optionalId = (field: string, value: unknown) =>
  value === undefined ? undefined : value === null ? null : requireId(field, value);

export type DealInput = {
  title?: unknown;
  contactId?: unknown;
  companyId?: unknown;
  currency?: unknown;
  items?: unknown;
  probability?: unknown;
  expectedCloseOn?: unknown;
};

/** „Deal nou”: the default pipeline and its first stage unless given; the probability from it. */
export async function createDealInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  input: DealInput & {
    pipelineId?: unknown;
    stageId?: unknown;
    ownerUserId?: unknown;
    leadId?: unknown;
  },
): Promise<Deal> {
  const title = requiredText('title', input.title, DEAL_LIMITS.title);
  const contactId = optionalId('contactId', input.contactId) ?? null;
  const companyId = optionalId('companyId', input.companyId) ?? null;
  const currency =
    input.currency === undefined ? 'RON' : oneOf('currency', CURRENCIES, input.currency);
  const { items, valueMinor } = normalizeItems(input.items);
  const probability =
    input.probability === undefined ? undefined : probabilityOf('probability', input.probability);
  const expectedCloseOn = day('expectedCloseOn', input.expectedCloseOn) ?? null;
  const owner =
    input.ownerUserId === undefined ? ctx.userId : await ownerFor(ctx, scope, input.ownerUserId);
  const leadId = optionalId('leadId', input.leadId) ?? null;
  if (input.pipelineId === undefined) await ensureDefaultPipeline(ctx);

  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const pipelineId =
      input.pipelineId === undefined
        ? (await client.query<{ id: string }>(`SELECT id FROM crm.pipeline WHERE is_default`))
            .rows[0]?.id
        : requireId('pipelineId', input.pipelineId);
    if (!pipelineId) throw new Conflict('no_pipeline');
    await readPipeline(client, pipelineId);
    let stage: StageRow;
    if (input.stageId === undefined) {
      const { rows } = await client.query<StageRow>(
        `SELECT id, pipeline_id, key, name, sort_order, probability FROM crm.stage
          WHERE pipeline_id = $1 AND deleted_at IS NULL ORDER BY sort_order LIMIT 1`,
        [pipelineId],
      );
      if (!rows[0]) throw new Conflict('no_stage');
      stage = rows[0];
    } else {
      stage = await readStage(client, requireId('stageId', input.stageId));
      if (stage.pipeline_id !== pipelineId) throw new InvalidInput('stageId', 'invalid');
    }
    await checkParties(client, ctx, scope, contactId, companyId);
    if (leadId) await readSubject(client, ctx, scope, 'lead', leadId);
    const id = uuidv7();
    await client.query(
      `INSERT INTO crm.deal
         (id, organization_id, pipeline_id, stage_id, title, contact_id, company_id, lead_id, currency,
          items, value_minor, probability, expected_close_on, owner_user_id, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13::date, $14, $15)`,
      [
        id,
        ctx.organizationId,
        pipelineId,
        stage.id,
        title,
        contactId,
        companyId,
        leadId,
        currency,
        JSON.stringify(items),
        valueMinor,
        probability ?? stage.probability,
        expectedCloseOn,
        owner,
        ctx.userId,
      ],
    );
    await client.query(
      `INSERT INTO crm.deal_stage_change (id, organization_id, deal_id, from_stage_id, to_stage_id, changed_by_user_id)
       VALUES ($1, $2, $3, NULL, $4, $5)`,
      [uuidv7(), ctx.organizationId, id, stage.id, ctx.userId],
    );
    await audit(exec, ctx, AuditActions.crmDealCreated, 'crm_deal', id, {
      pipelineId,
      stageId: stage.id,
      valueMinor,
      currency,
      ownerUserId: owner,
      leadId,
    });
    return toDeal(await readDeal(client, id));
  });
}

const DEAL_FIELDS = {
  title: 'title',
  contactId: 'contact_id',
  companyId: 'company_id',
  currency: 'currency',
  items: 'items',
  probability: 'probability',
  expectedCloseOn: 'expected_close_on',
  ownerUserId: 'owner_user_id',
} as const;

/** The deal's details; only the fields sent. */
export async function updateDealInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  dealId: string,
  input: DealInput & { ownerUserId?: unknown },
): Promise<Deal> {
  const id = requireId('dealId', dealId);
  const values: Record<string, unknown> = {};
  if (input.title !== undefined)
    values.title = requiredText('title', input.title, DEAL_LIMITS.title);
  if (input.contactId !== undefined) values.contactId = optionalId('contactId', input.contactId);
  if (input.companyId !== undefined) values.companyId = optionalId('companyId', input.companyId);
  if (input.currency !== undefined) values.currency = oneOf('currency', CURRENCIES, input.currency);
  let valueMinor: number | undefined;
  if (input.items !== undefined) {
    const n = normalizeItems(input.items);
    values.items = JSON.stringify(n.items);
    valueMinor = n.valueMinor;
  }
  if (input.probability !== undefined)
    values.probability = probabilityOf('probability', input.probability);
  if (input.expectedCloseOn !== undefined)
    values.expectedCloseOn = day('expectedCloseOn', input.expectedCloseOn);
  if (input.ownerUserId !== undefined)
    values.ownerUserId = await ownerFor(ctx, scope, input.ownerUserId);
  const fields = Object.keys(values) as (keyof typeof DEAL_FIELDS)[];
  if (!fields.length) throw new InvalidInput('title', 'required');

  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const row = await writableDeal(client, ctx, scope, id);
    const contactId = 'contactId' in values ? (values.contactId as string | null) : row.contact_id;
    const companyId = 'companyId' in values ? (values.companyId as string | null) : row.company_id;
    if (!contactId && !companyId) throw new InvalidInput('contactId', 'required');
    // only a party that changed is checked again (the other one stays as it is)
    if ('contactId' in values && contactId) {
      await readSubject(client, ctx, scope, 'contact', contactId, { write: true });
    }
    if ('companyId' in values && companyId) {
      await readSubject(client, ctx, scope, 'company', companyId, { write: true });
    }
    const sets = fields.map((k, i) => {
      const cast = k === 'items' ? '::jsonb' : k === 'expectedCloseOn' ? '::date' : '';
      return `${DEAL_FIELDS[k]} = $${i + 2}${cast}`;
    });
    if (valueMinor !== undefined) sets.push(`value_minor = $${fields.length + 2}`);
    await client.query(`UPDATE crm.deal SET ${sets.join(', ')} WHERE id = $1`, [
      id,
      ...fields.map((k) => values[k]),
      ...(valueMinor !== undefined ? [valueMinor] : []),
    ]);
    await audit(exec, ctx, AuditActions.crmDealUpdated, 'crm_deal', id, {
      fields: fields.map((k) => DEAL_FIELDS[k]),
      ...(valueMinor !== undefined ? { valueMinor } : {}),
    });
    return toDeal(await readDeal(client, id));
  });
}

/** The move to another stage of the same pipeline (the kanban); the probability follows it. */
export async function moveDealInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  dealId: string,
  stageId: unknown,
): Promise<Deal> {
  const id = requireId('dealId', dealId);
  const to = requireId('stageId', stageId);
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const row = await writableDeal(client, ctx, scope, id);
    if (row.status !== 'open') throw new Conflict('deal_closed');
    const stage = await readStage(client, to);
    if (stage.pipeline_id !== row.pipeline_id) throw new InvalidInput('stageId', 'invalid');
    if (stage.id === row.stage_id) return toDeal(row);
    await client.query(
      `UPDATE crm.deal SET stage_id = $2, probability = $3, stage_changed_at = now() WHERE id = $1`,
      [id, stage.id, stage.probability],
    );
    await client.query(
      `INSERT INTO crm.deal_stage_change (id, organization_id, deal_id, from_stage_id, to_stage_id, changed_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv7(), ctx.organizationId, id, row.stage_id, stage.id, ctx.userId],
    );
    await audit(exec, ctx, AuditActions.crmDealStageChanged, 'crm_deal', id, {
      fromStageId: row.stage_id,
      stageId: stage.id,
    });
    return toDeal(await readDeal(client, id));
  });
}

const today = () => new Date().toISOString().slice(0, 10);

/** „Câștigat”: the final value (the deal's by default), the day (today by default), why. */
export async function winDealInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  dealId: string,
  input: { valueMinor?: unknown; closedOn?: unknown; note?: unknown },
): Promise<Deal> {
  const id = requireId('dealId', dealId);
  const closedOn = day('closedOn', input.closedOn) ?? today();
  const why = note(input.note);
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const row = await writableDeal(client, ctx, scope, id);
    if (row.status !== 'open') throw new Conflict('deal_closed');
    const value =
      input.valueMinor === undefined
        ? Number(row.value_minor)
        : amount('valueMinor', input.valueMinor);
    await client.query(
      `UPDATE crm.deal SET status = 'won', won_value_minor = $2, closed_on = $3::date, close_note = $4,
              closed_at = now(), closed_by_user_id = $5
        WHERE id = $1`,
      [id, value, closedOn, why, ctx.userId],
    );
    await audit(exec, ctx, AuditActions.crmDealWon, 'crm_deal', id, {
      valueMinor: value,
      currency: row.currency,
      stageId: row.stage_id,
    });
    return toDeal(await readDeal(client, id));
  });
}

/** „Pierdut”: a reason from the business's list (required, S131), a note. */
export async function loseDealInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  dealId: string,
  input: { lossReasonId?: unknown; closedOn?: unknown; note?: unknown },
): Promise<Deal> {
  const id = requireId('dealId', dealId);
  if (input.lossReasonId === undefined || input.lossReasonId === null) {
    throw new InvalidInput('lossReasonId', 'required');
  }
  const reasonId = requireId('lossReasonId', input.lossReasonId);
  const closedOn = day('closedOn', input.closedOn) ?? today();
  const why = note(input.note);
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const row = await writableDeal(client, ctx, scope, id);
    if (row.status !== 'open') throw new Conflict('deal_closed');
    const { rows } = await client.query(
      `SELECT 1 FROM crm.loss_reason WHERE id = $1 AND deleted_at IS NULL`,
      [reasonId],
    );
    if (!rows.length) throw new InvalidInput('lossReasonId', 'invalid');
    await client.query(
      `UPDATE crm.deal SET status = 'lost', loss_reason_id = $2, closed_on = $3::date, close_note = $4,
              closed_at = now(), closed_by_user_id = $5
        WHERE id = $1`,
      [id, reasonId, closedOn, why, ctx.userId],
    );
    await audit(exec, ctx, AuditActions.crmDealLost, 'crm_deal', id, {
      lossReasonId: reasonId,
      stageId: row.stage_id,
    });
    return toDeal(await readDeal(client, id));
  });
}

/** A won or lost deal comes back open, in the stage it was in. */
export async function reopenDealInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  dealId: string,
): Promise<Deal> {
  const id = requireId('dealId', dealId);
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const row = await writableDeal(client, ctx, scope, id);
    if (row.status === 'open') throw new Conflict('deal_open');
    await client.query(
      `UPDATE crm.deal SET status = 'open', won_value_minor = NULL, closed_on = NULL, close_note = NULL,
              loss_reason_id = NULL, closed_at = NULL, closed_by_user_id = NULL
        WHERE id = $1`,
      [id],
    );
    await audit(exec, ctx, AuditActions.crmDealReopened, 'crm_deal', id, { from: row.status });
    return toDeal(await readDeal(client, id));
  });
}

export async function deleteDealInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  dealId: string,
): Promise<Deal> {
  const id = requireId('dealId', dealId);
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const row = await readDeal(client, id, true);
    if (!visible(ctx, scope, row)) throw new Forbidden();
    if (row.deleted_at) return toDeal(row);
    await client.query(
      `UPDATE crm.deal SET deleted_at = now(), deleted_by_user_id = $2 WHERE id = $1`,
      [id, ctx.userId],
    );
    await audit(exec, ctx, AuditActions.crmDealDeleted, 'crm_deal', id, { status: row.status });
    return toDeal(await readDeal(client, id));
  });
}

export async function getDealInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  dealId: string,
): Promise<Deal> {
  const id = requireId('dealId', dealId);
  const row = await withCrmTx(ctx.organizationId, (client) => readDeal(client, id), true);
  if (!visible(ctx, scope, row)) throw new Forbidden();
  return toDeal(row);
}

export type ListDealsParams = {
  pipelineId?: unknown;
  /** 'open' (default), 'won', 'lost' or 'all'. */
  status?: unknown;
  /** 'team' (default), 'mine' („Doar ale mele”) or a member's id. */
  who?: unknown;
  contactId?: unknown;
  companyId?: unknown;
  /** Open deals with no move (stage or activity) for at least N days. */
  stuckDays?: unknown;
  limit?: unknown;
  offset?: unknown;
};

function dealFilters(ctx: TenantContext, scope: ContactScope, params: ListDealsParams) {
  const where: string[] = ['d.deleted_at IS NULL'];
  const args: unknown[] = [];
  const arg = (v: unknown) => {
    args.push(v);
    return `$${args.length}`;
  };
  if (scope !== 'all')
    where.push(`(d.owner_user_id IS NULL OR d.owner_user_id = ${arg(ctx.userId)}::uuid)`);
  if (params.pipelineId !== undefined)
    where.push(`d.pipeline_id = ${arg(requireId('pipelineId', params.pipelineId))}::uuid`);
  const who = params.who ?? 'team';
  if (who === 'mine') where.push(`d.owner_user_id = ${arg(ctx.userId)}::uuid`);
  else if (isUuid(who)) where.push(`d.owner_user_id = ${arg(who.toLowerCase())}::uuid`);
  else if (who !== 'team') throw new InvalidInput('who', 'invalid');
  if (params.contactId !== undefined)
    where.push(`d.contact_id = ${arg(requireId('contactId', params.contactId))}::uuid`);
  if (params.companyId !== undefined)
    where.push(`d.company_id = ${arg(requireId('companyId', params.companyId))}::uuid`);
  return { where, args, arg };
}

/** The deals, by stage order then the newest. */
export async function listDealsInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  params: ListDealsParams,
): Promise<Deal[]> {
  const { limit, offset } = page(params);
  const { where, args, arg } = dealFilters(ctx, scope, params);
  const status = params.status ?? 'open';
  if (status === 'open' || status === 'won' || status === 'lost')
    where.push(`d.status = ${arg(status)}`);
  else if (status !== 'all') throw new InvalidInput('status', 'invalid');
  let stuck = '';
  if (params.stuckDays !== undefined) {
    const n = params.stuckDays;
    if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > 365)
      throw new InvalidInput('stuckDays', 'invalid');
    where.push(`d.status = 'open'`);
    stuck = `WHERE x.last_moved_at < now() - make_interval(days => ${arg(n)}::int)`;
  }
  return withCrmTx(
    ctx.organizationId,
    async (client) => {
      const { rows } = await client.query<DealRow>(
        `SELECT x.* FROM (
           SELECT ${DEAL_COLUMNS}, s.sort_order AS stage_order
             FROM crm.deal d JOIN crm.stage s ON s.id = d.stage_id
            WHERE ${where.join(' AND ')}
         ) x ${stuck}
         ORDER BY x.stage_order, x.created_at DESC, x.id
         LIMIT ${arg(limit)} OFFSET ${arg(offset)}`,
        args,
      );
      return rows.map(toDeal);
    },
    true,
  );
}

export type Board = {
  stages: { stageId: string; count: number; value: Record<string, number> }[];
  open: { count: number; value: Record<string, number>; weighted: Record<string, number> };
  /** Won this calendar month (UTC). */
  wonThisMonth: { count: number; value: Record<string, number> };
};

/** The kanban header: per stage, the open total, weighted by probability, won this month. */
export async function getBoardInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  params: { pipelineId: unknown; who?: unknown },
): Promise<Board> {
  const { where, args } = dealFilters(ctx, scope, {
    pipelineId: params.pipelineId,
    who: params.who,
  });
  return withCrmTx(
    ctx.organizationId,
    async (client) => {
      const { rows } = await client.query<{
        stage_id: string;
        currency: string;
        status: string;
        won_month: boolean;
        n: string;
        value: string;
        weighted: string;
      }>(
        `SELECT d.stage_id, d.currency, d.status,
                (d.status = 'won' AND date_trunc('month', d.closed_on) = date_trunc('month', now())) AS won_month,
                count(*) AS n,
                sum(CASE WHEN d.status = 'won' THEN d.won_value_minor ELSE d.value_minor END) AS value,
                sum(d.value_minor * d.probability / 100.0) AS weighted
           FROM crm.deal d
          WHERE ${where.join(' AND ')}
          GROUP BY 1, 2, 3, 4`,
        args,
      );
      const board: Board = {
        stages: [],
        open: { count: 0, value: {}, weighted: {} },
        wonThisMonth: { count: 0, value: {} },
      };
      const add = (m: Record<string, number>, k: string, v: number) => {
        m[k] = (m[k] ?? 0) + v;
      };
      const byStage = new Map<string, Board['stages'][number]>();
      for (const r of rows) {
        if (r.status === 'open') {
          const s = byStage.get(r.stage_id) ?? { stageId: r.stage_id, count: 0, value: {} };
          s.count += Number(r.n);
          add(s.value, r.currency, Number(r.value));
          byStage.set(r.stage_id, s);
          board.open.count += Number(r.n);
          add(board.open.value, r.currency, Number(r.value));
          add(board.open.weighted, r.currency, Math.round(Number(r.weighted)));
        } else if (r.won_month) {
          board.wonThisMonth.count += Number(r.n);
          add(board.wonThisMonth.value, r.currency, Number(r.value));
        }
      }
      board.stages = [...byStage.values()];
      return board;
    },
    true,
  );
}

export type StageChange = {
  fromStageId: string | null;
  toStageId: string;
  changedByUserId: string;
  changedAt: Date;
};

/** The moves of a deal (oldest first), for its history. */
export async function stageChangesOf(client: PoolClient, dealId: string): Promise<StageChange[]> {
  const { rows } = await client.query<{
    from_stage_id: string | null;
    to_stage_id: string;
    changed_by_user_id: string;
    changed_at: Date;
  }>(
    `SELECT from_stage_id, to_stage_id, changed_by_user_id, changed_at FROM crm.deal_stage_change
      WHERE deal_id = $1 ORDER BY changed_at, id`,
    [dealId],
  );
  return rows.map((r) => ({
    fromStageId: r.from_stage_id,
    toStageId: r.to_stage_id,
    changedByUserId: r.changed_by_user_id,
    changedAt: r.changed_at,
  }));
}
