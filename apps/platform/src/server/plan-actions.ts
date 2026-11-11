'use server';

import './access-config';
import './billing-config';
import { headers } from 'next/headers';
import { authorize, getTeamOwnerName, PLATFORM_APPLICATION_ID } from '@ventora/access';
import {
  confirmPurchase,
  getBillingAccount,
  getBillingProfile,
  getInvoiceDownloadPath,
  paySetupRequest,
  type BillingProfile,
  listPayments,
  type PaymentRow,
  type SavedCard,
} from '@ventora/billing';
import {
  acceptSetupOffer,
  cancelSetupByOwner,
  createCommercialRequest,
  listSetupRequests,
  requestSetup,
  startApplicationTrial,
  type SetupRequestRow,
  getActivePacks,
  getCatalogForOrg,
  getSeatsBreakdown,
  getSubscriptionSummary,
  listAddonsForOrg,
  notifyOwner,
  type ActivePack,
  type Catalog,
  type OwnerNoticeTarget,
  type SeatsBreakdown,
} from '@ventora/commercial';
import type { AddonOffer, SubscriptionSummary } from '@ventora/contracts';
import { getSession } from '@ventora/identity';
import { createSupportRequest, resolveSupportActor } from '@ventora/support';
import { readGrowthSlot, type GrowthSlotView } from './growth-slot';
import { reportActionError } from './report-error';

/* Lotul 3.7 — HubAdminPlan („Abonament și consum”, S111 / S113 / S117). Pentru owner și admin
   (secțiunea „Afacerea”); un membru primește 404, ca la echipă. Doar owner-ul (`billing.purchase`,
   D3-8) vede cardul și plățile și cumpără; adminul vede abonamentul și consumul și îl anunță pe
   owner. Afacerea vine din sesiune prin authorize(), niciodată din client; totul se citește din
   contractele core/commercial și core/billing.

   Facturile (Lotul 3.6, SmartBill): fiecare plată cu factura ei; până la emitere, „Factura se
   emite” (`PaymentRow.invoice` e null). „Descarcă PDF” cere un link semnat (invoiceDownload). */

export type PlanData = {
  /** Poate cumpăra (owner, `billing.purchase`). */
  owner: boolean;
  /** Numele owner-ului, pentru „doar {who} (proprietar)”; null fără owner activ. */
  ownerName: string | null;
  summary: SubscriptionSummary | null;
  catalog: Catalog;
  seats: SeatsBreakdown | null;
  packs: ActivePack[];
  offers: AddonOffer[];
  /** Doar pentru owner: cardul salvat, plata manuală, cheia publică Stripe. */
  billing: { card: SavedCard | null; manualPayment: boolean; publishableKey: string | null } | null;
  /** Doar pentru owner: plățile, cele mai noi primele. */
  payments: PaymentRow[] | null;
  /** Lotul 3.8 (S121), doar pentru owner: datele de facturare (doar citire). */
  profile: (Omit<BillingProfile, 'createdAt' | 'updatedAt'> & { updatedAt: string }) | null;
  /** Lotul 3.8 (S121), doar pentru owner: cererile cu implementare, cele mai noi primele. */
  setup: SetupData[] | null;
  /** Lotul 5.9a: slotul Growth din „Pachete în plus” (`hub.plan.packs`); null: gol. */
  recommendation: GrowthSlotView | null;
};

export type SetupData = Omit<
  SetupRequestRow,
  | 'createdAt'
  | 'updatedAt'
  | 'offerSentAt'
  | 'acceptedAt'
  | 'confirmedAt'
  | 'paidAt'
  | 'workStartedAt'
  | 'liveAt'
  | 'cancelledAt'
  | 'refundedAt'
