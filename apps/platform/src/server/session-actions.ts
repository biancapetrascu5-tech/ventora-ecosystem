'use server';

import { headers } from 'next/headers';
import { getOpenLastOrganization, getSession, setOpenLastOrganization } from '@ventora/identity';
import { countApplicationAccess } from '@ventora/access';
import { acceptPendingInvite } from './invite';
import { reportActionError } from './report-error';
import { myMemberships, openInSession, routeSignedIn, type AfterSignIn } from './route';

/* Acțiunile de server ale ecranelor de intrare. Utilizatorul vine mereu din sesiune (cookie),
   niciodată din ce trimite clientul (S1). */

export type { AfterSignIn };

/**
 * Unde ajunge cineva după parolă (și după cod, dacă are 2FA). O invitație care aștepta intrarea
 * (cont existent, Lot 2.6 · E) e acceptată întâi și afacerea ei se deschide.
 */
export async function routeAfterSignIn(): Promise<AfterSignIn> {
  const session = await getSession(await headers());
  if (!session) return '/sign-in';
  const joined = await acceptPendingInvite(session.userId);
  return routeSignedIn(session, joined);
}

export type MyBusiness = {
  id: string;
  name: string;
  role: string;
  /** Aplicațiile membrului; lipsește pentru owner și admin (au toate aplicațiile, ADR-0004). */
  apps?: number;
  lastOpenedAt: string | null;
  /** Lot 2.9b (S112): „Acces oprit” — afacerea e suspendată și nu se poate deschide. */
  suspended: boolean;
};

/** Afacerile în care lucrează utilizatorul (HubChooseBusiness), ultima deschisă prima. */
export async function listMyBusinesses(): Promise<{
  businesses: MyBusiness[];
  openLast: boolean;
} | null> {
  const session = await getSession(await headers());
  if (!session) return null;
  const rows = await myMemberships(session.userId);
  const members = rows.filter(
    (m) => m.role !== 'owner' && m.role !== 'admin' && m.organization_status === 'active',
  );
  const counts = await countApplicationAccess(
    session.userId,
    members.map((m) => m.organization_id),
  );
  return {
    businesses: rows.map((m) => ({
      id: m.organization_id,
      name: m.organization_name,
      role: m.role,
      apps: counts[m.organization_id],
      lastOpenedAt: m.last_opened_at ? new Date(m.last_opened_at).toISOString() : null,
      suspended: m.organization_status === 'suspended',
    })),
    openLast: await getOpenLastOrganization(session.userId),
  };
}

/**
 * HubBusinessSuspended (S112): singura afacere a persoanei e suspendată. Întoarce numele ei
 * (titlul ecranului) sau null dacă persoana are o afacere care se poate deschide.
 */
export async function readSuspendedBusiness(): Promise<{ name: string } | null> {
  const session = await getSession(await headers());
  if (!session) return null;
  const rows = await myMemberships(session.userId);
  if (rows.length !== 1 || rows[0]!.organization_status !== 'suspended') return null;
  return { name: rows[0]!.organization_name };
}

/**
 * Deschide afacerea aleasă: verifică apartenența, o pune în sesiune, notează deschiderea (§7.4)
 * și păstrează alegerea „Deschide direct ultima afacere” pentru utilizator. O afacere
 * suspendată e refuzată de resolveOrgContext (D3-20 a): false, cu eroarea în jurnal.
 */
export async function openBusiness(organizationId: string, openLast: boolean): Promise<boolean> {
  const session = await getSession(await headers());
  if (!session) return false;
  try {
    await openInSession(session, organizationId);
  } catch (err) {
    reportActionError('openBusiness', err);
    return false;
  }
  await setOpenLastOrganization(session.userId, openLast);
  return true;
}
