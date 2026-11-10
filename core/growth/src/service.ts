import type { PoolClient } from 'pg';
import {
  GROWTH_KILL_SWITCH_MAX_STALENESS_MS,
  GROWTH_LOCALES,
  type GrowthEligibilityRule,
  type GrowthLocale,
  type GrowthOfferTarget,
  type GrowthSlotContent,
  type GrowthSnoozePeriod,
} from '@ventora/contracts';
import { withAppCatalogTx, withAppTx } from './db';
import {
  decide,
  slotCampaigns,
  type CatalogCampaign,
  type CatalogOffer,
  type CatalogSnapshot,
  type GrowthRole,
  type PersonState,
} from './decide';
import { commercialPorts, type GrowthPorts } from './ports';

/*
 * Lot 5.6 — the contract the Hub and the apps call (`getSlotContent`), and the interactions.
 * Growth stopped, in error, or with nothing eligible → `null`, never an exception: the app looks
 * and works the same without it (ARCHITECTURE §8.7). The catalog and the stops are read with a
 * cache of at most 5 seconds (D5-9), so a stop takes effect on the next read after that.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;

let cached: { at: number; snapshot: CatalogSnapshot } | null = null;

/** Tests, and Founder right after a stop in the same process. */
export function clearGrowthCache(): void {
  cached = null;
}

function targetOf(row: Record<string, unknown>): GrowthOfferTarget {
  switch (row.type) {
    case 'app_activation':
      return { type: 'app_activation', applicationId: row.application_id as string };
    case 'plan_upgrade':
      return { type: 'plan_upgrade', planVersionId: row.plan_version_id as string };
    case 'bundle':
      return { type: 'bundle', planVersionId: row.plan_version_id as string };
    case 'addon':
      return { type: 'addon', addonCode: row.addon_code as string };
    default:
      return {
        type: 'trial',
        applicationId: (row.application_id as string | null) ?? null,
        featureKey: (row.feature_key as string | null) ?? null,
        days: row.trial_days as number,
      };
  }
}

async function readCatalog(client: PoolClient): Promise<CatalogSnapshot> {
  const [control, placements, offers, texts, campaigns, slots] = await Promise.all([
    client.query(`SELECT paused, daily_per_user, weekly_per_user, dismiss_cooldown_days
                    FROM growth.control WHERE id = 1`),
    client.query(`SELECT id, user_initiated, stopped, retired_at IS NOT NULL AS retired
                    FROM growth.placement`),
    client.query(`SELECT id, type, application_id, plan_version_id, addon_code, feature_key,
                         trial_days
                    FROM growth.offer WHERE status = 'published'`),
    client.query(`SELECT offer_id, locale, title, body FROM growth.offer_text
                   WHERE status = 'approved'`),
    client.query(`SELECT id, offer_id, mode, signal_type, signal_version, starts_at, ends_at, rule,
                         audience_role, priority, max_impressions_per_user
                    FROM growth.campaign WHERE status = 'active'`),
    client.query(`SELECT campaign_id, slot_id FROM growth.campaign_slot`),
  ]);
  const c = control.rows[0];
  const offerMap = new Map<string, CatalogOffer>();
  for (const o of offers.rows) offerMap.set(o.id, { id: o.id, target: targetOf(o), texts: {} });
  for (const t of texts.rows) {
    const offer = offerMap.get(t.offer_id);
    if (offer && (GROWTH_LOCALES as readonly string[]).includes(t.locale)) {
      offer.texts[t.locale as GrowthLocale] = { title: t.title, body: t.body };
    }
  }
  const slotsOf = new Map<string, string[]>();
  for (const s of slots.rows)
    slotsOf.set(s.campaign_id, [...(slotsOf.get(s.campaign_id) ?? []), s.slot_id]);
  return {
    control: {
      // no control row means something is wrong: nothing shows
      paused: c ? c.paused : true,
      dailyPerUser: c?.daily_per_user ?? 1,
      weeklyPerUser: c?.weekly_per_user ?? 3,
      dismissCooldownDays: c?.dismiss_cooldown_days ?? 30,
    },
    placements: new Map(
      placements.rows.map((p) => [
        p.id,
        { id: p.id, userInitiated: p.user_initiated, stopped: p.stopped, retired: p.retired },
      ]),
    ),
    offers: offerMap,
    campaigns: campaigns.rows.map((r): CatalogCampaign => ({
      id: r.id,
      offerId: r.offer_id,
      mode: r.mode,
      signal: r.signal_type ? { type: r.signal_type, version: r.signal_version } : null,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      rule: r.rule as GrowthEligibilityRule,
      audienceRole: r.audience_role,
      priority: r.priority,
      maxImpressionsPerUser: r.max_impressions_per_user,
      slots: slotsOf.get(r.id) ?? [],
    })),
  };
}