> & {
  createdAt: string;
  offerSentAt: string | null;
  paidAt: string | null;
  liveAt: string | null;
  cancelledAt: string | null;
  refundedAt: string | null;
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function toSetupData(r: SetupRequestRow): SetupData {
  const { updatedAt: _u, acceptedAt: _a, confirmedAt: _c, workStartedAt: _w, ...rest } = r;
  return {
    ...rest,
    createdAt: r.createdAt.toISOString(),
    offerSentAt: iso(r.offerSentAt),
    paidAt: iso(r.paidAt),
    liveAt: iso(r.liveAt),
    cancelledAt: iso(r.cancelledAt),
    refundedAt: iso(r.refundedAt),
  };
}

async function context() {
  const session = await getSession(await headers());
  if (!session) return null;
  const ctx = await authorize({
    sessionToken: session.token,
    applicationId: PLATFORM_APPLICATION_ID,
  });
  return { session, ctx };
}

/** null: fără sesiune, membru (nu owner sau admin) sau afacere suspendată → pagina dă 404. */
export async function readPlan(): Promise<PlanData | null> {
  try {
    const c = await context();
    if (!c || (c.ctx.role !== 'owner' && c.ctx.role !== 'admin')) return null;
    const { session, ctx } = c;
    const owner = ctx.role === 'owner';
    const orgId = ctx.organizationId;
    const [summary, catalog, seats, packs, offers, ownerName] = await Promise.all([
      getSubscriptionSummary(orgId),
      getCatalogForOrg(orgId),
      getSeatsBreakdown(orgId),
      getActivePacks(orgId),
      listAddonsForOrg(orgId),
      owner ? Promise.resolve(null) : getTeamOwnerName({ sessionToken: session.token }),
    ]);
    let billing: PlanData['billing'] = null;
    let payments: PlanData['payments'] = null;
    let profile: PlanData['profile'] = null;
    let setup: PlanData['setup'] = null;
    if (owner) {
      // `billing.purchase`: verificat pe server, nu doar ascuns în ecran (D3-8)
      const buyer = await authorize({
        sessionToken: session.token,
        applicationId: PLATFORM_APPLICATION_ID,
        permission: 'billing.purchase',
      });
      const [account, list, saved, requests] = await Promise.all([
        getBillingAccount(buyer),
        listPayments(buyer),
        getBillingProfile({ ...buyer, role: ctx.role }),
        listSetupRequests(orgId),
      ]);
      billing = { ...account, publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? null };
      payments = list;
      if (saved) {
        const { createdAt: _c, updatedAt, ...data } = saved;
        profile = { ...data, updatedAt: updatedAt.toISOString() };
      }
      setup = requests.map(toSetupData);
    }
    return {
      owner,
      ownerName,
      summary,
      catalog,
      seats,
      packs,
      offers,
      billing,
      payments,
      profile,
      setup,
      // Growth nu blochează niciodată pagina: orice eroare = slot gol (§8.7)
      recommendation: await readGrowthSlot(ctx, 'hub.plan.packs'),
    };
  } catch (err) {
    reportActionError('readPlan', err);
    return null;
  }
}

/**
 * „Cere activare” pentru un pachet: la cerere, fără card salvat sau cu plată manuală (D3-7).
 * Doar owner-ul cere (D3-8, verificat în core/commercial); o cerere deschisă nu se dublează.
 */
export async function requestPack(addonId: string): Promise<{ ok: boolean }> {
  try {
    const c = await context();
    if (!c) return { ok: false };
    await createCommercialRequest(c.ctx, {
      kind: 'activation',
      targetType: 'addon',
      targetId: addonId,
    });
    return { ok: true };
  } catch (err) {
    reportActionError('requestPack', err);
    return { ok: false };
  }
}

/**
 * „Cere activare” pentru o aplicație la cerere (S113): cererea ajunge în Founder · Cereri. Lotul
 * 3.8: o aplicație cu implementare devine o cerere cu implementare (S121, FounderSetupRequests).
 */
export async function requestApp(applicationId: string): Promise<{ ok: boolean }> {
  try {
    const c = await context();
    if (!c) return { ok: false };
    const catalog = await getCatalogForOrg(c.ctx.organizationId);
    const app = catalog.applications.find((a) => a.id === applicationId);
    if (app && app.setupMinor > 0) {
      await requestSetup(c.ctx, applicationId);
      return { ok: true };
    }
    await createCommercialRequest(c.ctx, {
      kind: 'activation',
      targetType: 'application',
      targetId: applicationId,
    });
    return { ok: true };
  } catch (err) {
    reportActionError('requestApp', err);
    return { ok: false };
  }
}

/**
 * „Recomandă” (o aplicație) / „Anunță proprietarul” (un pachet, o limită): adminul sau membrul
 * îi trimite owner-ului o notificare. Owner-ul nu se anunță pe sine (refuzat în core/commercial).
 */
export async function tellOwner(
  targetType: OwnerNoticeTarget,
  targetId: string,
): Promise<{ ok: boolean }> {
  try {
    const c = await context();
    if (!c) return { ok: false };
    await notifyOwner(c.ctx, { targetType, targetId });
    return { ok: true };
  } catch (err) {
    reportActionError('tellOwner', err);
    return { ok: false };
  }
}

/**
 * Lotul 3.6 — „Descarcă PDF”: linkul semnat al unei facturi emise a afacerii (5 minute), doar
 * pentru owner (`billing.purchase`, D3-8, verificat pe server). null: refuzat sau negăsit.
 */
export async function invoiceDownload(invoiceId: string): Promise<{ path: string } | null> {
  try {
    const session = await getSession(await headers());
    if (!session) return null;
    const buyer = await authorize({
      sessionToken: session.token,
      applicationId: PLATFORM_APPLICATION_ID,
      permission: 'billing.purchase',
    });
    return { path: await getInvoiceDownloadPath(buyer, invoiceId) };
  } catch (err) {
    reportActionError('invoiceDownload', err);
    return null;
  }
}

// ── Lotul 3.8 ───────────────────────────────────────────────────────────────────────────────

/** „Încearcă 14 zile” (UpgradeDialog, varianta trial; D3-5): doar owner-ul, o dată pe aplicație. */
export async function startTrial(
  applicationId: string,
): Promise<{ ok: true; endsAt: string } | { ok: false; used?: boolean }> {
  try {
    const c = await context();
    if (!c) return { ok: false };
    const trial = await startApplicationTrial(c.ctx, applicationId);
    return { ok: true, endsAt: trial.endsAt.toISOString() };
  } catch (err) {
    const used = /trial_used/.test((err as Error)?.message ?? '');
    if (!used) reportActionError('startTrial', err);
    return { ok: false, used };
  }
}

/** HubSetupRequest: „Accept oferta” / „Refuz” (înainte de plată). */
export async function answerSetupOffer(
  setupRequestId: string,
  accept: boolean,
): Promise<{ ok: boolean }> {
  try {
    const c = await context();
    if (!c) return { ok: false };
    if (accept) await acceptSetupOffer(c.ctx, setupRequestId);
    else await cancelSetupByOwner(c.ctx, setupRequestId);
    return { ok: true };
  } catch (err) {
    reportActionError('answerSetupOffer', err);
    return { ok: false };
  }
}

/** HubSetupRequest „Plătește implementarea”: cu cardul salvat; 3-D Secure în dialog. */
export async function paySetup(
  setupRequestId: string,
): Promise<
  { ok: true; purchaseId: string; status: string; clientSecret?: string } | { ok: false }
> {
  try {
    const c = await context();
    if (!c) return { ok: false };
    const buyer = await authorize({
      sessionToken: c.session.token,
      applicationId: PLATFORM_APPLICATION_ID,
      permission: 'billing.purchase',
    });
    const { purchaseId } = await paySetupRequest(buyer, setupRequestId);
    const res = await confirmPurchase(buyer, purchaseId);
    return {
      ok: true,
      purchaseId,
      status: res.status,
      ...(res.clientSecret ? { clientSecret: res.clientSecret } : {}),
    };
  } catch (err) {
    reportActionError('paySetup', err);
    return { ok: false };
  }
}

/**
 * HubBillingProfile „Cere o schimbare” (S121): o solicitare la Suport, pe „platform”, cu textul
 * owner-ului; echipa o vede în FounderSupportInbox (legătura cu cardul din Founder: N10, PR-ul
 * mic pe core/support, cu câmpul de subiect).
 */
export async function requestProfileChange(text: string): Promise<{ ok: boolean }> {
  const description = text?.trim() ?? '';
  if (!description || description.length > 2000) return { ok: false };
  try {
    const c = await context();
    if (!c || c.ctx.role !== 'owner') return { ok: false };
    const who = await resolveSupportActor(c.session.token);
    await createSupportRequest(who, {
      id: crypto.randomUUID(),
      applicationId: 'platform',
      subject: 'Date de facturare: cerere de schimbare',
      description,
      urgency: 'normal',
      fileIds: [],
    });
    return { ok: true };
  } catch (err) {
    reportActionError('requestProfileChange', err);
    return { ok: false };
  }
}
