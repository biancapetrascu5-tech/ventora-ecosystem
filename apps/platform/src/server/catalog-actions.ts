'use server';

import './access-config';
import { headers } from 'next/headers';
import { authorize, PLATFORM_APPLICATION_ID } from '@ventora/access';
import { createCommercialRequest, getCatalogForOrg, type Catalog } from '@ventora/commercial';
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