export async function loadCatalog(): Promise<CatalogSnapshot> {
  if (cached && Date.now() - cached.at < GROWTH_KILL_SWITCH_MAX_STALENESS_MS)
    return cached.snapshot;
  const snapshot = await withAppCatalogTx(readCatalog);
  cached = { at: Date.now(), snapshot };
  return snapshot;
}

async function readPersonState(
  client: PoolClient,
  userId: string,
  campaignIds: string[],
  now: Date,
): Promise<PersonState> {
  const [day, week, suppressed, perCampaign, signals] = await Promise.all([
    client.query(`SELECT growth.proactive_impressions_since($1, $2) AS n`, [
      userId,
      new Date(now.getTime() - DAY_MS),
    ]),
    client.query(`SELECT growth.proactive_impressions_since($1, $2) AS n`, [
      userId,
      new Date(now.getTime() - 7 * DAY_MS),
    ]),
    client.query(`SELECT offer_id FROM growth.suppression WHERE user_id = $1 AND until > $2`, [
      userId,
      now,
    ]),
    client.query(
      `SELECT campaign_id, count(*)::int AS n, max(shown_at) AS last
         FROM growth.impression WHERE user_id = $1 AND campaign_id = ANY($2::uuid[])
        GROUP BY campaign_id`,
      [userId, campaignIds],
    ),
    client.query(
      `SELECT DISTINCT event_type, event_version, (user_id IS NOT NULL) AS by_user
         FROM growth.signal_hit
        WHERE expires_at > $2 AND (user_id IS NULL OR user_id = $1)`,
      [userId, now],
    ),
  ]);
  return {
    proactiveLastDay: day.rows[0].n,
    proactiveLastWeek: week.rows[0].n,
    suppressedOfferIds: new Set(suppressed.rows.map((r) => r.offer_id)),
    impressionsByCampaign: new Map(perCampaign.rows.map((r) => [r.campaign_id, r.n])),
    lastShownByCampaign: new Map(perCampaign.rows.map((r) => [r.campaign_id, r.last])),
    signals: signals.rows.map((r) => ({
      type: r.event_type,
      version: r.event_version,
      byUser: r.by_user,
    })),
  };
}

export interface SlotRequest {
  /** From the tenant context of the request (authorize()), never from client input. */
  organizationId: string;
  userId: string;
  role: GrowthRole;
  locale: GrowthLocale;
  slotId: string;
  userInitiated?: boolean;
  now?: Date;
}

export type SlotLogger = (event: string, detail: Record<string, unknown>) => void;

const defaultLogger: SlotLogger = (event, detail) => {
  console.warn(`[growth] ${event}`, detail);
};

/**
 * What a slot shows now for this person, or null. Records the impression when it shows something
 * (the impression is the moment the person can see it). Never throws.
 */
