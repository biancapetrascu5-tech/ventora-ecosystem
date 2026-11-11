import { AuditActions, appendAuditEventInTx, pgExecutor } from '@ventora/audit';
import { sendFounderGrowthStopAlert } from '@ventora/notifications';
import { GROWTH_AUTO_STOP } from '@ventora/contracts';
import { withAppJobTx, withAppTx } from './db';
import { clearGrowthCache } from './service';

/*
 * Lot 5.8 — the automatic stop (P22 / D-GRW-13, D5-8, D5-11 b). Every 15 minutes, every active
 * campaign whose current run has at least 100 impressions and a disturbance rate above 5 %
 * („Nu mă interesează” + opt-outs from the preferences, per impression) is stopped by the
 * database function growth.auto_stop_if_disturbing — the only stop the Hub role can do, and only
 * above the threshold. The stop is audited (system actor) in the same transaction, then the team
 * is told by e-mail (FOUNDER_ALERTS_EMAIL) until the Founder bell exists (D4-29). The restart is
 * manual, from Founder.
 */

export interface AutoStopped {
  campaignId: string;
  name: string;
  rate: number;
  disturbing: number;
  impressions: number;
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

export async function runGrowthAutoStopJob(
  alert: GrowthStopAlert = defaultAlert,
): Promise<AutoStopReport> {
  const report: AutoStopReport = { checked: 0, stopped: [], errors: [] };
  const candidates = await withAppJobTx(async (c) => {
    const { rows } = await c.query(
      `SELECT d.campaign_id, c.name, d.impressions::int AS impressions,
              (d.dismissals + d.opt_outs)::int AS disturbing
         FROM growth.campaign_disturbance() d
         JOIN growth.campaign c ON c.id = d.campaign_id
        WHERE d.impressions >= $1`,
      [GROWTH_AUTO_STOP.minImpressions],
    );
    return rows as Array<{
      campaign_id: string;
      name: string;
      impressions: number;
      disturbing: number;
    }>;
  });
  report.checked = candidates.length;

  for (const c of candidates) {
    if (c.disturbing / c.impressions <= GROWTH_AUTO_STOP.disturbanceRate) continue;
    try {
      const stopped = await withAppJobTx(async (client) => {
        const { rows } = await client.query(`SELECT growth.auto_stop_if_disturbing($1) AS rate`, [
          c.campaign_id,
        ]);
        const rate =
          rows[0]?.rate === null || rows[0]?.rate === undefined ? null : Number(rows[0].rate);
        if (rate === null) return null;
        await appendAuditEventInTx(pgExecutor(client), {
          category: 'founder',
          action: AuditActions.growthCampaignAutoStopped,
          outcome: 'success',
          actorType: 'system',
          targetType: 'growth_campaign',
          targetId: c.campaign_id,
          metadata: {
            rate: Math.round(rate * 1000) / 1000,
            disturbing: c.disturbing,
            impressions: c.impressions,
            threshold: GROWTH_AUTO_STOP.disturbanceRate,
          },
        });
        return {
          campaignId: c.campaign_id,
          name: c.name,
          rate,
          disturbing: c.disturbing,
          impressions: c.impressions,
        };
      });
      if (stopped) {
        report.stopped.push(stopped);
        clearGrowthCache();
        await alert(stopped);
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
