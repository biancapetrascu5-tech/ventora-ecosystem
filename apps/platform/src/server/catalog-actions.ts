'use server';

import './access-config';
import './billing-config';
import { headers } from 'next/headers';
import { authorize, getTeamOwnerName, PLATFORM_APPLICATION_ID } from '@ventora/access';
import { getBillingAccount, type SavedCard } from '@ventora/billing';
import {
  createCommercialRequest,
  getCatalogForOrg,
  getSeatsBreakdown,
  type Catalog,
} from '@ventora/commercial';
import { getSession } from '@ventora/identity';
import { reportActionError } from './report-error';

/* HubCatalogBundles (Lotul 3.4, S117 / D3-24): catalogul afacerii active — bundle-urile în vânzare,
   aplicațiile la bucată, ce plătește acum — și „Cere acest bundle” (doar owner-ul, D3-8; cererea
   ajunge în „Cereri” la Founder). Afacerea vine din sesiune prin authorize(), niciodată din client. */

export type CatalogData = Catalog & { owner: boolean };

/** null: fără sesiune, fără afacere activă sau afacere suspendată → pagina dă 404. */
export async function readCatalog(): Promise<CatalogData | null> {
  const session = await getSession(await headers());
  if (!session) return null;
  try {
    const ctx = await authorize({
      sessionToken: session.token,
      applicationId: PLATFORM_APPLICATION_ID,
    });
    const catalog = await getCatalogForOrg(ctx.organizationId);
    return { ...catalog, owner: ctx.role === 'owner' };
  } catch (err) {
    reportActionError('readCatalog', err);
    return null;
  }
}

/** Cererea pentru un bundle (o cerere deschisă nu se dublează: `created` e false). */
export async function requestBundle(planId: string): Promise<{ ok: boolean }> {
  const session = await getSession(await headers());
  if (!session) return { ok: false };
  try {
    const ctx = await authorize({
      sessionToken: session.token,
      applicationId: PLATFORM_APPLICATION_ID,
    });
    await createCommercialRequest(ctx, {
      kind: 'plan_change',
      targetType: 'plan',
      targetId: planId,
    });
    return { ok: true };
  } catch (err) {
    reportActionError('requestBundle', err);
    return { ok: false };
  }
}

/* Lotul 3.7 — HubCatalog („Toate aplicațiile”, /applications) și HubCatalogApp (/applications/[app], cu
   HubAppActivation): pentru orice membru al afacerii active. Doar owner-ul activează sau cere
   (D3-8); ceilalți recomandă aplicația owner-ului (tellOwner, plan-actions). */

export type AppsData = Catalog & {
  owner: boolean;
  /** Numele owner-ului, pentru „Ajunge la {who} (proprietar).”; doar pentru ceilalți. */
  ownerName: string | null;
  /** Bundle-ul afacerii (numele), pentru „Inclusă în bundle-ul {name}”. */
  bundleName: string | null;
  /** Doar pentru owner: cardul salvat, plata manuală și cheia publică Stripe. */
  billing: { card: SavedCard | null; manualPayment: boolean; publishableKey: string | null } | null;
};

/** null: fără sesiune, fără afacere activă sau afacere suspendată → pagina dă 404. */
export async function readApps(): Promise<AppsData | null> {
  const session = await getSession(await headers());
  if (!session) return null;
  try {
    const ctx = await authorize({
      sessionToken: session.token,
      applicationId: PLATFORM_APPLICATION_ID,
    });
    const owner = ctx.role === 'owner';
    const [catalog, seats, ownerName] = await Promise.all([
      getCatalogForOrg(ctx.organizationId),
      getSeatsBreakdown(ctx.organizationId),
      owner ? Promise.resolve(null) : getTeamOwnerName({ sessionToken: session.token }),
    ]);
    let billing: AppsData['billing'] = null;
    if (owner) {
      const buyer = await authorize({
        sessionToken: session.token,
        applicationId: PLATFORM_APPLICATION_ID,
        permission: 'billing.purchase',
      });
      billing = {
        ...(await getBillingAccount(buyer)),
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? null,
      };
    }
    return { ...catalog, owner, ownerName, bundleName: seats.bundleName, billing };
  } catch (err) {
    reportActionError('readApps', err);
    return null;
  }
}
