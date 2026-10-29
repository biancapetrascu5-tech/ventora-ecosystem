'use server';

import { headers } from 'next/headers';
import { countBackupCodes, getFounderSession, regenerateBackupCodes } from '@ventora/identity';

/* Founder: după intrare, fără 2FA → activarea (obligatorie pentru toți, T1.8); altfel Control
   Center. Codurile de rezervă: câte au rămas și regenerarea cu codul din aplicație (D1–D3). */
export async function founderAfterSignIn(): Promise<string> {
  const session = await getFounderSession(await headers());
  if (!session) return '/sign-in';
  return session.twoFactorEnabled ? '/' : '/setup-2fa';
}

export async function readFounderBackupCodesLeft(): Promise<number | null> {
  try {
    return await countBackupCodes('founder', await headers());
  } catch {
    return null;
  }
}

type Coded = { code?: string; lockedUntil?: string };

export type RegenerateResult =
  | { ok: true; codes: string[] }
  | { ok: false; reason: 'wrong' | 'error' }
  | { ok: false; reason: 'locked'; lockedUntil: string };

export async function regenerateFounderCodes(code: string): Promise<RegenerateResult> {
  try {
    return { ok: true, codes: await regenerateBackupCodes('founder', await headers(), code) };
  } catch (err) {
    const e = err as Coded;
    if (e.code === 'TWO_FACTOR_LOCKED' && e.lockedUntil)
      return { ok: false, reason: 'locked', lockedUntil: e.lockedUntil };
    if (e.code === 'FORBIDDEN') return { ok: false, reason: 'wrong' };
    return { ok: false, reason: 'error' };
  }
}
