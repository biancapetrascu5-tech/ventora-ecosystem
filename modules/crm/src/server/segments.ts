import type { PoolClient } from 'pg';
import type { TenantContext } from '@ventora/access';
import { AuditActions, appendAuditEventInTx, type AuditSqlExecutor } from '@ventora/audit';
import { uuidv7 } from '@ventora/db-kit';
import { Conflict, Forbidden, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { withCrmTx } from './db';
import { MANUAL_SOURCES, SOURCES, requireId, requiredText } from './validation';
import type { ContactScope } from './contacts';

/*
 * Lot CR.4 — the segments of ClientDesk (design S130 ClientDeskSegments; D-CRM-5 = a: a saved list
 * for work and export, CampaignKit may use it as an audience through its integration).
 *
 * - The criteria are only those of S130 that exist now: source, tag, owner, date added, company,
 *   birthday. Client state, last visit and marketing consent come with CR.12 / CR.14. The EasyBook
 *   „Risc ridicat” note, the blocked clients and the health data are never criteria (S130).
 * - A segment updates itself: its rules are evaluated on every read (no stored membership).
 * - Who sees it: „Toată echipa” (default, S130) or „Doar eu”. A member sees in any segment only
 *   their contacts and the unassigned ones (D-CRM-15). The author or crm:admin changes a segment.
 * - The predefined „N-au mai venit de N zile” (kind lapsed): created by ClientDesk on first read,
 *   only its days change (settings.lapsed_segment_days, 7–365, crm:settings). It needs the visits
 *   from EasyBook (CR.12): until then its count is not available.
 */

export const SEGMENT_LIMITS = { name: 80, rules: 20, days: 3650 } as const;

export type SegmentRule =
  | { field: 'source'; op: 'is' | 'is_not'; value: string }
  | { field: 'tag'; op: 'has' | 'has_not'; value: string }
  | { field: 'owner'; op: 'is'; value: string }
  | { field: 'created'; op: 'within_days' | 'before_days'; value: number }
  | { field: 'company'; op: 'is'; value: string }
  | { field: 'company'; op: 'any' | 'none' }
  | { field: 'birthday'; op: 'in_month'; value: number }
  | { field: 'birthday'; op: 'next_days'; value: number };

export type Segment = {
  id: string;
  name: string;
  kind: 'custom' | 'lapsed';
  rules: SegmentRule[];
  match: 'all' | 'any';
  visibility: 'me' | 'team';
  createdByUserId: string | null;
  /** The days of the predefined segment (kind lapsed). */
  lapsedDays: number | null;
  createdAt: Date;
  updatedAt: Date;
};

type SegmentRow = {
  id: string;
  name: string;
  kind: 'custom' | 'lapsed';
  rules: SegmentRule[];
  match: 'all' | 'any';
  visibility: 'me' | 'team';
  created_by_user_id: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

const COLUMNS = `id, name, kind, rules, match, visibility, created_by_user_id, deleted_at, created_at, updated_at`;

function toSegment(r: SegmentRow, lapsedDays: number | null): Segment {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    rules: r.rules,
    match: r.match,
    visibility: r.visibility,
    createdByUserId: r.created_by_user_id,
    lapsedDays: r.kind === 'lapsed' ? lapsedDays : null,
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
    targetType: 'crm_segment',
    targetId,
    metadata,
  });
}

const int = (v: unknown, field: string, min: number, max: number) => {
  if (!Number.isInteger(v) || (v as number) < min || (v as number) > max)
    throw new InvalidInput(field, 'invalid');
  return v as number;
};

