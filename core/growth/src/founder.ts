import type { PoolClient } from 'pg';
import {
  AuditActions,
  appendAuditEventInTx,
  pgExecutor,
  readAuditLogAsFounder,
  type AuditLogEntry,
  type AuditTargetType,
} from '@ventora/audit';
import {
  GROWTH_LOCALES,
  GROWTH_OFFER_TITLE_MAX,
  validateEligibilityRule,
  type GrowthLocale,
} from '@ventora/contracts';
import { Conflict, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { requireFounderSession } from '@ventora/identity';
import { withFounderTx } from './db';
import { clearGrowthCache } from './service';

/*
 * Lot 5.10 — Founder · Growth & Campaigns: the writes on the Growth catalog (offers and their texts,
 * campaigns and their slots), the kill switches (global, per campaign, per slot) and the global
 * caps. Every function takes the Founder session (2FA, requireFounderSession) and writes its audit
 * row (category founder, actor = the Founder person) in the same transaction as the change.
 * The database guards are the last word (growth_init): a published offer keeps its commercial
 * object, a campaign publishes only with the Romanian text approved and a slot, the caps stay
 * within P25. Here the same rules are checked first, so the screens get a field to point at.
 *
 * Not here (they need numbers across businesses, which growth_founder cannot read row by row —
 * RLS shows one business per transaction): the audience estimate (5.10c) and the results (5.10d).
 * Both wait for functions that return only aggregates, approved with their GRANT.
 */

export interface FounderParams {
  founderHeaders: Headers;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuid(field: string, value: unknown): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) throw new InvalidInput(field);
  return value.toLowerCase();
}

function text(field: string, value: unknown, max: number, min = 1): string {
  if (typeof value !== 'string') throw new InvalidInput(field);
  const v = value.trim();
  if (v.length < min || v.length > max) throw new InvalidInput(field);
  return v;
}

/** Postgres refusals (CHECKs and guards) as the errors the screens know. */
function mapDbError(err: unknown, field: string): never {
  const e = err as { code?: string; message?: string };
  if (e.code === '23514' || e.code === 'P0001') throw new InvalidInput(field, e.message);
  if (e.code === '23505') throw new Conflict(e.message ?? 'duplicate');
  if (e.code === '23503') throw new InvalidInput(field, e.message);
  throw err;
}

async function write<T>(
  fn: (client: PoolClient, audit: (event: AuditInput) => Promise<void>) => Promise<T>,
  founderId: string,
  field = 'input',
): Promise<T> {
  try {
    const result = await withFounderTx(null, (client) =>
      fn(client, async (event) => {
        await appendAuditEventInTx(pgExecutor(client), {
          category: 'founder',
          action: event.action,
          outcome: 'success',
          actorType: 'founder',
          actorId: founderId,
          founderId,
          organizationId: null,
          targetType: event.targetType,
          targetId: event.targetId,
          metadata: event.metadata ?? {},
        });
      }),
    );
    // the Hub reads the catalog with a cache of at most 5 s (D5-9); in this process, at once
    clearGrowthCache();
    return result;
  } catch (err) {
    if (err instanceof InvalidInput || err instanceof Conflict || err instanceof ResourceNotFound) {
      throw err;
    }
    return mapDbError(err, field);
  }
}

type AuditInput = {
  action: string;
  targetType: AuditTargetType;
  targetId: string;
  metadata?: Record<string, unknown>;
};

// ── The global control (5.10e) ──────────────────────────────────────────────────────────────

/** P25: the maxima allowed for the global caps (also CHECKs in growth.control). */
export const GROWTH_CAP_LIMITS = {
  dailyPerUser: { min: 1, max: 2 },
  weeklyPerUser: { min: 1, max: 5 },
  dismissCooldownDays: { min: 14, max: 365 },
} as const;

export interface GrowthControlView {
  paused: boolean;
  pauseReason: string | null;
  dailyPerUser: number;
  weeklyPerUser: number;
  dismissCooldownDays: number;
  changedAt: string;
  changedByFounderId: string | null;
}

export interface GrowthPlacementView {
  id: string;
  applicationId: string;
  kind: string;
  userInitiated: boolean;
  retired: boolean;
  stopped: boolean;
  stopReason: string | null;
  stoppedAt: string | null;
  /** Active campaigns that show something in this slot. */
  activeCampaigns: number;
}

