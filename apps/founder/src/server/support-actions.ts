'use server';

import './access-config';
import { headers } from 'next/headers';
import {
  closeSupportSession,
  getBusinessForFounder,
  openSupportSession,
  recoverOwnerAccess,
  SupportSessionConflict,
  type RecoveryVerification,
} from '@ventora/access';

/* Acțiunile Founder pentru sesiunea de suport și recuperarea proprietarului (Lotul 2.5c).
   Sesiunea Founder vine din cookie (requireFounderSession în core/access); erorile tipizate
   devin stările din design. Ecranele le primesc doar ca rezultat, fără excepții brute. */

type Coded = { code?: string; lockedUntil?: string };

export type BusinessResult =
  | {
      ok: true;
      organizationName: string;
      owners: { userId: string; name: string; email: string }[];
    }
  | { ok: false };

/** Lot 2.6 · G: numele afacerii și proprietarii activi (recuperarea, bannerul). */
export async function readBusiness(organizationId: string): Promise<BusinessResult> {
  try {
    const business = await getBusinessForFounder({
      founderHeaders: await headers(),
      organizationId,
    });
    return { ok: true, ...business };
  } catch {
    return { ok: false };
  }
}

export type OpenResult =
  | { ok: true; id: string; expiresAt: string }
  | {
      ok: false;
      reason: 'exists';
      /** Cine are sesiunea deschisă și până când (ISO); null dacă s-a închis între timp. */
      existing: { founderName: string; expiresAt: string } | null;
    }
  | { ok: false; reason: 'invalid' | 'error' };

export async function openSupport(input: {
  organizationId: string;
  reason: string;
  ticketRef: string;
  durationMinutes: number;
}): Promise<OpenResult> {
  try {
    const s = await openSupportSession({ founderHeaders: await headers(), ...input });
    return { ok: true, id: s.id, expiresAt: s.expiresAt.toISOString() };
  } catch (err) {
    if (err instanceof SupportSessionConflict)
      return { ok: false, reason: 'exists', existing: err.existing };
    const code = (err as Coded).code;
    if (code === 'CONFLICT') return { ok: false, reason: 'exists', existing: null };
    if (code === 'INVALID_INPUT') return { ok: false, reason: 'invalid' };
    return { ok: false, reason: 'error' };
  }
}

export async function closeSupport(supportSessionId: string): Promise<boolean> {
  try {
    await closeSupportSession({ founderHeaders: await headers(), supportSessionId });
    return true;
  } catch {
    return false;
  }
}

export type RecoverResult =
  | { ok: true; passwordReset: boolean }
  | { ok: false; reason: 'refused' | 'wrongCode' | 'invalid' | 'error' }
  | { ok: false; reason: 'locked'; lockedUntil: string };

export async function recoverOwner(input: {
  organizationId: string;
  userId: string;
  ticketRef: string;
  reason: string;
  verifications: RecoveryVerification[];
  emailCompromised: boolean;
  identityVerified: boolean;
  founderTotpCode: string;
  resetPassword: boolean;
}): Promise<RecoverResult> {
  try {
    const r = await recoverOwnerAccess({ founderHeaders: await headers(), ...input });
    return { ok: true, passwordReset: r.passwordReset };
  } catch (err) {
    const e = err as Coded;
    if (e.code === 'RECOVERY_VERIFICATIONS_INVALID') return { ok: false, reason: 'refused' };
    if (e.code === 'TWO_FACTOR_LOCKED' && e.lockedUntil)
      return { ok: false, reason: 'locked', lockedUntil: e.lockedUntil };
    if (e.code === 'FORBIDDEN') return { ok: false, reason: 'wrongCode' };
    if (e.code === 'INVALID_INPUT') return { ok: false, reason: 'invalid' };
    return { ok: false, reason: 'error' };
  }
}
