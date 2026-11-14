import { AuditActions, appendAuditEventInTx, pgExecutor } from '@ventora/audit';
import {
  FOUNDER_NOTIFICATION_TYPES,
  sendFounderGrowthStopAlert,
  sendFounderNotification,
} from '@ventora/notifications';
import {
  checkOfferTargets,
  offerTargetKey,
  type OfferTargetProblem,
  type OfferTargetProblemCode,
} from '@ventora/commercial';
import { GROWTH_AUTO_STOP, type GrowthOfferTarget } from '@ventora/contracts';
import type { PoolClient } from 'pg';
import { withAppJobTx, withAppTx } from './db';
import { clearGrowthCache, targetOf } from './service';

/*
 * Lot 5.8 + 5.9f — the automatic stop (P22 / D-GRW-13, D5-8, D5-11 b; S136 FounderNotifications).
 * Growth stops a campaign on its own for one of four reasons:
 *   disturbance — above 5 % „Nu mă interesează” + opt-outs per impression, at least 100
 *                 impressions in the current run (growth.auto_stop_if_disturbing);
 *   complaints  — 3 businesses complained about its offer in 24 h (owners only, recorded by
 *                 recordInteraction); every campaign of the offer stops (auto_stop_if_complaints);
 *   budget      — the offer's budget of trials / discounts is used up, across all its campaigns
 *                 (auto_stop_if_over_budget);
 *   error       — the offer no longer matches the commercial model (runGrowthOfferCheckJob, hourly,
 *                 through the core/commercial contract; auto_stop_for_error).
 * The database recomputes the first three and stops only above the threshold. Every stop is
 * audited (system actor), written to the stop history (the 24 h restart block) and goes into the
 * Founder bell in the same transaction, when „Anunță-mă dacă se oprește din nou” is on (default).
 * The team e-mail (FOUNDER_ALERTS_EMAIL) has a template for the disturbance only. The restart is
 * manual, from Founder; after a 2nd automatic stop in 7 days the database refuses it for 24 h.
 */

/** Lot 5.9f (S136): 3 complaints from owners in 24 h. Also in the SQL function. */
export const GROWTH_AUTO_STOP_COMPLAINTS = { businesses: 3, hours: 24 } as const;

export type AutoStopReason = 'disturbance' | 'complaints' | 'budget' | 'error';

export interface AutoStopped {
  campaignId: string;
  name: string;
  reason: AutoStopReason;
  /** „Anunță-mă dacă se oprește din nou”: false → fără clopoțel și fără e-mail. */
  notify: boolean;
  rate: number;
  disturbing: number;
  impressions: number;
  /** complaints: businesses in 24 h; budget: the budget; otherwise 0. */
  count: number;
  /** error: the problem code from core/commercial (e.g. `plan_no_price`) and the catalog name. */
  errorCode?: OfferTargetProblemCode;
  errorName?: string;
}

export interface AutoStopReport {
  checked: number;
  stopped: AutoStopped[];
  errors: Array<{ campaignId: string; error: unknown }>;
}

export type GrowthStopAlert = (stopped: AutoStopped) => Promise<void>;

const defaultAlert: GrowthStopAlert = (s) =>
  sendFounderGrowthStopAlert({
    campaign: s.name,
    campaignId: s.campaignId,
    rate: s.rate,
    disturbing: s.disturbing,
    impressions: s.impressions,
  });

interface Candidate {
  campaign_id: string;
  name: string;
  offer: string | null;
  notify: boolean;
  activated_at: Date;
}

type StopDetail = Omit<AutoStopped, 'campaignId' | 'name' | 'reason' | 'notify'>;

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * One stop in its own transaction: the database function decides (null → nothing happened), then
 * the audit row and the Founder notification, in the same transaction.
 */