export async function getGrowthControlForFounder(
  params: FounderParams,
): Promise<{ control: GrowthControlView; placements: GrowthPlacementView[] }> {
  await requireFounderSession(params.founderHeaders);
  return withFounderTx(
    null,
    async (c) => {
      const ctl = await c.query<{
        paused: boolean;
        pause_reason: string | null;
        daily_per_user: number;
        weekly_per_user: number;
        dismiss_cooldown_days: number;
        changed_at: Date;
        changed_by_founder_id: string | null;
      }>(`SELECT * FROM growth.control WHERE id = 1`);
      const row = ctl.rows[0]!;
      const pl = await c.query<{
        id: string;
        application_id: string;
        kind: string;
        user_initiated: boolean;
        retired_at: Date | null;
        stopped: boolean;
        stop_reason: string | null;
        stopped_at: Date | null;
        active: string;
      }>(
        `SELECT p.id, p.application_id, p.kind, p.user_initiated, p.retired_at, p.stopped,
                p.stop_reason, p.stopped_at,
                (SELECT count(*) FROM growth.campaign_slot cs
                   JOIN growth.campaign k ON k.id = cs.campaign_id
                  WHERE cs.slot_id = p.id AND k.status = 'active')::text AS active
           FROM growth.placement p
          ORDER BY p.retired_at IS NOT NULL, p.application_id, p.id`,
      );
      return {
        control: {
          paused: row.paused,
          pauseReason: row.pause_reason,
          dailyPerUser: row.daily_per_user,
          weeklyPerUser: row.weekly_per_user,
          dismissCooldownDays: row.dismiss_cooldown_days,
          changedAt: row.changed_at.toISOString(),
          changedByFounderId: row.changed_by_founder_id,
        },
        placements: pl.rows.map((p) => ({
          id: p.id,
          applicationId: p.application_id,
          kind: p.kind,
          userInitiated: p.user_initiated,
          retired: p.retired_at !== null,
          stopped: p.stopped,
          stopReason: p.stop_reason,
          stoppedAt: p.stopped_at?.toISOString() ?? null,
          activeCampaigns: Number(p.active),
        })),
      };
    },
    true,
  );
}

/** The global kill switch. Stopping needs a reason (it goes into the log); starting needs none. */
export async function setGrowthPaused(
  params: FounderParams & { paused: boolean; reason?: string },
): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  const reason = params.paused ? text('reason', params.reason, 2000) : null;
  await write(
    async (c, audit) => {
      const { rows } = await c.query<{ paused: boolean }>(
        `SELECT paused FROM growth.control WHERE id = 1 FOR UPDATE`,
      );
      if (rows[0]?.paused === params.paused) return;
      await c.query(
        `UPDATE growth.control SET paused = $1, pause_reason = $2, changed_by_founder_id = $3
          WHERE id = 1`,
        [params.paused, reason, founder.userId],
      );
      await audit({
        action: params.paused ? AuditActions.growthPaused : AuditActions.growthResumed,
        targetType: 'growth_control',
        targetId: 'global',
        metadata: reason ? { reason } : {},
      });
    },
    founder.userId,
    'reason',
  );
}

/** The global caps (P25), validated here and by the CHECKs: e.g. 3 a day is refused. */
export async function setGrowthCaps(
  params: FounderParams & {
    dailyPerUser: number;
    weeklyPerUser: number;
    dismissCooldownDays: number;
  },
): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  const L = GROWTH_CAP_LIMITS;
  const int = (field: keyof typeof L, v: number) => {
    if (!Number.isInteger(v) || v < L[field].min || v > L[field].max) {
      throw new InvalidInput(field);
    }
    return v;
  };
  const daily = int('dailyPerUser', params.dailyPerUser);
  const weekly = int('weeklyPerUser', params.weeklyPerUser);
  const cooldown = int('dismissCooldownDays', params.dismissCooldownDays);
  if (weekly < daily) throw new InvalidInput('weeklyPerUser');
  await write(
    async (c, audit) => {
      const { rows } = await c.query<{
        daily_per_user: number;
        weekly_per_user: number;
        dismiss_cooldown_days: number;
      }>(
        `SELECT daily_per_user, weekly_per_user, dismiss_cooldown_days
           FROM growth.control WHERE id = 1 FOR UPDATE`,
      );
      const before = rows[0]!;
      await c.query(
        `UPDATE growth.control SET daily_per_user = $1, weekly_per_user = $2,
                dismiss_cooldown_days = $3, changed_by_founder_id = $4
          WHERE id = 1`,
        [daily, weekly, cooldown, founder.userId],
      );
      await audit({
        action: AuditActions.growthCapsChanged,
        targetType: 'growth_control',
        targetId: 'global',
        metadata: {
          before: {
            dailyPerUser: before.daily_per_user,
            weeklyPerUser: before.weekly_per_user,
            dismissCooldownDays: before.dismiss_cooldown_days,
          },
          after: { dailyPerUser: daily, weeklyPerUser: weekly, dismissCooldownDays: cooldown },
        },
      });
    },
    founder.userId,
    'dailyPerUser',
  );
}

