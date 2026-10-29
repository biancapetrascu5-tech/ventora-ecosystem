'use server';

import { headers } from 'next/headers';
import { getSession } from '@ventora/identity';
import { requestNewInvitationLink } from '@ventora/organizations';
import { acceptInviteFor, type AcceptFailure } from './invite';
import { routeSignedIn, type AfterSignIn } from './route';

/* Acțiunile ecranului HubInvite (Lot 2.6 · E). Contul nou e creat întâi de ecran prin
   /api/auth/sign-up/email (sesiunea vine în cookie); aici invitația e acceptată pentru el. */

export type AcceptResult =
  { ok: true; to: AfterSignIn } | { ok: false; reason: AcceptFailure | 'signedOut' };

export async function acceptInvite(token: string): Promise<AcceptResult> {
  const session = await getSession(await headers());
  if (!session) return { ok: false, reason: 'signedOut' };
  const res = await acceptInviteFor(token, session.userId);
  if (!res.ok) return res;
  return { ok: true, to: await routeSignedIn(session, res.organizationId) };
}

/** „Cere o invitație nouă” din invitația expirată. */
export async function requestNewInvite(token: string): Promise<boolean> {
  return requestNewInvitationLink(token);
}
