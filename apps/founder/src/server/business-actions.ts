'use server';

import { headers } from 'next/headers';
import {
  createBusinessAsFounder,
  getBusinessPageForFounder,
  listBusinessesForFounder,
  reactivateBusiness,
  suspendBusiness,
  type FounderBusiness,
} from '@ventora/access';
import {
  addApplicationToSubscription,
  assignSubscription,
  setBusinessCurrency,
} from '@ventora/commercial';
import { reportActionError } from './report-error';

/* Afacerile în Founder (Lot 2.8). Sesiunea Founder vine din cookie (requireFounderSession în
   core/access, cu 2FA); erorile tipizate devin rezultate simple pentru ecrane. */

export type BusinessData = {
  id: string;
  name: string;
  status: 'active' | 'suspended';
  createdAt: string;
  owner: { userId: string; name: string; email: string } | null;
  ownerInvitation: { email: string; state: string } | null;
  memberCount: number;
};

const serialize = (b: FounderBusiness): BusinessData => ({
  id: b.id,
  name: b.name,
  status: b.status,
  createdAt: b.createdAt.toISOString(),
  owner: b.owner,
  ownerInvitation: b.ownerInvitation,
  memberCount: b.memberCount,
});

export async function readBusinesses(): Promise<BusinessData[] | null> {
  try {
    return (await listBusinessesForFounder({ founderHeaders: await headers() })).map(serialize);
  } catch (err) {
    reportActionError('readBusinesses', err);
    return null;
  }
}

export type BusinessPageData = {
  business: BusinessData;
  /** `founderName`: cine din echipa Ventora a făcut schimbarea („{event} ({name})”). */
  recent: { id: string; action: string; createdAt: string; founderName: string | null }[];
  /** S112: „Suspendată pe {date} de {name}”. */
  suspension: { at: string; by: string | null } | null;
};

export async function readBusinessPage(organizationId: string): Promise<BusinessPageData | null> {
  try {
    const page = await getBusinessPageForFounder({
      founderHeaders: await headers(),
      organizationId,
    });
    return {
      business: serialize(page.business),
      recent: page.recent.map((r) => ({
        id: String(r.id),
        action: r.action,
        createdAt: new Date(r.createdAt).toISOString(),
        founderName: (r.founderId && page.founderNames[r.founderId]) || null,
      })),
      suspension: page.suspension
        ? {
            at: page.suspension.at.toISOString(),
            by: (page.suspension.founderId && page.founderNames[page.suspension.founderId]) || null,
          }
        : null,
    };
  } catch (err) {
    reportActionError('readBusinessPage', err);
    return null;
  }
}

export async function suspend(organizationId: string, confirmName: string): Promise<boolean> {
  try {
    await suspendBusiness({ founderHeaders: await headers(), organizationId, confirmName });
    return true;
  } catch (err) {
    reportActionError('suspendBusiness', err);
    return false;
  }
}

export async function reactivate(organizationId: string): Promise<boolean> {
  try {
    await reactivateBusiness({ founderHeaders: await headers(), organizationId });
    return true;
  } catch (err) {
    reportActionError('reactivateBusiness', err);
    return false;
  }
}

export type CreateResult =
  { ok: true; organizationId: string; commercialFailed?: boolean } | { ok: false; field?: 'email' };

/** S117 / D3-24 „Ce cumpără”: un bundle și / sau aplicații la bucată, moneda, lunar / anual. */
export type NewBusinessPurchase = {
  currency: 'RON' | 'EUR';
  interval: 'month' | 'year';
  /** Versiunea în vânzare a bundle-ului ales; null = doar aplicații la bucată. */
  bundleVersionId: string | null;
  applications: string[];
  /** D3-5: probă pe tot abonamentul, 14 zile, doar din Founder. */
  trial: boolean;
};

const TRIAL_DAYS = 14;

/**
 * „Afacere nouă” (Lot 2.8 + S117): întâi afacerea și invitația proprietarului (core/access), apoi,
 * în core/commercial, moneda (D3-2), abonamentul — cu bundle sau doar cu aplicații la bucată
 * (D3-24) — și aplicațiile la bucată, fiecare cu auditul ei. Sunt module diferite, deci tranzacții
 * diferite: dacă partea comercială eșuează după ce afacerea s-a creat, ecranul o spune, iar
 * abonamentul se completează din pagina afacerii (raportul 3.4).
 */
export async function createBusiness(
  name: string,
  ownerEmail: string,
  purchase?: NewBusinessPurchase,
): Promise<CreateResult> {
  const h = await headers();
  let organizationId: string;
  try {
    ({ organizationId } = await createBusinessAsFounder({ founderHeaders: h, name, ownerEmail }));
  } catch (err) {
    const e = err as { code?: string; field?: string };
    if (e.code === 'INVALID_INPUT' && e.field === 'ownerEmail')
      return { ok: false, field: 'email' };
    reportActionError('createBusiness', err);
    return { ok: false };
  }
  if (!purchase) return { ok: true, organizationId };
  try {
    await setBusinessCurrency({ founderHeaders: h, organizationId, currency: purchase.currency });
    await assignSubscription({
      founderHeaders: h,
      organizationId,
      versionId: purchase.bundleVersionId,
      interval: purchase.interval,
      trialEndsAt: purchase.trial ? new Date(Date.now() + TRIAL_DAYS * 86_400_000) : undefined,
    });
    for (const applicationId of purchase.applications) {
      await addApplicationToSubscription({ founderHeaders: h, organizationId, applicationId });
    }
    return { ok: true, organizationId };
  } catch (err) {
    reportActionError('createBusinessPurchase', err);
    return { ok: true, organizationId, commercialFailed: true };
  }
}