/** The kill switch per slot (effect at the next read, within the 5 s cache). */
export async function setPlacementStopped(
  params: FounderParams & { slotId: string; stopped: boolean; reason?: string },
): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  const slotId = text('slotId', params.slotId, 128);
  const reason = params.stopped ? text('reason', params.reason, 2000) : null;
  await write(
    async (c, audit) => {
      const { rowCount } = await c.query(
        `UPDATE growth.placement
            SET stopped = $2, stop_reason = $3, stopped_by_founder_id = $4
          WHERE id = $1 AND stopped <> $2`,
        [slotId, params.stopped, reason, params.stopped ? founder.userId : null],
      );
      if (!rowCount) {
        const exists = await c.query(`SELECT 1 FROM growth.placement WHERE id = $1`, [slotId]);
        if (!exists.rowCount) throw new ResourceNotFound('placement');
        return;
      }
      await audit({
        action: params.stopped
          ? AuditActions.growthPlacementStopped
          : AuditActions.growthPlacementResumed,
        targetType: 'growth_placement',
        targetId: slotId,
        metadata: reason ? { reason } : {},
      });
    },
    founder.userId,
    'reason',
  );
}

/** The Growth log (Control › Jurnal): the growth.* rows of the audit log, newest first. */
export const GROWTH_LOG_ACTIONS: readonly string[] = (
  Object.values(AuditActions) as string[]
).filter((a) => a.startsWith('growth.'));

export async function listGrowthLogForFounder(
  params: FounderParams & { limit?: number; before?: string },
): Promise<AuditLogEntry[]> {
  const founder = await requireFounderSession(params.founderHeaders);
  return readAuditLogAsFounder(founder.userId, {
    actions: [...GROWTH_LOG_ACTIONS],
    limit: params.limit ?? 50,
    ...(params.before ? { before: new Date(params.before) } : {}),
  });
}

// ── Offers and their texts (5.10a, FounderTranslations) ────────────────────────────────────

export type FounderOfferTarget =
  | { type: 'app_activation'; applicationId: string }
  | { type: 'plan_upgrade'; planVersionId: string }
  | { type: 'bundle'; planVersionId: string }
  | { type: 'addon'; addonCode: string }
  | { type: 'trial'; applicationId: string | null; featureKey: string | null; days: number };

export interface FounderOfferText {
  locale: GrowthLocale;
  title: string;
  body: string;
  status: 'draft' | 'approved';
  approvedAt: string | null;
  approvedByFounderId: string | null;
  updatedAt: string;
  updatedByFounderId: string;
}

export interface FounderOffer {
  id: string;
  code: string;
  target: FounderOfferTarget;
  status: 'draft' | 'published' | 'archived';
  texts: FounderOfferText[];
  /** Campaigns that use it (any state): a used offer is archived, never deleted. */
  campaigns: number;
  createdAt: string;
  updatedAt: string;
}

function targetColumns(t: FounderOfferTarget) {
  const cols = {
    type: t.type as string,
    application_id: null as string | null,
    plan_version_id: null as string | null,
    addon_code: null as string | null,
    feature_key: null as string | null,
    trial_days: null as number | null,
  };
  switch (t.type) {
    case 'app_activation':
      cols.application_id = text('applicationId', t.applicationId, 64);
      break;
    case 'plan_upgrade':
    case 'bundle':
      cols.plan_version_id = uuid('planVersionId', t.planVersionId);
      break;
    case 'addon':
      cols.addon_code = text('addonCode', t.addonCode, 64);
      break;
    case 'trial':
      if (!Number.isInteger(t.days) || t.days < 1 || t.days > 90) throw new InvalidInput('days');
      if ((t.applicationId === null) === (t.featureKey === null)) {
        throw new InvalidInput('applicationId');
      }
      cols.application_id =
        t.applicationId === null ? null : text('applicationId', t.applicationId, 64);
      cols.feature_key = t.featureKey === null ? null : text('featureKey', t.featureKey, 128);
      cols.trial_days = t.days;
      break;
    default:
      throw new InvalidInput('type');
  }
  return cols;
}

