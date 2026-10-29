'use server';

import { headers } from 'next/headers';
import { getSession, setSessionActiveOrganization } from '@ventora/identity';
import { listMyOrganizations, resolveOrgContext } from '@ventora/organizations';

/* Acțiunile de server ale ecranelor de intrare. Utilizatorul vine mereu din sesiune (cookie),
   niciodată din ce trimite clientul (S1). */

type MembershipRow = {
  organization_id: string;
  organization_name: string;
  role: string;
  status: string;
};

async function myMemberships(userId: string): Promise<MembershipRow[]> {
  const rows = (await listMyOrganizations(userId)) as MembershipRow[];
  return rows.filter((m) => m.status === 'active');
}

export type AfterSignIn = '/two-factor/setup' | '/choose-business' | '/' | '/sign-in';

/** Unde ajunge cineva după parolă (și după cod, dacă are 2FA). */
export async function routeAfterSignIn(): Promise<AfterSignIn> {
  const session = await getSession(await headers());
  if (!session) return '/sign-in';
  const memberships = await myMemberships(session.userId);
  // R-2F1: proprietarul fără 2FA îl activează la prima intrare, fără perioadă de grație.
  if (!session.twoFactorEnabled && memberships.some((m) => m.role === 'owner'))
    return '/two-factor/setup';
  if (memberships.length > 1) return '/choose-business';
  if (
    memberships.length === 1 &&
    session.activeOrganizationId !== memberships[0]!.organization_id
  ) {
    const ctx = await resolveOrgContext({
      userId: session.userId,
      organizationId: memberships[0]!.organization_id,
    });
    await setSessionActiveOrganization(session.token, ctx);
  }
  return '/';
}

export type MyBusiness = { id: string; name: string; role: string; active: boolean };

/** Afacerile în care lucrează utilizatorul (HubChooseBusiness), cea activă prima. */
export async function listMyBusinesses(): Promise<MyBusiness[] | null> {
  const session = await getSession(await headers());
  if (!session) return null;
  const rows = await myMemberships(session.userId);
  return rows
    .map((m) => ({
      id: m.organization_id,
      name: m.organization_name,
      role: m.role,
      active: m.organization_id === session.activeOrganizationId,
    }))
    .sort((a, b) => Number(b.active) - Number(a.active));
}

/** Deschide afacerea aleasă: verifică apartenența, apoi o pune în sesiune (§7.4). */
export async function openBusiness(organizationId: string): Promise<boolean> {
  const session = await getSession(await headers());
  if (!session) return false;
  const ctx = await resolveOrgContext({ userId: session.userId, organizationId });
  await setSessionActiveOrganization(session.token, ctx);
  return true;
}
