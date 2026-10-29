'use server';

import { headers } from 'next/headers';
import { countBackupCodes, regenerateBackupCodes } from '@ventora/identity';

/* Codurile de rezervă (D1–D3): câte au rămas și regenerarea confirmată cu codul din aplicație.
   Utilizatorul vine din sesiune; codurile noi se întorc o singură dată și nu se păstrează aici. */

type Coded = { code?: string; lockedUntil?: string };

export async function readBackupCodesLeft(): Promise<number | null> {
  try {
    return await countBackupCodes('hub', await headers());
  } catch {
    return null;
  }
}

export type RegenerateResult =
  | { ok: true; codes: string[] }
  | { ok: false; reason: 'wrong' | 'error' }
  | { ok: false; reason: 'locked'; lockedUntil: string };

export async function regenerateCodes(code: string): Promise<RegenerateResult> {
  try {
    return { ok: true, codes: await regenerateBackupCodes('hub', await headers(), code) };
  } catch (err) {
    const e = err as Coded;
    if (e.code === 'TWO_FACTOR_LOCKED' && e.lockedUntil)
      return { ok: false, reason: 'locked', lockedUntil: e.lockedUntil };
    if (e.code === 'FORBIDDEN') return { ok: false, reason: 'wrong' };
    return { ok: false, reason: 'error' };
  }
}