type OfferRow = {
  id: string;
  code: string;
  type: FounderOfferTarget['type'];
  application_id: string | null;
  plan_version_id: string | null;
  addon_code: string | null;
  feature_key: string | null;
  trial_days: number | null;
  status: FounderOffer['status'];
  created_at: Date;
  updated_at: Date;
  campaigns: string;
};

function toTarget(r: OfferRow): FounderOfferTarget {
  switch (r.type) {
    case 'app_activation':
      return { type: r.type, applicationId: r.application_id! };
    case 'plan_upgrade':
    case 'bundle':
      return { type: r.type, planVersionId: r.plan_version_id! };
    case 'addon':
      return { type: r.type, addonCode: r.addon_code! };
    default:
      return {
        type: 'trial',
        applicationId: r.application_id,
        featureKey: r.feature_key,
        days: r.trial_days!,
      };
  }
}

export async function listOffersForFounder(params: FounderParams): Promise<FounderOffer[]> {
  await requireFounderSession(params.founderHeaders);
  return withFounderTx(
    null,
    async (c) => {
      const offers = await c.query<OfferRow>(
        `SELECT o.*, (SELECT count(*) FROM growth.campaign k WHERE k.offer_id = o.id)::text AS campaigns
           FROM growth.offer o ORDER BY o.status = 'archived', o.updated_at DESC`,
      );
      const texts = await c.query<{
        offer_id: string;
        locale: GrowthLocale;
        title: string;
        body: string;
        status: 'draft' | 'approved';
        approved_at: Date | null;
        approved_by_founder_id: string | null;
        updated_at: Date;
        updated_by_founder_id: string;
      }>(`SELECT * FROM growth.offer_text`);
      const byOffer = new Map<string, FounderOfferText[]>();
      for (const t of texts.rows) {
        const list = byOffer.get(t.offer_id) ?? [];
        list.push({
          locale: t.locale,
          title: t.title,
          body: t.body,
          status: t.status,
          approvedAt: t.approved_at?.toISOString() ?? null,
          approvedByFounderId: t.approved_by_founder_id,
          updatedAt: t.updated_at.toISOString(),
          updatedByFounderId: t.updated_by_founder_id,
        });
        byOffer.set(t.offer_id, list);
      }
      return offers.rows.map((o) => ({
        id: o.id,
        code: o.code,
        target: toTarget(o),
        status: o.status,
        texts: (byOffer.get(o.id) ?? []).sort(
          (a, b) => GROWTH_LOCALES.indexOf(a.locale) - GROWTH_LOCALES.indexOf(b.locale),
        ),
        campaigns: Number(o.campaigns),
        createdAt: o.created_at.toISOString(),
        updatedAt: o.updated_at.toISOString(),
      }));
    },
    true,
  );
}

