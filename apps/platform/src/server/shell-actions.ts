'use server';

import { headers } from 'next/headers';
import { getSession, getUserById } from '@ventora/identity';
import type { HubShellData } from '@/screens/shell/HubShell';
import { myMemberships, openInSession } from './route';
import { reportActionError } from './report-error';

/* Shell-ul Hub (Lot 2.8): cine e conectat, afacerile lui și rolul în afacerea activă. Lot 2.9b
   (S112): afacerile suspendate apar oprite în OrgSwitcher și nu se pot alege (D3-20 a).
   Utilizatorul vine din sesiune, niciodată din client (S1). */

export async function readHubShell(): Promise<HubShellData | null> {
  const session = await getSession(await headers());
  if (!session) return null;
  const [user, memberships] = await Promise.all([
    getUserById(session.userId),
    myMemberships(session.userId),
  ]);
  if (!user) return null;
  // the active business is never a suspended one (S112): a session left on it has none
  const current = memberships.find(
    (m) => m.organization_id === session.activeOrganizationId && m.organization_status === 'active',
  );
  return {
    user: { name: user.name, email: user.email },
    orgs: memberships.map((m) => ({
      id: m.organization_id,
      name: m.organization_name,
      role: m.role,
      suspended: m.organization_status === 'suspended',
    })),
    currentOrgId: current?.organization_id ?? null,
    manager: current?.role === 'owner' || current?.role === 'admin',
    // the business left in the session was suspended meanwhile: the Hub sends the person on
    suspendedRedirect: memberships.some(
      (m) =>
        m.organization_id === session.activeOrganizationId && m.organization_status === 'suspended',
    )
      ? memberships.some((m) => m.organization_status === 'active') || memberships.length > 1
        ? '/choose-business'
        : '/business-suspended'
      : null,
  };
}

/** Afacerea aleasă din bara de sus: verifică apartenența și o pune în sesiune (§7.4). */
export async function switchBusiness(organizationId: string): Promise<boolean> {
  const session = await getSession(await headers());
  if (!session) return false;
  try {
    await openInSession(session, organizationId);
    return true;
  } catch (err) {
    reportActionError('switchBusiness', err);
    return false;
  }
}