async function stopOne(
  c: Candidate,
  reason: AutoStopReason,
  run: (
    client: PoolClient,
  ) => Promise<{ metadata: Record<string, unknown>; detail: StopDetail } | null>,
): Promise<AutoStopped | null> {
  return withAppJobTx(async (client) => {
    const done = await run(client);
    if (!done) return null;
    await appendAuditEventInTx(pgExecutor(client), {
      category: 'founder',
      action: AuditActions.growthCampaignAutoStopped,
      outcome: 'success',
      actorType: 'system',
      targetType: 'growth_campaign',
      targetId: c.campaign_id,
      metadata: { reason, ...done.metadata },
    });
    if (c.notify) {
      const { rows: reach } = await client.query(`SELECT growth.campaign_reach($1)::int AS n`, [
        c.campaign_id,
      ]);
      await sendFounderNotification(client, {
        type: FOUNDER_NOTIFICATION_TYPES.autoStop,
        params: {
          campaign: c.name,
          campaignId: c.campaign_id,
          offer: c.offer,
          reason,
          ...done.metadata,
          businesses: Number((reach[0] as { n: number } | undefined)?.n ?? 0),
        },
        // one per run of the campaign: a restart starts a new run
        idempotencyKey: `${c.campaign_id}:${new Date(c.activated_at).toISOString()}`,
      });
    }
    return { campaignId: c.campaign_id, name: c.name, reason, notify: c.notify, ...done.detail };
  });
}

const valueOf = (rows: Array<Record<string, unknown>>, col: string): number | null => {
  const v = rows[0]?.[col];
  return v === null || v === undefined ? null : Number(v);
};

/**
 * Every 15 minutes: disturbance, complaints, budget. A single cheap query first (numbers only,
 * from definer functions); a stop is tried only where a number is over its threshold.
 */
export async function runGrowthAutoStopJob(
  alert: GrowthStopAlert = defaultAlert,
): Promise<AutoStopReport> {
  const report: AutoStopReport = { checked: 0, stopped: [], errors: [] };
  const candidates = await withAppJobTx(async (c) => {
    const { rows } = await c.query(
      `SELECT c.id AS campaign_id, c.name, c.notify_on_auto_stop AS notify,
              (SELECT t.title FROM growth.offer_text t
                WHERE t.offer_id = c.offer_id AND t.locale = 'ro') AS offer,
              c.activated_at,
              coalesce(d.impressions, 0)::int AS impressions,
              coalesce(d.dismissals + d.opt_outs, 0)::int AS disturbing,
              growth.offer_complaints(c.id)::int AS complaints,
              o.type AS offer_type, o.budget_conversions AS budget,
              CASE WHEN o.budget_conversions IS NULL THEN NULL
                   ELSE growth.offer_budget_used(o.id)::int END AS used
         FROM growth.campaign c
         JOIN growth.offer o ON o.id = c.offer_id
         LEFT JOIN growth.campaign_disturbance() d ON d.campaign_id = c.id
        WHERE c.status = 'active'`,
    );
    return rows as Array<
      Candidate & {
        impressions: number;
        disturbing: number;
        complaints: number;
        offer_type: string;
        budget: number | null;
        used: number | null;
      }
    >;
  });
  report.checked = candidates.length;

  for (const c of candidates) {
    const disturbing =
      c.impressions >= GROWTH_AUTO_STOP.minImpressions &&
      c.disturbing / c.impressions > GROWTH_AUTO_STOP.disturbanceRate;
    const complaints = c.complaints >= GROWTH_AUTO_STOP_COMPLAINTS.businesses;
    const overBudget = c.budget !== null && c.used !== null && c.used >= c.budget;
    if (!disturbing && !complaints && !overBudget) continue;
    const base = { disturbing: c.disturbing, impressions: c.impressions };
    try {
      let stopped: AutoStopped | null = null;
      if (disturbing) {
        stopped = await stopOne(c, 'disturbance', async (client) => {
          const { rows } = await client.query(`SELECT growth.auto_stop_if_disturbing($1) AS v`, [
            c.campaign_id,
          ]);
          const rate = valueOf(rows, 'v');
          if (rate === null) return null;
          return {
            metadata: {
              rate: round3(rate),
              disturbing: c.disturbing,
              impressions: c.impressions,
              threshold: GROWTH_AUTO_STOP.disturbanceRate,
            },
            detail: { ...base, rate, count: 0 },
          };
        });
      }
      if (!stopped && complaints) {
        stopped = await stopOne(c, 'complaints', async (client) => {
          const { rows } = await client.query(`SELECT growth.auto_stop_if_complaints($1) AS v`, [
            c.campaign_id,
          ]);
          const n = valueOf(rows, 'v');
          if (n === null) return null;
          return {
            metadata: { complaints: n, threshold: GROWTH_AUTO_STOP_COMPLAINTS.businesses },
            detail: { ...base, rate: 0, count: n },
          };
        });
      }
      if (!stopped && overBudget) {
        stopped = await stopOne(c, 'budget', async (client) => {
          const { rows } = await client.query(`SELECT growth.auto_stop_if_over_budget($1) AS v`, [
            c.campaign_id,
          ]);
          const budget = valueOf(rows, 'v');
          if (budget === null) return null;
          return {
            metadata: { budget, offerType: c.offer_type },
            detail: { ...base, rate: 0, count: budget },
          };
        });
      }
      if (stopped) {
        report.stopped.push(stopped);
        clearGrowthCache();
        // the e-mail template is the disturbance one (D5-11 b); the bell carries every reason
        if (stopped.notify && stopped.reason === 'disturbance') await alert(stopped);
      }
    } catch (error) {
      report.errors.push({ campaignId: c.campaign_id, error });
    }
  }
  return report;
}