/** A new offer, as a draft. The commercial object is checked against the model by the caller. */
export async function createOffer(
  params: FounderParams & { code: string; target: FounderOfferTarget },
): Promise<{ id: string }> {
  const founder = await requireFounderSession(params.founderHeaders);
  const code = text('code', params.code, 64);
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(code)) throw new InvalidInput('code');
  const cols = targetColumns(params.target);
  const id = crypto.randomUUID();
  await write(
    async (c, audit) => {
      await c.query(
        `INSERT INTO growth.offer (id, code, type, application_id, plan_version_id, addon_code,
           feature_key, trial_days, created_by_founder_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          id,
          code,
          cols.type,
          cols.application_id,
          cols.plan_version_id,
          cols.addon_code,
          cols.feature_key,
          cols.trial_days,
          founder.userId,
        ],
      );
      await audit({
        action: AuditActions.growthOfferCreated,
        targetType: 'growth_offer',
        targetId: id,
        metadata: { code, type: cols.type },
      });
    },
    founder.userId,
    'code',
  );
  return { id };
}

/** The commercial object of a draft offer (a published one keeps it: the database refuses). */
export async function updateOfferTarget(
  params: FounderParams & { offerId: string; target: FounderOfferTarget },
): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  const offerId = uuid('offerId', params.offerId);
  const cols = targetColumns(params.target);
  await write(
    async (c, audit) => {
      const { rowCount } = await c.query(
        `UPDATE growth.offer SET type = $2, application_id = $3, plan_version_id = $4,
                addon_code = $5, feature_key = $6, trial_days = $7
          WHERE id = $1`,
        [
          offerId,
          cols.type,
          cols.application_id,
          cols.plan_version_id,
          cols.addon_code,
          cols.feature_key,
          cols.trial_days,
        ],
      );
      if (!rowCount) throw new ResourceNotFound('offer');
      await audit({
        action: AuditActions.growthOfferUpdated,
        targetType: 'growth_offer',
        targetId: offerId,
        metadata: { type: cols.type },
      });
    },
    founder.userId,
    'type',
  );
}

/**
 * A text of the offer in one language, saved as a draft (editing an approved text sends it back to
 * draft: the database guard). `aiProposal` marks a text proposed by AI: it stays a draft until a
 * person approves it (S136), and the mark goes into the log.
 */
export async function saveOfferText(
  params: FounderParams & {
    offerId: string;
    locale: GrowthLocale;
    title: string;
    body: string;
    aiProposal?: boolean;
  },
): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  const offerId = uuid('offerId', params.offerId);
  if (!GROWTH_LOCALES.includes(params.locale)) throw new InvalidInput('locale');
  const title = text('title', params.title, GROWTH_OFFER_TITLE_MAX);
  const body = text('body', params.body, 300);
  await write(
    async (c, audit) => {
      await c.query(
        `INSERT INTO growth.offer_text (offer_id, locale, title, body, status, updated_by_founder_id)
         VALUES ($1, $2, $3, $4, 'draft', $5)
         ON CONFLICT (offer_id, locale) DO UPDATE
           SET title = EXCLUDED.title, body = EXCLUDED.body,
               updated_by_founder_id = EXCLUDED.updated_by_founder_id`,
        [offerId, params.locale, title, body, founder.userId],
      );
      await audit({
        action: AuditActions.growthOfferTextSaved,
        targetType: 'growth_offer',
        targetId: offerId,
        metadata: { locale: params.locale, aiProposal: params.aiProposal === true },
      });
    },
    founder.userId,
    'title',
  );
}

/** Approves the current text of one language (a person, never the AI; S136). */
export async function approveOfferText(
  params: FounderParams & { offerId: string; locale: GrowthLocale },
): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  const offerId = uuid('offerId', params.offerId);
  if (!GROWTH_LOCALES.includes(params.locale)) throw new InvalidInput('locale');
  await write(
    async (c, audit) => {
      const { rowCount } = await c.query(
        `UPDATE growth.offer_text
            SET status = 'approved', approved_by_founder_id = $3, updated_by_founder_id = $3
          WHERE offer_id = $1 AND locale = $2 AND status = 'draft'`,
        [offerId, params.locale, founder.userId],
      );
      if (!rowCount) throw new Conflict('No draft text to approve');
      await audit({
        action: AuditActions.growthOfferTextApproved,
        targetType: 'growth_offer',
        targetId: offerId,
        metadata: { locale: params.locale },
      });
    },
    founder.userId,
    'locale',
  );
}

/** Publishes an offer: needs the Romanian text approved (P20; refused by the database too). */
export async function publishOffer(params: FounderParams & { offerId: string }): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  const offerId = uuid('offerId', params.offerId);
  await write(
    async (c, audit) => {
      const ro = await c.query(
        `SELECT 1 FROM growth.offer_text WHERE offer_id = $1 AND locale = 'ro' AND status = 'approved'`,
        [offerId],
      );
      if (!ro.rowCount) throw new InvalidInput('texts', 'The Romanian text is not approved');
      const { rowCount } = await c.query(
        `UPDATE growth.offer SET status = 'published' WHERE id = $1 AND status = 'draft'`,
        [offerId],
      );
      if (!rowCount) throw new Conflict('The offer is not a draft');
      await audit({
        action: AuditActions.growthOfferPublished,
        targetType: 'growth_offer',
        targetId: offerId,
      });
    },
    founder.userId,
    'texts',
  );
}

/** Archives an offer; its active campaigns must be stopped first. */
export async function archiveOffer(params: FounderParams & { offerId: string }): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  const offerId = uuid('offerId', params.offerId);
  await write(async (c, audit) => {
    const active = await c.query(
      `SELECT 1 FROM growth.campaign WHERE offer_id = $1 AND status = 'active'`,
      [offerId],
    );
    if (active.rowCount) throw new Conflict('The offer has active campaigns');
    const { rowCount } = await c.query(
      `UPDATE growth.offer SET status = 'archived' WHERE id = $1 AND status <> 'archived'`,
      [offerId],
    );
    if (!rowCount) throw new Conflict('The offer is already archived');
    await audit({
      action: AuditActions.growthOfferArchived,
      targetType: 'growth_offer',
      targetId: offerId,
    });
  }, founder.userId);
}

// ── Campaigns (5.10b) ───────────────────────────────────────────────────────────────────────

export interface FounderCampaignInput {
  name: string;
  offerId: string;
  mode: 'signal' | 'scheduled';
  signal?: { type: string; version: number } | null;
  startsAt?: string | null;
  endsAt?: string | null;
  audienceId?: string | null;
  /** The eligibility rule: only the whitelisted criteria (validateEligibilityRule). */
  rule: unknown;
  audienceRole: 'buyer' | 'member';
  priority: number;
  maxImpressionsPerUser?: number | null;
  slots: string[];
}

export interface FounderCampaign {
  id: string;
  name: string;
  offerId: string;
  mode: 'signal' | 'scheduled';
  signal: { type: string; version: number } | null;
  startsAt: string | null;
  endsAt: string | null;
  audienceId: string | null;
  rule: unknown;
  audienceRole: 'buyer' | 'member';
  priority: number;
  maxImpressionsPerUser: number | null;
  status: 'draft' | 'active' | 'stopped';
  stopReason: string | null;
  stopNote: string | null;
  stoppedAt: string | null;
  publishedAt: string | null;
  slots: string[];
  updatedAt: string;
}

function campaignColumns(input: FounderCampaignInput) {
  const name = text('name', input.name, 120);
  const offerId = uuid('offerId', input.offerId);
  const ruleCheck = validateEligibilityRule(input.rule);
  if (!ruleCheck.ok) throw new InvalidInput('rule', ruleCheck.errors.join('; '));
  if (input.audienceRole !== 'buyer' && input.audienceRole !== 'member') {
    throw new InvalidInput('audienceRole');
  }
  if (!Number.isInteger(input.priority) || input.priority < 0 || input.priority > 100) {
    throw new InvalidInput('priority');
  }
  const max = input.maxImpressionsPerUser ?? null;
  if (max !== null && (!Number.isInteger(max) || max < 1 || max > 50)) {
    throw new InvalidInput('maxImpressionsPerUser');
  }
  const date = (field: string, v: string | null | undefined) => {
    if (v == null) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) throw new InvalidInput(field);
    return d;
  };
  const startsAt = date('startsAt', input.startsAt);
  const endsAt = date('endsAt', input.endsAt);
  if (input.mode === 'scheduled') {
    if (!startsAt || !endsAt || endsAt <= startsAt) throw new InvalidInput('endsAt');
  } else if (input.mode === 'signal') {
    if (!input.signal || !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(input.signal.type)) {
      throw new InvalidInput('signal');
    }
    if (!Number.isInteger(input.signal.version) || input.signal.version < 1) {
      throw new InvalidInput('signal');
    }
    if (startsAt && endsAt && endsAt <= startsAt) throw new InvalidInput('endsAt');
  } else {
    throw new InvalidInput('mode');
  }
  const slots = [...new Set(input.slots.map((s) => text('slots', s, 128)))];
  return {
    name,
    offerId,
    mode: input.mode,
    signalType: input.mode === 'signal' ? input.signal!.type : null,
    signalVersion: input.mode === 'signal' ? input.signal!.version : null,
    startsAt,
    endsAt,
    audienceId: input.audienceId ? uuid('audienceId', input.audienceId) : null,
    rule: input.rule,
    audienceRole: input.audienceRole,
    priority: input.priority,
    max,
    slots,
  };
}

async function setSlots(
  c: PoolClient,
  campaignId: string,
  slots: string[],
  audit: (event: AuditInput) => Promise<void>,
): Promise<void> {
  const current = await c.query<{ slot_id: string }>(
    `SELECT slot_id FROM growth.campaign_slot WHERE campaign_id = $1`,
    [campaignId],
  );
  const have = new Set(current.rows.map((r) => r.slot_id));
  const want = new Set(slots);
  for (const slot of have) {
    if (want.has(slot)) continue;
    await c.query(`DELETE FROM growth.campaign_slot WHERE campaign_id = $1 AND slot_id = $2`, [
      campaignId,
      slot,
    ]);
    // approved with 5.5: every removal of a slot has its audit row
    await audit({
      action: AuditActions.growthCampaignSlotRemoved,
      targetType: 'growth_campaign',
      targetId: campaignId,
      metadata: { slotId: slot },
    });
  }
  for (const slot of want) {
    if (have.has(slot)) continue;
    await c.query(`INSERT INTO growth.campaign_slot (campaign_id, slot_id) VALUES ($1, $2)`, [
      campaignId,
      slot,
    ]);
  }
}

export async function createCampaign(
  params: FounderParams & { campaign: FounderCampaignInput },
): Promise<{ id: string }> {
  const founder = await requireFounderSession(params.founderHeaders);
  const k = campaignColumns(params.campaign);
  const id = crypto.randomUUID();
  await write(
    async (c, audit) => {
      await c.query(
        `INSERT INTO growth.campaign (id, name, offer_id, mode, signal_type, signal_version,
           starts_at, ends_at, audience_id, rule, audience_role, priority,
           max_impressions_per_user, created_by_founder_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          id,
          k.name,
          k.offerId,
          k.mode,
          k.signalType,
          k.signalVersion,
          k.startsAt,
          k.endsAt,
          k.audienceId,
          JSON.stringify(k.rule),
          k.audienceRole,
          k.priority,
          k.max,
          founder.userId,
        ],
      );
      await setSlots(c, id, k.slots, audit);
      await audit({
        action: AuditActions.growthCampaignCreated,
        targetType: 'growth_campaign',
        targetId: id,
        metadata: { offerId: k.offerId, mode: k.mode, slots: k.slots },
      });
    },
    founder.userId,
    'campaign',
  );
  return { id };
}

