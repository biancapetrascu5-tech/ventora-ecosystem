'use server';

import { headers } from 'next/headers';
import {
  listTeamInvitations,
  listTeamMembers,
  resendTeamInvitation,
  revokeTeamInvitation,
} from '@ventora/access';
import { getSession } from '@ventora/identity';
import { myMemberships } from './route';

/* HubAdminTeam (Lot 2.8). Tokenul vine din sesiunea din cookie; core/access refuză pe server tot
   ce nu e owner sau admin în afacerea activă (și orice afacere suspendată, D3-20 a). */

export type TeamData = {
  business: string;
  members: {
    id: string;
    name: string;
    email: string;
    role: string;
    status: 'active' | 'suspended';
    applicationIds: string[] | null;
  }[];
  invites: {
    id: string;
    email: string;
    role: string;
    status: string;
    createdAt: string;
    expiresAt: string;
    newLinkRequestedAt: string | null;
  }[];
};

/** null: fără sesiune, fără drept (membru) sau afacere suspendată → pagina dă 404. */
export async function readTeam(): Promise<TeamData | null> {
  const session = await getSession(await headers());
  if (!session) return null;
  try {
    const [members, invites, memberships] = await Promise.all([
      listTeamMembers({ sessionToken: session.token }),
      listTeamInvitations({ sessionToken: session.token }),
      myMemberships(session.userId),
    ]);
    const business =
      memberships.find((m) => m.organization_id === session.activeOrganizationId)
        ?.organization_name ?? '';
    return {
      business,
      members: members.map((m) => ({
        id: m.userId,
        name: m.name,
        email: m.email,
        role: m.role,
        status: m.status,
        applicationIds: m.applicationIds,
      })),
      invites: invites.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        status: i.status,
        createdAt: i.createdAt.toISOString(),
        expiresAt: i.expiresAt.toISOString(),
        newLinkRequestedAt: i.newLinkRequestedAt ? i.newLinkRequestedAt.toISOString() : null,
      })),
    };
  } catch {
    return null;
  }
}

export async function resendInvite(invitationId: string): Promise<boolean> {
  const session = await getSession(await headers());
  if (!session) return false;
  try {
    await resendTeamInvitation({ sessionToken: session.token, invitationId });
    return true;
  } catch {
    return false;
  }
}

export async function cancelInvite(invitationId: string): Promise<boolean> {
  const session = await getSession(await headers());
  if (!session) return false;
  try {
    await revokeTeamInvitation({ sessionToken: session.token, invitationId });
    return true;
  } catch {
    return false;
  }
}