/** Validates the rules of a segment (only the criteria that exist, S130). */
export function validateRules(raw: unknown): SegmentRule[] {
  if (!Array.isArray(raw)) throw new InvalidInput('rules', 'invalid');
  if (raw.length > SEGMENT_LIMITS.rules) throw new InvalidInput('rules', 'too_many');
  return raw.map((r, i): SegmentRule => {
    const f = `rules.${i}`;
    const rule = r as Record<string, unknown>;
    if (!rule || typeof rule !== 'object') throw new InvalidInput(f, 'invalid');
    switch (rule.field) {
      case 'source':
        if (rule.op !== 'is' && rule.op !== 'is_not') throw new InvalidInput(f, 'invalid');
        if (!(SOURCES as readonly unknown[]).includes(rule.value))
          throw new InvalidInput(f, 'invalid');
        return { field: 'source', op: rule.op, value: rule.value as string };
      case 'tag':
        if (rule.op !== 'has' && rule.op !== 'has_not') throw new InvalidInput(f, 'invalid');
        return { field: 'tag', op: rule.op, value: requireId(f, rule.value) };
      case 'owner':
        if (rule.op !== 'is') throw new InvalidInput(f, 'invalid');
        if (rule.value === 'me' || rule.value === 'unassigned')
          return { field: 'owner', op: 'is', value: rule.value };
        return { field: 'owner', op: 'is', value: requireId(f, rule.value) };
      case 'created':
        if (rule.op !== 'within_days' && rule.op !== 'before_days')
          throw new InvalidInput(f, 'invalid');
        return { field: 'created', op: rule.op, value: int(rule.value, f, 1, SEGMENT_LIMITS.days) };
      case 'company':
        if (rule.op === 'any' || rule.op === 'none') return { field: 'company', op: rule.op };
        if (rule.op !== 'is') throw new InvalidInput(f, 'invalid');
        return { field: 'company', op: 'is', value: requireId(f, rule.value) };
      case 'birthday':
        if (rule.op === 'in_month')
          return { field: 'birthday', op: 'in_month', value: int(rule.value, f, 1, 12) };
        if (rule.op === 'next_days')
          return { field: 'birthday', op: 'next_days', value: int(rule.value, f, 1, 366) };
        throw new InvalidInput(f, 'invalid');
      default:
        // client state, last visit, consent: CR.12 / CR.14; the EasyBook note and health: never
        throw new InvalidInput(f, 'unknown_field');
    }
  });
}

/**
 * The SQL of the rules, on crm.contact, with its parameters appended to `args` (`arg` returns the
 * placeholder). An empty list matches every contact.
 */
export function rulesSql(
  rules: SegmentRule[],
  match: 'all' | 'any',
  arg: (v: unknown) => string,
  userId: string,
): string {
  if (rules.length === 0) return 'TRUE';
  const parts = rules.map((r) => {
    switch (r.field) {
      case 'source':
        return r.op === 'is' ? `source = ${arg(r.value)}` : `source <> ${arg(r.value)}`;
      case 'tag':
        return r.op === 'has'
          ? `${arg(r.value)}::uuid = ANY(tag_ids)`
          : `NOT (${arg(r.value)}::uuid = ANY(tag_ids))`;
      case 'owner':
        if (r.value === 'unassigned') return 'owner_user_id IS NULL';
        return `owner_user_id = ${arg(r.value === 'me' ? userId : r.value)}::uuid`;
      case 'created':
        return r.op === 'within_days'
          ? `created_at >= now() - make_interval(days => ${arg(r.value)}::int)`
          : `created_at < now() - make_interval(days => ${arg(r.value)}::int)`;
      case 'company':
        if (r.op === 'any') return 'company_id IS NOT NULL';
        if (r.op === 'none') return 'company_id IS NULL';
        return `company_id = ${arg((r as { value: string }).value)}::uuid`;
      case 'birthday':
        if (r.op === 'in_month')
          return `birthday IS NOT NULL AND extract(month FROM birthday) = ${arg(r.value)}::int`;
        // the next N days, across the year end: the birthday of this year or the next one
        return `birthday IS NOT NULL AND (
          make_date(extract(year FROM current_date)::int, extract(month FROM birthday)::int,
                    LEAST(extract(day FROM birthday)::int, 28)) - current_date BETWEEN 0 AND ${arg(r.value)}::int
          OR make_date(extract(year FROM current_date)::int + 1, extract(month FROM birthday)::int,
                    LEAST(extract(day FROM birthday)::int, 28)) - current_date BETWEEN 0 AND ${arg(r.value)}::int)`;
    }
  });
  return `(${parts.join(match === 'all' ? ' AND ' : ' OR ')})`;
}

async function lapsedDays(client: PoolClient): Promise<number> {
  const { rows } = await client.query<{ d: number }>(
    `SELECT lapsed_segment_days AS d FROM crm.settings`,
  );
  return rows[0]?.d ?? 60;
}

/** The predefined segment of the business, created on first read. */
async function ensureLapsed(client: PoolClient, organizationId: string): Promise<void> {
  await client.query(
    `INSERT INTO crm.segment (id, organization_id, name, kind, visibility)
     VALUES ($1, $2, 'N-au mai venit', 'lapsed', 'team') ON CONFLICT DO NOTHING`,
    [uuidv7(), organizationId],
  );
}