export async function updateCampaign(
  params: FounderParams & { campaignId: string; campaign: FounderCampaignInput },
): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  const campaignId = uuid('campaignId', params.campaignId);
  const k = campaignColumns(params.campaign);
  await write(
    async (c, audit) => {
      const { rowCount } = await c.query(
        `UPDATE growth.campaign SET name = $2, offer_id = $3, mode = $4, signal_type = $5,
                signal_version = $6, starts_at = $7, ends_at = $8, audience_id = $9, rule = $10,
                audience_role = $11, priority = $12, max_impressions_per_user = $13
          WHERE id = $1`,
        [
          campaignId,
          k.name,
          k.offerId,
          k.mode,
          k.signalType,
          k.signalVersion,
          k.startsAt,
          k.endsAt,
          k.audienceId,
          JSON.stringify(k.rule),
          k.audienceRole,
          k.priority,
          k.max,
        ],
      );
      if (!rowCount) throw new ResourceNotFound('campaign');
      await setSlots(c, campaignId, k.slots, audit);
      await audit({
        action: AuditActions.growthCampaignUpdated,
        targetType: 'growth_campaign',
        targetId: campaignId,
        metadata: { offerId: k.offerId, mode: k.mode, slots: k.slots },
      });
    },
    founder.userId,
    'campaign',
  );
}

