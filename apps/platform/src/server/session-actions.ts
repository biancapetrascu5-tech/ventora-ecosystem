'use server';

import { headers } from 'next/headers';
import { getOpenLastOrganization, getSession, setOpenLastOrganization } from '@ventora/identity';
import { countApplicationAccess } from '@ventora/access';
import { acceptPendingInvite } from './invite';
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
};

/** Afacerile în care lucrează utilizatorul (HubChooseBusiness), ultima deschisă prima. */
export async function listMyBusinesses(): Promise<{
  businesses: MyBusiness[];
  openLast: boolean;
} | null> {
  const session = await getSession(await headers());
  if (!session) return null;
  const rows = await myMemberships(session.userId);
  const members = rows.filter((m) => m.role !== 'owner' && m.role !== 'admin');
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
    })),
    openLast: await getOpenLastOrganization(session.userId),
  };
}

/**
 * Deschide afacerea aleasă: verifică apartenența, o pune în sesiune, notează deschiderea (§7.4)
 * și păstrează alegerea „Deschide direct ultima afacere” pentru utilizator.
 */
export async function openBusiness(organizationId: string, openLast: boolean): Promise<boolean> {
  const session = await getSession(await headers());
  if (!session) return false;
  await openInSession(session, organizationId);
  await setOpenLastOrganization(session.userId, openLast);
  return true;
}
