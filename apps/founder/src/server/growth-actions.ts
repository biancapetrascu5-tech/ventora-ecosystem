'use server';

import { headers } from 'next/headers';
import { getFounderNames } from '@ventora/identity';
import { EVENT_CATALOG, type GrowthLocale } from '@ventora/contracts';
import {
  listAddonsForFounder,
  listApplicationsForFounder,
  listPlansForFounder,
} from '@ventora/commercial';
import {
  approveOfferText,
  archiveOffer,
  createCampaign,
  createOffer,
  getGrowthControlForFounder,
  listOffersForFounder,
  publishCampaign,
  publishOffer,
  saveOfferText,
  updateCampaign,
  updateOfferTarget,
  type FounderCampaignInput,
  type FounderOffer,
  type FounderOfferTarget,
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

// ── Oferte și textele lor (5.10a) ─────────────────────────────────────────────────────────

export type GrowthCatalogData = {
  applications: { id: string; name: string; monthMinor: number | null; setupMinor: number }[];
  addons: {
    code: string;
    name: string;
    priceMinor: number | null;
    setupMinor: number;
    monthly: boolean;
    onSale: boolean;
  }[];
  versions: { id: string; label: string; monthMinor: number | null; onSale: boolean }[];
};

export type GrowthOffersData = { offers: FounderOffer[]; catalog: GrowthCatalogData };

/** Ofertele, cu textele, și obiectele comerciale (prețurile în lei: costul afișat vine de aici). */
export async function readGrowthOffers(): Promise<GrowthOffersData | null> {
  try {
    const founderHeaders = await headers();
    const [offers, apps, addons, plans] = await Promise.all([
      listOffersForFounder({ founderHeaders }),
      listApplicationsForFounder({ founderHeaders }),
      listAddonsForFounder({ founderHeaders }),
      listPlansForFounder({ founderHeaders }),
    ]);
    return {
      offers,
      catalog: {
        applications: apps.map((a) => ({
          id: a.id,
          name: a.name,
          monthMinor:
            a.prices.find((p) => p.currency === 'RON' && p.kind === 'month')?.amountMinor ?? null,
          setupMinor:
            a.prices.find((p) => p.currency === 'RON' && p.kind === 'setup')?.amountMinor ?? 0,
        })),
        addons: addons.map((a) => {
          const ron = a.prices.find((p) => p.currency === 'RON');
          return {
            code: a.code,
            name: a.name,
            priceMinor: ron?.amountMinor ?? null,
            setupMinor: ron?.setupMinor ?? 0,
            monthly: a.validity === 'monthly',
            onSale: a.salesStoppedAt === null,
          };
        }),
        versions: plans.flatMap((p) =>
          p.versions
            .filter((v) => v.publishedAt !== null)
            .map((v) => ({
              id: v.id,
              label: `${p.name} · v${v.number}`,
              monthMinor:
                v.terms.prices.find((x) => x.currency === 'RON' && x.kind === 'month')
                  ?.amountMinor ?? null,
              onSale: p.salesStoppedAt === null,
            })),
        ),
      },
    };
  } catch (err) {
    reportActionError('readGrowthOffers', err);
    return null;
  }
}

export async function growthCreateOffer(
  target: FounderOfferTarget,
): Promise<ActionResult & { id?: string }> {
  try {
    const code = `oferta-${crypto.randomUUID().slice(0, 8)}`;
    const { id } = await createOffer({ founderHeaders: await headers(), code, target });
    return { ok: true, id };
  } catch (err) {
    return fail('growthCreateOffer', err);
  }
}

export async function growthUpdateOffer(
  offerId: string,
  target: FounderOfferTarget,
): Promise<ActionResult> {
  try {
    await updateOfferTarget({ founderHeaders: await headers(), offerId, target });
    return { ok: true };
  } catch (err) {
    return fail('growthUpdateOffer', err);
  }
}

export async function growthSaveText(input: {
  offerId: string;
  locale: GrowthLocale;
  title: string;
  body: string;
  approve?: boolean;
}): Promise<ActionResult> {
  try {
    const founderHeaders = await headers();
    await saveOfferText({ founderHeaders, ...input });
    if (input.approve) {
      await approveOfferText({ founderHeaders, offerId: input.offerId, locale: input.locale });
    }
    return { ok: true };
  } catch (err) {
    return fail('growthSaveText', err);
  }
}

export async function growthApproveText(
  offerId: string,
  locale: GrowthLocale,
): Promise<ActionResult> {
  try {
    await approveOfferText({ founderHeaders: await headers(), offerId, locale });
    return { ok: true };
  } catch (err) {
    return fail('growthApproveText', err);
  }
}

export async function growthPublishOffer(offerId: string): Promise<ActionResult> {
  try {
    await publishOffer({ founderHeaders: await headers(), offerId });
    return { ok: true };
  } catch (err) {
    return fail('growthPublishOffer', err);
  }
}

export async function growthArchiveOffer(offerId: string): Promise<ActionResult> {
  try {
    await archiveOffer({ founderHeaders: await headers(), offerId });
    return { ok: true };
  } catch (err) {
    return fail('growthArchiveOffer', err);
  }
}

// ── Campanii (5.10b) ──────────────────────────────────────────────────────────────────────

export type GrowthCampaignsData = {
  campaigns: FounderCampaign[];
  offers: FounderOffer[];
  catalog: GrowthCatalogData;
  placements: GrowthPlacementView[];
  control: GrowthControlView;
  /** Semnalele permise (evenimentele growthSafe din catalog), tipul și versiunea. */
  signals: { type: string; version: number }[];
};

export async function readGrowthCampaigns(): Promise<GrowthCampaignsData | null> {
  try {
    const founderHeaders = await headers();
    const [campaigns, offersData, ctl] = await Promise.all([
      listCampaignsForFounder({ founderHeaders }),
      readGrowthOffers(),
      getGrowthControlForFounder({ founderHeaders }),
    ]);
    if (!offersData) return null;
    return {
      campaigns,
      offers: offersData.offers,
      catalog: offersData.catalog,
      placements: ctl.placements,
      control: ctl.control,
      signals: EVENT_CATALOG.filter((e) => e.growthSafe).map((e) => ({
        type: e.type,
        version: e.version,
      })),
    };
  } catch (err) {
    reportActionError('readGrowthCampaigns', err);
    return null;
  }
}

export async function growthSaveCampaign(
  campaignId: string | null,
  campaign: FounderCampaignInput,
  publish: boolean,
): Promise<ActionResult & { id?: string }> {
  try {
    const founderHeaders = await headers();
    let id = campaignId;
    if (id) await updateCampaign({ founderHeaders, campaignId: id, campaign });
    else id = (await createCampaign({ founderHeaders, campaign })).id;
    if (publish) await publishCampaign({ founderHeaders, campaignId: id });
    return { ok: true, id };
  } catch (err) {
    return fail('growthSaveCampaign', err);
  }
}