/**
 * Publishes a campaign (draft → active). Refused here and by the database when the offer is not
 * published, its Romanian text is not approved, or it has no slot.
 */
export async function publishCampaign(
  params: FounderParams & { campaignId: string },
): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  const campaignId = uuid('campaignId', params.campaignId);
  await write(
    async (c, audit) => {
      const { rows } = await c.query<{ status: string; ro: boolean; slots: string }>(
        `SELECT k.status,
                EXISTS (SELECT 1 FROM growth.offer_text t WHERE t.offer_id = k.offer_id
                          AND t.locale = 'ro' AND t.status = 'approved') AS ro,
                (SELECT count(*) FROM growth.campaign_slot cs WHERE cs.campaign_id = k.id)::text AS slots
           FROM growth.campaign k WHERE k.id = $1 FOR UPDATE`,
        [campaignId],
      );
      const k = rows[0];
      if (!k) throw new ResourceNotFound('campaign');
      if (k.status !== 'draft') throw new Conflict('The campaign is not a draft');
      if (!k.ro) throw new InvalidInput('texts', 'The Romanian text is not approved');
      if (Number(k.slots) === 0) throw new InvalidInput('slots');
      await c.query(`UPDATE growth.campaign SET status = 'active' WHERE id = $1`, [campaignId]);
      await audit({
        action: AuditActions.growthCampaignPublished,
        targetType: 'growth_campaign',
        targetId: campaignId,
      });
    },
    founder.userId,
    'texts',
  );
}

/** The kill switch per campaign (manual stop, with confirmation in the screen). */
export async function stopCampaign(
  params: FounderParams & { campaignId: string; note?: string },
): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  const campaignId = uuid('campaignId', params.campaignId);
  const note = params.note?.trim() ? text('note', params.note, 2000) : null;
  await write(
    async (c, audit) => {
      const { rowCount } = await c.query(
        `UPDATE growth.campaign SET status = 'stopped', stop_reason = 'manual', stop_note = $2,
                stopped_by_founder_id = $3
          WHERE id = $1 AND status = 'active'`,
        [campaignId, note, founder.userId],
      );
      if (!rowCount) throw new Conflict('The campaign is not active');
      await audit({
        action: AuditActions.growthCampaignStopped,
        targetType: 'growth_campaign',
        targetId: campaignId,
        metadata: note ? { note } : {},
      });
    },
    founder.userId,
    'note',
  );
}