export type OfferTargetCheck = (
  targets: readonly GrowthOfferTarget[],
) => Promise<Map<string, OfferTargetProblem | null>>;

/**
 * Hourly (rarer with JOBS_SCHEDULE=quiet): „Eroare” — does the offer of every active campaign still
 * match the commercial model? First one cheap query: no active campaign → done, without touching
 * core/commercial. Then a single read of the commercial catalog for all the targets.
 */
export async function runGrowthOfferCheckJob(
  check: OfferTargetCheck = checkOfferTargets,
): Promise<AutoStopReport> {
  const report: AutoStopReport = { checked: 0, stopped: [], errors: [] };
  const active = await withAppJobTx(async (c) => {
    const { rows } = await c.query(
      `SELECT c.id AS campaign_id, c.name, c.notify_on_auto_stop AS notify, c.activated_at,
              (SELECT t.title FROM growth.offer_text t
                WHERE t.offer_id = c.offer_id AND t.locale = 'ro') AS offer,
              o.type, o.application_id, o.plan_version_id, o.addon_code, o.feature_key,
              o.trial_days
         FROM growth.campaign c JOIN growth.offer o ON o.id = c.offer_id
        WHERE c.status = 'active'`,
    );
    return rows as Array<Candidate & Record<string, unknown>>;
  });
  report.checked = active.length;
  if (active.length === 0) return report;

  const targets = active.map((r) => targetOf(r));
  const problems = await check(targets);
  for (const [i, c] of active.entries()) {
    const problem = problems.get(offerTargetKey(targets[i]!)) ?? null;
    if (!problem) continue;
    try {
      const stopped = await stopOne(c, 'error', async (client) => {
        const { rows } = await client.query(`SELECT growth.auto_stop_for_error($1, $2) AS ok`, [
          c.campaign_id,
          problem.code,
        ]);
        if (rows[0]?.ok !== true) return null;
        return {
          metadata: { errorCode: problem.code, errorName: problem.name },
          detail: {
            rate: 0,
            disturbing: 0,
            impressions: 0,
            count: 0,
            errorCode: problem.code,
            errorName: problem.name,
          },
        };
      });
      if (stopped) {
        report.stopped.push(stopped);
        clearGrowthCache();
      }
    } catch (error) {
      report.errors.push({ campaignId: c.campaign_id, error });
    }
  }
  return report;
}

const DAY_MS = 86_400_000;

/**
 * The Hub, when the person turns off „Recomandări Ventora” (Contul tău · Notificări): the opt-out
 * counts for the campaign she saw last (her latest proactive impression in this business in the
 * last 7 days), so the automatic stop sees it. Nothing seen → nothing recorded. Never throws.
 */
export async function recordOptOut(input: {
  organizationId: string;
  userId: string;
}): Promise<boolean> {
  try {
    return await withAppTx(input.organizationId, async (c) => {
      const { rows } = await c.query(
        `SELECT id FROM growth.impression
          WHERE user_id = $1 AND proactive AND shown_at >= $2
          ORDER BY shown_at DESC LIMIT 1`,
        [input.userId, new Date(Date.now() - 7 * DAY_MS)],
      );
      const impressionId = (rows[0] as { id: string } | undefined)?.id;
      if (!impressionId) return false;
      const r = await c.query(
        `INSERT INTO growth.interaction (id, organization_id, user_id, impression_id, kind,
           idempotency_key)
         VALUES (gen_random_uuid(), $1, $2, $3, 'opt_out', $4)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [input.organizationId, input.userId, impressionId, `optout:${impressionId}`],
      );
      return (r.rowCount ?? 0) > 0;
    });
  } catch {
    return false;
  }
}