function canSee(ctx: TenantContext, s: SegmentRow) {
  return s.visibility === 'team' || s.created_by_user_id === ctx.userId;
}

async function readSegment(
  client: PoolClient,
  ctx: TenantContext,
  id: string,
  lock = false,
): Promise<SegmentRow> {
  const { rows } = await client.query<SegmentRow>(
    `SELECT ${COLUMNS} FROM crm.segment WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
  const s = rows[0];
  if (!s || s.deleted_at || !canSee(ctx, s)) throw new ResourceNotFound();
  return s;
}

/** The segments the person sees: the team's and their own; the predefined one first. */
export async function listSegmentsInOrg(ctx: TenantContext): Promise<Segment[]> {
  return withCrmTx(ctx.organizationId, async (client) => {
    await ensureLapsed(client, ctx.organizationId);
    const days = await lapsedDays(client);
    const { rows } = await client.query<SegmentRow>(
      `SELECT ${COLUMNS} FROM crm.segment
        WHERE deleted_at IS NULL AND (visibility = 'team' OR created_by_user_id = $1)
        ORDER BY (kind = 'lapsed') DESC, lower(name), id`,
      [ctx.userId],
    );
    return rows.map((r) => toSegment(r, days));
  });
}

export async function getSegmentInOrg(ctx: TenantContext, segmentId: string): Promise<Segment> {
  const id = requireId('segmentId', segmentId);
  return withCrmTx(
    ctx.organizationId,
    async (client) => toSegment(await readSegment(client, ctx, id), await lapsedDays(client)),
    true,
  );
}

/** How many contacts a segment (or rules not saved yet) matches now, within what the person sees. */
export async function countSegmentInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  input: { segmentId?: unknown; rules?: unknown; match?: unknown },
): Promise<{ count: number | null; available: boolean }> {
  return withCrmTx(
    ctx.organizationId,
    async (client) => {
      let rules: SegmentRule[];
      let match: 'all' | 'any';
      if (input.segmentId !== undefined) {
        const s = await readSegment(client, ctx, requireId('segmentId', input.segmentId));
        // the predefined segment needs the visits from EasyBook (CR.12)
        if (s.kind === 'lapsed') return { count: null, available: false };
        rules = s.rules;
        match = s.match;
      } else {
        rules = validateRules(input.rules ?? []);
        match = input.match === 'any' ? 'any' : 'all';
      }
      const args: unknown[] = [];
      const arg = (v: unknown) => {
        args.push(v);
        return `$${args.length}`;
      };
      const where = [`deleted_at IS NULL`, rulesSql(rules, match, arg, ctx.userId)];
      if (scope === 'own')
        where.push(`(owner_user_id IS NULL OR owner_user_id = ${arg(ctx.userId)}::uuid)`);
      const { rows } = await client.query<{ n: string }>(
        `SELECT count(*) AS n FROM crm.contact WHERE ${where.join(' AND ')}`,
        args,
      );
      return { count: Number(rows[0]?.n ?? 0), available: true };
    },
    true,
  );
}

function normalizeVisibility(v: unknown): 'me' | 'team' | undefined {
  if (v === undefined) return undefined;
  if (v !== 'me' && v !== 'team') throw new InvalidInput('visibility', 'invalid');
  return v;
}

function normalizeMatch(v: unknown): 'all' | 'any' | undefined {
  if (v === undefined) return undefined;
  if (v !== 'all' && v !== 'any') throw new InvalidInput('match', 'invalid');
  return v;
}

/** „Salvează ca segment”: crm:write; „Toată echipa” by default (S130). */
export async function createSegmentInOrg(
  ctx: TenantContext,
  input: { name?: unknown; rules?: unknown; match?: unknown; visibility?: unknown },
): Promise<Segment> {
  const name = requiredText('name', input.name, SEGMENT_LIMITS.name);
  const rules = validateRules(input.rules ?? []);
  const match = normalizeMatch(input.match) ?? 'all';
  const visibility = normalizeVisibility(input.visibility) ?? 'team';
  const id = uuidv7();
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    await validateRefs(client, rules);
    const { rows } = await client.query<SegmentRow>(
      `INSERT INTO crm.segment (id, organization_id, name, rules, match, visibility, created_by_user_id)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7) RETURNING ${COLUMNS}`,
      [id, ctx.organizationId, name, JSON.stringify(rules), match, visibility, ctx.userId],
    );
    await audit(exec, ctx, AuditActions.crmSegmentCreated, id, { visibility, rules: rules.length });
    return toSegment(rows[0]!, null);
  });
}

/** The tags and companies a rule names exist in this business (RLS: another's are not found). */
async function validateRefs(client: PoolClient, rules: SegmentRule[]) {
  for (const [i, r] of rules.entries()) {
    if (r.field === 'tag') {
      const t = await client.query(`SELECT 1 FROM crm.tag WHERE id = $1 AND deleted_at IS NULL`, [
        r.value,
      ]);
      if (!t.rows[0]) throw new InvalidInput(`rules.${i}`, 'not_found');
    }
    if (r.field === 'company' && r.op === 'is') {
      const c = await client.query(`SELECT 1 FROM crm.company WHERE id = $1`, [r.value]);
      if (!c.rows[0]) throw new InvalidInput(`rules.${i}`, 'not_found');
    }
  }
}

/** The author or crm:admin („all” scope) changes a segment; the predefined one only through its days. */
function requireEditor(ctx: TenantContext, scope: ContactScope, s: SegmentRow) {
  if (s.kind === 'lapsed') throw new Conflict('segment_predefined');
  if (scope !== 'all' && s.created_by_user_id !== ctx.userId) throw new Forbidden();
}

export async function updateSegmentInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  segmentId: string,
  input: { name?: unknown; rules?: unknown; match?: unknown; visibility?: unknown },
): Promise<Segment> {
  const id = requireId('segmentId', segmentId);
  const patch: Record<string, unknown> = {
    name:
      input.name === undefined ? undefined : requiredText('name', input.name, SEGMENT_LIMITS.name),
    rules: input.rules === undefined ? undefined : validateRules(input.rules),
    match: normalizeMatch(input.match),
    visibility: normalizeVisibility(input.visibility),
  };
  const fields = Object.keys(patch).filter((k) => patch[k] !== undefined);
  if (fields.length === 0) throw new InvalidInput('segment', 'required');
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const before = await readSegment(client, ctx, id, true);
    requireEditor(ctx, scope, before);
    // „Doar eu” belongs to its author: only the author makes it so
    if (patch.visibility === 'me' && before.created_by_user_id !== ctx.userId)
      throw new Forbidden();
    if (patch.rules) await validateRefs(client, patch.rules as SegmentRule[]);
    const values = fields.map((f) => (f === 'rules' ? JSON.stringify(patch[f]) : patch[f]));
    const { rows } = await client.query<SegmentRow>(
      `UPDATE crm.segment SET ${fields.map((f, i) => `${f} = $${i + 2}${f === 'rules' ? '::jsonb' : ''}`).join(', ')}
        WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, ...values],
    );
    await audit(exec, ctx, AuditActions.crmSegmentUpdated, id, { fields });
    return toSegment(rows[0]!, null);
  });
}