/**
 * Restart is manual only (P22), with "Ce ai schimbat" required (S136, FounderNotifications): the
 * threshold stays the same, so an unchanged campaign stops again. Who said „Nu mă interesează”
 * still does not see it for the cooldown (their suppression stays).
 */
export async function restartCampaign(
  params: FounderParams & { campaignId: string; whatChanged: string },
): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  const campaignId = uuid('campaignId', params.campaignId);
  const whatChanged = text('whatChanged', params.whatChanged, 2000);
  await write(
    async (c, audit) => {
      const { rows } = await c.query<{ stop_reason: string | null }>(
        `SELECT stop_reason FROM growth.campaign WHERE id = $1 AND status = 'stopped' FOR UPDATE`,
        [campaignId],
      );
      if (!rows[0]) throw new Conflict('The campaign is not stopped');
      await c.query(`UPDATE growth.campaign SET status = 'active' WHERE id = $1`, [campaignId]);
      await audit({
        action: AuditActions.growthCampaignRestarted,
        targetType: 'growth_campaign',
        targetId: campaignId,
        metadata: { whatChanged, previousStop: rows[0].stop_reason },
      });
    },
    founder.userId,
    'whatChanged',
  );
}

export async function listCampaignsForFounder(params: FounderParams): Promise<FounderCampaign[]> {
  await requireFounderSession(params.founderHeaders);
  return withFounderTx(
    null,
    async (c) => {
      const { rows } = await c.query<{
        id: string;
        name: string;
        offer_id: string;
        mode: 'signal' | 'scheduled';
        signal_type: string | null;
        signal_version: number | null;
        starts_at: Date | null;
        ends_at: Date | null;
        audience_id: string | null;
        rule: unknown;
        audience_role: 'buyer' | 'member';
        priority: number;
        max_impressions_per_user: number | null;
        status: FounderCampaign['status'];
        stop_reason: string | null;
        stop_note: string | null;
        stopped_at: Date | null;
        published_at: Date | null;
        updated_at: Date;
        slots: string[] | null;
      }>(
        `SELECT k.*, (SELECT array_agg(cs.slot_id ORDER BY cs.slot_id) FROM growth.campaign_slot cs
                       WHERE cs.campaign_id = k.id) AS slots
           FROM growth.campaign k ORDER BY k.status = 'active' DESC, k.updated_at DESC`,
      );
      return rows.map((k) => ({
        id: k.id,
        name: k.name,
        offerId: k.offer_id,
        mode: k.mode,
        signal:
          k.signal_type && k.signal_version
            ? { type: k.signal_type, version: k.signal_version }
            : null,
        startsAt: k.starts_at?.toISOString() ?? null,
        endsAt: k.ends_at?.toISOString() ?? null,
        audienceId: k.audience_id,
        rule: k.rule,
        audienceRole: k.audience_role,
        priority: k.priority,
        maxImpressionsPerUser: k.max_impressions_per_user,
        status: k.status,
        stopReason: k.stop_reason,
        stopNote: k.stop_note,
        stoppedAt: k.stopped_at?.toISOString() ?? null,
        publishedAt: k.published_at?.toISOString() ?? null,
        slots: k.slots ?? [],
        updatedAt: k.updated_at.toISOString(),
      }));
    },
    true,
  );
}

/**
 * The warning „two campaigns on the same slot for the same audience” (5.10b): the other active
 * campaigns that share a slot and the same rule (the audience is the rule).
 */
export function campaignOverlaps(
  campaign: Pick<FounderCampaign, 'id' | 'slots' | 'rule' | 'audienceRole'>,
  others: readonly FounderCampaign[],
): { campaignId: string; name: string; slots: string[] }[] {
  const rule = JSON.stringify(campaign.rule);
  return others
    .filter(
      (o) =>
        o.id !== campaign.id &&
        o.status === 'active' &&
        o.audienceRole === campaign.audienceRole &&
        JSON.stringify(o.rule) === rule,
    )
    .map((o) => ({
      campaignId: o.id,
      name: o.name,
      slots: o.slots.filter((s) => campaign.slots.includes(s)),
    }))
    .filter((o) => o.slots.length > 0);
}
