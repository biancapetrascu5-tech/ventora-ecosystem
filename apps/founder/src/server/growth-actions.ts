'use server';

import { headers } from 'next/headers';
import { getFounderNames } from '@ventora/identity';
import {
  getGrowthControlForFounder,
  listCampaignsForFounder,
  listGrowthLogForFounder,
  restartCampaign,
  setGrowthCaps,
  setGrowthPaused,
  setPlacementStopped,
  stopCampaign,
  type FounderCampaign,
  type GrowthControlView,
  type GrowthPlacementView,
} from '@ventora/growth';
import { reportActionError } from './report-error';

/* Lotul 5.10 — Founder · Growth & Campaigns. Sesiunea Founder vine din cookie (requireFounderSession
   în core/growth, cu 2FA); fiecare scriere are rândul ei de audit pe persoana Founder, în aceeași
   tranzacție. Datele trec spre ecrane fără Date (ISO). */

export type ActionResult = { ok: true } | { ok: false; field?: string; conflict?: boolean };

function fail(action: string, err: unknown): ActionResult {
  reportActionError(action, err);
  const e = err as { code?: string; field?: string };
  if (e.code === 'INVALID_INPUT') return { ok: false, field: e.field };
  if (e.code === 'CONFLICT') return { ok: false, conflict: true };
  return { ok: false };
}

export type GrowthLogData = {
  id: string;
  createdAt: string;
  action: string;
  targetId: string | null;
  metadata: Record<string, unknown>;
  /** „Sistem” pentru oprirea automată; altfel numele persoanei Founder. */
  who: string | null;
};

export type GrowthControlData = {
  control: GrowthControlView;
  placements: GrowthPlacementView[];
  campaigns: Pick<FounderCampaign, 'id' | 'name' | 'status' | 'stopReason' | 'mode' | 'startsAt'>[];
  log: GrowthLogData[];
};

/** Growth › Control: oprirea globală, campaniile, sloturile, plafoanele și jurnalul. */
export async function readGrowthControl(): Promise<GrowthControlData | null> {
  try {
    const founderHeaders = await headers();
    const [{ control, placements }, campaigns, log] = await Promise.all([
      getGrowthControlForFounder({ founderHeaders }),
      listCampaignsForFounder({ founderHeaders }),
      listGrowthLogForFounder({ founderHeaders, limit: 50 }),
    ]);
    const names = await getFounderNames(log.map((e) => e.founderId ?? '').filter(Boolean));
    return {
      control,
      placements,
      campaigns: campaigns.map((k) => ({
        id: k.id,
        name: k.name,
        status: k.status,
        stopReason: k.stopReason,
        mode: k.mode,
        startsAt: k.startsAt,
      })),
      log: log.map((e) => ({
        id: e.id,
        createdAt: e.createdAt.toISOString(),
        action: e.action,
        targetId: e.targetId,
        metadata: e.metadata,
        who: e.founderId ? (names[e.founderId] ?? null) : null,
      })),
    };
  } catch (err) {
    reportActionError('readGrowthControl', err);
    return null;
  }
}

export async function growthStop(
  target: { kind: 'global' } | { kind: 'campaign' | 'slot'; id: string },
  reason: string,
): Promise<ActionResult> {
  try {
    const founderHeaders = await headers();
    if (target.kind === 'global') await setGrowthPaused({ founderHeaders, paused: true, reason });
    else if (target.kind === 'slot') {
      await setPlacementStopped({ founderHeaders, slotId: target.id, stopped: true, reason });
    } else await stopCampaign({ founderHeaders, campaignId: target.id, note: reason });
    return { ok: true };
  } catch (err) {
    return fail('growthStop', err);
  }
}

/** Pornirea la loc: globală și pe slot fără confirmare; campania cere „Ce ai schimbat”. */
export async function growthStart(
  target: { kind: 'global' } | { kind: 'slot'; id: string } | { kind: 'campaign'; id: string },
  whatChanged?: string,
): Promise<ActionResult> {
  try {
    const founderHeaders = await headers();
    if (target.kind === 'global') await setGrowthPaused({ founderHeaders, paused: false });
    else if (target.kind === 'slot') {
      await setPlacementStopped({ founderHeaders, slotId: target.id, stopped: false });
    } else {
      await restartCampaign({
        founderHeaders,
        campaignId: target.id,
        whatChanged: whatChanged ?? '',
      });
    }
    return { ok: true };
  } catch (err) {
    return fail('growthStart', err);
  }
}

export async function growthCaps(caps: {
  daily: number;
  weekly: number;
  cooldown: number;
}): Promise<ActionResult> {
  try {
    await setGrowthCaps({
      founderHeaders: await headers(),
      dailyPerUser: caps.daily,
      weeklyPerUser: caps.weekly,
      dismissCooldownDays: caps.cooldown,
    });
    return { ok: true };
  } catch (err) {
    return fail('growthCaps', err);
  }
}
