'use server';

import './access-config';
import './billing-config';
import { headers } from 'next/headers';
import { authorize, getTeamOwnerName, PLATFORM_APPLICATION_ID } from '@ventora/access';
import { getBillingAccount, listPayments, type PaymentRow, type SavedCard } from '@ventora/billing';
import {
  createCommercialRequest,
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
import { reportActionError } from './report-error';

/* Lotul 3.7 — HubAdminPlan („Abonament și consum”, S111 / S113 / S117). Pentru owner și admin
   (secțiunea „Afacerea”); un membru primește 404, ca la echipă. Doar owner-ul (`billing.purchase`,
   D3-8) vede cardul și plățile și cumpără; adminul vede abonamentul și consumul și îl anunță pe
   owner. Afacerea vine din sesiune prin authorize(), niciodată din client; totul se citește din
   contractele core/commercial și core/billing.

   Facturile vin în Lotul 3.6 (SmartBill): până atunci lista arată plățile, fiecare cu „Factura se
   emite” (`PaymentRow.invoice` e null; vezi core/billing/src/history.ts). */

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
};

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
    if (owner) {
      // `billing.purchase`: verificat pe server, nu doar ascuns în ecran (D3-8)
      const buyer = await authorize({
        sessionToken: session.token,
        applicationId: PLATFORM_APPLICATION_ID,
        permission: 'billing.purchase',
      });
      const [account, list] = await Promise.all([getBillingAccount(buyer), listPayments(buyer)]);
      billing = { ...account, publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? null };
      payments = list;
    }
    return { owner, ownerName, summary, catalog, seats, packs, offers, billing, payments };
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

/** „Cere activare” pentru o aplicație la cerere (S113): cererea ajunge în Founder · Cereri. */
export async function requestApp(applicationId: string): Promise<{ ok: boolean }> {
  try {
    const c = await context();
    if (!c) return { ok: false };
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
