'use server';

import { requestNewInvitationLink } from '@ventora/organizations';
import { signUpWithInvitation, type InvitationSignUpRefusal } from '@ventora/access';

/* Acțiunile ecranului HubInvite. Lot 2.7 · A: contul se creează doar aici, împreună cu invitația
   (signUpWithInvitation: verifică invitația și adresa, creează contul, acceptă invitația; dacă
   acceptarea eșuează, contul e șters). /api/auth/sign-up/email e închis. Sesiunea vine apoi din
   intrarea obișnuită cu parola, pe ecran. */

export type InviteSignUpResult =
  { ok: true } | { ok: false; reason: InvitationSignUpRefusal | 'password' | 'error' };

export async function signUpFromInvite(params: {
  token: string;
  name: string;
  email: string;
  password: string;
}): Promise<InviteSignUpResult> {
  try {
    await signUpWithInvitation(params);
    return { ok: true };
  } catch (err) {
    const e = err as { reason?: InvitationSignUpRefusal; statusCode?: number };
    if (e.reason) return { ok: false, reason: e.reason };
    // Better Auth (lungimea) și politica Hub (password-policy) refuză parola cu 400
    if (e.statusCode === 400) return { ok: false, reason: 'password' };
    return { ok: false, reason: 'error' };
  }
}

/** „Cere o invitație nouă” din invitația expirată. */
export async function requestNewInvite(token: string): Promise<boolean> {
  return requestNewInvitationLink(token);
}
