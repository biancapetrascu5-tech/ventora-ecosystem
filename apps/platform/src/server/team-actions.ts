'use server';

import './access-config';
import { headers } from 'next/headers';
import {
  changeTeamMemberRole,
  inviteToTeam,
  listTeamInvitations,
  listTeamMembers,
  removeTeamMember,
  resendTeamInvitation,
  revokeTeamInvitation,
  setTeamMemberAccess,
  setTeamMemberApplications,
} from '@ventora/access';
import {
  APPLICATIONS,
  getEffectiveEntitlements,
  getSeatsBreakdown,
  type SeatsBreakdown,
} from '@ventora/commercial';
import { getSession } from '@ventora/identity';
import { myMemberships } from './route';
import { reportActionError } from './report-error';

/* HubAdminTeam (Lot 2.8). Tokenul vine din sesiunea din cookie; core/access refuză pe server tot
   ce nu e owner sau admin în afacerea activă (și orice afacere suspendată, D3-20 a). */

export type TeamData = {
  business: string;
  /** S117: de unde vin locurile din echipă (cont, bundle, pachete); null dacă nu se poate citi. */
  seats: SeatsBreakdown | null;
  /** Lot 2.9b: cine se uită (nu se poate atinge pe sine) și rolul lui (un admin nu face admini). */
  viewer: { id: string; role: 'owner' | 'admin' };
  /** Aplicațiile afacerii, pentru „Invită o persoană” și „Acces la aplicații”. */
  apps: string[];
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
    const current = memberships.find((m) => m.organization_id === session.activeOrganizationId);
    const business = current?.organization_name ?? '';
    const entitled = session.activeOrganizationId
      ? (await getEffectiveEntitlements(session.activeOrganizationId)).applications
      : [];
    const seats = session.activeOrganizationId
      ? await getSeatsBreakdown(session.activeOrganizationId).catch((err) => {
          reportActionError('readTeamSeats', err);
          return null;
        })
      : null;
    return {
      business,
      seats,
      viewer: { id: session.userId, role: current?.role === 'owner' ? 'owner' : 'admin' },
      // fără abonament încă (afacerile de dinaintea Fazei 3): toate aplicațiile, ca invitația
      // să nu fie blocată (raportul 2.9b, NECESITĂ DECIZIE)
      apps: entitled.length > 0 ? entitled : [...ALL_APPS],
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
  } catch (err) {
    reportActionError('readTeam', err);
    return null;
  }
}

export async function resendInvite(invitationId: string): Promise<boolean> {
  const session = await getSession(await headers());
  if (!session) return false;
  try {
    await resendTeamInvitation({ sessionToken: session.token, invitationId });
    return true;
  } catch (err) {
    reportActionError('resendInvite', err);
    return false;
  }
}

const ALL_APPS = APPLICATIONS.filter((a) => !a.isPlatform).map((a) => a.id);

export type InviteFormResult =
  | { ok: true; email: string; expiresAt: string }
  | { ok: false; error: 'email' | 'apps' | 'member' | 'failed' }
  | { ok: false; error: 'invited'; invitationId: string; sentAt: string };

/**
 * HubTeamInvite (S112). Erorile formularului vin de pe server: adresa greșită, nicio aplicație,
 * persoana e deja în echipă, invitația e deja trimisă (cu id-ul ei, pentru „Retrimite”).
 */
export async function sendTeamInvite(input: {
  email: string;
  role: 'member' | 'admin';
  applicationIds: string[];
}): Promise<InviteFormResult> {
  const session = await getSession(await headers());
  if (!session) return { ok: false, error: 'failed' };
  try {
    const r = await inviteToTeam({ sessionToken: session.token, ...input });
    if (r.status === 'already_member') return { ok: false, error: 'member' };
    if (r.status === 'already_invited') {
      return {
        ok: false,
        error: 'invited',
        invitationId: r.invitationId,
        sentAt: r.sentAt.toISOString(),
      };
    }
    return { ok: true, email: r.email, expiresAt: r.expiresAt.toISOString() };
  } catch (err) {
    const field = (err as { field?: string }).field;
    if (field === 'email' || field === 'applicationIds') {
      reportActionError('sendTeamInvite', err, { quietIfExpected: true });
      return { ok: false, error: field === 'email' ? 'email' : 'apps' };
    }
    reportActionError('sendTeamInvite', err);
    return { ok: false, error: 'failed' };
  }
}

/** Meniul unui membru (Lot 2.9b): o acțiune, pe server doar owner / admin, owner-ul neatins. */
async function memberAction(name: string, run: (token: string) => Promise<unknown>) {
  const session = await getSession(await headers());
  if (!session) return false;
  try {
    await run(session.token);
    return true;
  } catch (err) {
    reportActionError(name, err);
    return false;
  }
}

export async function changeMemberRole(userId: string, role: 'member' | 'admin') {
  return memberAction('changeMemberRole', (sessionToken) =>
    changeTeamMemberRole({ sessionToken, userId, role }),
  );
}

export async function setMemberApps(userId: string, applicationIds: string[]) {
  return memberAction('setMemberApps', (sessionToken) =>
    setTeamMemberApplications({ sessionToken, userId, applicationIds }),
  );
}

export async function setMemberAccess(userId: string, access: 'stopped' | 'active') {
  return memberAction('setMemberAccess', (sessionToken) =>
    setTeamMemberAccess({ sessionToken, userId, access }),
  );
}

export async function removeMember(userId: string) {
  return memberAction('removeMember', (sessionToken) => removeTeamMember({ sessionToken, userId }));
}

export async function cancelInvite(invitationId: string): Promise<boolean> {
  const session = await getSession(await headers());
  if (!session) return false;
  try {
    await revokeTeamInvitation({ sessionToken: session.token, invitationId });
    return true;
  } catch (err) {
    reportActionError('cancelInvite', err);
    return false;
  }
}
