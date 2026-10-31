import { cookies } from 'next/headers';
import { getUserById } from '@ventora/identity';
import { getInvitationByToken } from '@ventora/organizations';
import { acceptInvitationWithAccess } from '@ventora/access';
import { reportActionError } from './report-error';

/* Invitația (Lot 2.6 · E), partea de server comună paginii, acțiunilor și intrării. Un cont
   existent intră întâi; tokenul așteaptă într-un cookie httpOnly și e acceptat după intrare. */

export const PENDING_INVITE_COOKIE = 'ventora_pending_invite';
export const PENDING_INVITE_MAX_AGE = 60 * 60;

export type AcceptFailure = 'expired' | 'used' | 'mismatch' | 'error';

/** Acceptă invitația pentru utilizator; adresa vine din cont, nu din ce trimite clientul. */
export async function acceptInviteFor(
  token: string,
  userId: string,
): Promise<{ ok: true; organizationId: string } | { ok: false; reason: AcceptFailure }> {
  const invite = await getInvitationByToken(token);
  if (!invite) return { ok: false, reason: 'error' };
  if (invite.status === 'expired') return { ok: false, reason: 'expired' };
  if (invite.status !== 'pending') return { ok: false, reason: 'used' };
  const user = await getUserById(userId);
  if (!user) return { ok: false, reason: 'error' };
  try {
    const { organizationId } = await acceptInvitationWithAccess({
      token,
      userId,
      userEmail: user.email,
    });
    return { ok: true, organizationId };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'TOKEN_EXPIRED') return { ok: false, reason: 'expired' };
    if (code === 'EMAIL_MISMATCH') return { ok: false, reason: 'mismatch' };
    reportActionError('acceptInvite', err);
    return { ok: false, reason: 'error' };
  }
}

/**
 * Cont existent: după intrare, invitația care aștepta e acceptată o singură dată; cookie-ul se
 * șterge oricum s-ar termina. Întoarce afacerea în care a intrat, ca intrarea s-o deschidă.
 */
export async function acceptPendingInvite(userId: string): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(PENDING_INVITE_COOKIE)?.value;
  if (!token) return null;
  jar.delete(PENDING_INVITE_COOKIE);
  const res = await acceptInviteFor(token, userId);
  return res.ok ? res.organizationId : null;
}
