'use server';

import { headers } from 'next/headers';
import { getSession, listSessions, revokeSession } from '@ventora/identity';
import { disableMemberTwoFactor } from '@ventora/access';

/* Contul tău · Securitate (Lot 2.7 · D, S100, S108). Utilizatorul vine mereu din sesiune.
   „Schimbă parola” și activarea 2FA merg direct la Better Auth din ecran: /change-password,
   /two-factor/enable cu parola actuală (S110), apoi /two-factor/verify-totp. */

type Coded = { code?: string; lockedUntil?: string };

export type DisableTwoFactorResult =
  | { ok: true }
  | { ok: false; reason: 'wrong' | 'owner' | 'error' }
  | { ok: false; reason: 'locked'; lockedUntil: string };

/** „Dezactivează”: doar membrii, cu codul din aplicație (5 greșite → 15 minute). */
export async function disableTwoFactor(code: string): Promise<DisableTwoFactorResult> {
  try {
    await disableMemberTwoFactor({ headers: await headers(), code });
    return { ok: true };
  } catch (err) {
    const e = err as Coded & { message?: string };
    if (e.code === 'TWO_FACTOR_LOCKED' && e.lockedUntil)
      return { ok: false, reason: 'locked', lockedUntil: e.lockedUntil };
    if (e.code === 'FORBIDDEN')
      return { ok: false, reason: e.message?.includes('owner') ? 'owner' : 'wrong' };
    return { ok: false, reason: 'error' };
  }
}

export type Device = {
  id: string;
  userAgent: string | null;
  lastActiveAt: string;
  current: boolean;
};

/** „Dispozitive conectate”: sesiunile active ale contului, cea curentă prima. */
export async function listDevices(): Promise<Device[]> {
  const session = await getSession(await headers());
  if (!session) return [];
  const sessions = await listSessions(session.userId);
  return sessions
    .map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      lastActiveAt: (s.lastActiveAt ?? s.expiresAt).toISOString(),
      current: s.id === session.id,
    }))
    .sort((a, b) => Number(b.current) - Number(a.current));
}

/** „Deconectează”: doar o sesiune a aceluiași cont, niciodată cea de pe acest dispozitiv. */
export async function signOutDevice(sessionId: string): Promise<boolean> {
  const session = await getSession(await headers());
  if (!session || sessionId === session.id) return false;
  const own = await listSessions(session.userId);
  if (!own.some((s) => s.id === sessionId)) return false;
  await revokeSession(sessionId);
  return true;
}