export async function getSlotContent(
  req: SlotRequest,
  ports: GrowthPorts = commercialPorts,
  log: SlotLogger = defaultLogger,
): Promise<GrowthSlotContent | null> {
  try {
    if (!UUID_RE.test(req.organizationId) || !UUID_RE.test(req.userId)) return null;
    const now = req.now ?? new Date();
    const snapshot = await loadCatalog();
    // cheap exits first: no facts are loaded when nothing could show
    if (snapshot.control.paused) return null;
    const slot = snapshot.placements.get(req.slotId);
    if (!slot || slot.stopped || slot.retired) return null;
    const campaigns = slotCampaigns(snapshot, req.slotId, now);
    if (campaigns.length === 0) return null;

    const state = await withAppTx(
      req.organizationId,
      (c) =>
        readPersonState(
          c,
          req.userId,
          campaigns.map((x) => x.id),
          now,
        ),
      true,
    );
    const facts = await ports.facts(req.organizationId, req.userId, now);
    const result = decide(snapshot, facts, state, {
      slotId: req.slotId,
      locale: req.locale,
      role: req.role,
      userInitiated: req.userInitiated ?? false,
      now,
    });
    if (result.kind === 'none') return null;

    for (const candidate of result.candidates) {
      const cost = await ports.cost(req.organizationId, candidate.offer.target);
      if (!cost) continue;
      const impressionId = crypto.randomUUID();
      await withAppTx(req.organizationId, (c) =>
        c.query(
          `INSERT INTO growth.impression (id, organization_id, user_id, campaign_id, offer_id,
             slot_id, locale, proactive, audience_role)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            impressionId,
            req.organizationId,
            req.userId,
            candidate.campaign.id,
            candidate.offer.id,
            req.slotId,
            req.locale,
            candidate.proactive,
            candidate.campaign.audienceRole,
          ],
        ),
      );
      return {
        slotId: req.slotId,
        contentId: impressionId,
        campaignId: candidate.campaign.id,
        offerId: candidate.offer.id,
        proactive: candidate.proactive,
        audience: candidate.campaign.audienceRole,
        locale: req.locale,
        title: candidate.text.title,
        body: candidate.text.body,
        target: candidate.offer.target,
        cost,
      };
    }
    return null;
  } catch (err) {
    log('slot_failed', { slotId: req.slotId, error: (err as Error)?.message ?? String(err) });
    return null;
  }
}

export type InteractionKind = 'click' | 'dismiss' | 'snooze' | 'recommend' | 'undo';

export interface InteractionRequest {
  organizationId: string;
  userId: string;
  /** `contentId` of the slot content (the impression). */
  contentId: string;
  kind: InteractionKind;
  /** One interaction per key: a double click or a retry records once. */
  idempotencyKey: string;
  snooze?: GrowthSnoozePeriod;
}

const SNOOZE_DAYS: Record<GrowthSnoozePeriod, number> = { week: 7, month: 30 };

/**
 * Records what the person did with a recommendation (GROWTH §2.5, §2.7):
 *   dismiss → the offer is hidden from her for the cooldown (30 days by default, at least 14);
 *   snooze  → hidden for a week or a month;
 *   undo    → „Anulează” in the Toast: the offer may show again;
 *   click / recommend → recorded (the conversion and the owner's notice build on them).
 * The impression must be hers, in this business (RLS and the database guard). Returns whether it
 * was recorded now (false: the same key was already recorded).
 */
export async function recordInteraction(req: InteractionRequest): Promise<{ recorded: boolean }> {
  if (
    !UUID_RE.test(req.organizationId) ||
    !UUID_RE.test(req.userId) ||
    !UUID_RE.test(req.contentId)
  ) {
    throw new Error('[growth] invalid id');
  }
  if (!/^[A-Za-z0-9:_-]{8,128}$/.test(req.idempotencyKey)) throw new Error('[growth] invalid key');
  if (req.kind === 'snooze' && !req.snooze) throw new Error('[growth] snooze needs a period');
  const snapshot = await loadCatalog();

  return withAppTx(req.organizationId, async (c) => {
    const imp = await c.query<{ offer_id: string }>(
      `SELECT offer_id FROM growth.impression WHERE id = $1 AND user_id = $2`,
      [req.contentId, req.userId],
    );
    const offerId = imp.rows[0]?.offer_id;
    if (!offerId) throw new Error('[growth] unknown recommendation');
    const now = Date.now();
    const snoozeUntil =
      req.kind === 'snooze' ? new Date(now + SNOOZE_DAYS[req.snooze!] * DAY_MS) : null;
    const inserted = await c.query(
      `INSERT INTO growth.interaction (id, organization_id, user_id, impression_id, kind,
         idempotency_key, snooze_until)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        crypto.randomUUID(),
        req.organizationId,
        req.userId,
        req.contentId,
        req.kind,
        req.idempotencyKey,
        snoozeUntil,
      ],
    );
    if (inserted.rowCount === 0) return { recorded: false };

    const until =
      req.kind === 'dismiss'
        ? new Date(now + snapshot.control.dismissCooldownDays * DAY_MS)
        : req.kind === 'snooze'
          ? snoozeUntil
          : req.kind === 'undo'
            ? new Date(now)
            : null;
    if (until) {
      const reason = req.kind === 'undo' ? null : req.kind;
      await c.query(
        `INSERT INTO growth.suppression (organization_id, user_id, offer_id, reason, until)
         VALUES ($1, $2, $3, COALESCE($4, 'dismiss'), $5)
         ON CONFLICT (organization_id, user_id, offer_id)
         DO UPDATE SET reason = COALESCE($4, growth.suppression.reason), until = EXCLUDED.until`,
        [req.organizationId, req.userId, offerId, reason, until],
      );
    }
    return { recorded: true };
  });
}