export async function deleteSegmentInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  segmentId: string,
): Promise<void> {
  const id = requireId('segmentId', segmentId);
  await withCrmTx(ctx.organizationId, async (client, exec) => {
    const before = await readSegment(client, ctx, id, true);
    requireEditor(ctx, scope, before);
    await client.query(
      `UPDATE crm.segment SET deleted_at = now(), deleted_by_user_id = $2 WHERE id = $1`,
      [id, ctx.userId],
    );
    await audit(exec, ctx, AuditActions.crmSegmentDeleted, id, {});
  });
}

/** The days of the predefined segment (S130: 7–365), a business setting (crm:settings). */
export async function setLapsedSegmentDaysInOrg(
  ctx: TenantContext,
  days: unknown,
): Promise<number> {
  const d = int(days, 'days', 7, 365);
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    await client.query(
      `INSERT INTO crm.settings (organization_id, lapsed_segment_days, updated_by_user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (organization_id) DO UPDATE
         SET lapsed_segment_days = EXCLUDED.lapsed_segment_days, updated_by_user_id = EXCLUDED.updated_by_user_id`,
      [ctx.organizationId, d, ctx.userId],
    );
    await appendAuditEventInTx(exec, {
      category: 'crm',
      action: AuditActions.crmSettingsUpdated,
      outcome: 'success',
      actorType: 'user',
      actorId: ctx.userId,
      organizationId: ctx.organizationId,
      targetType: 'crm_settings',
      targetId: ctx.organizationId,
      metadata: { fields: ['lapsed_segment_days'] },
    });
    return d;
  });
}

export { MANUAL_SOURCES };
