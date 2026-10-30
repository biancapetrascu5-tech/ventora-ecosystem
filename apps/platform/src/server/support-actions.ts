'use server';

import './access-config';
import { headers } from 'next/headers';
import {
  closeSupportSessionAsOwner,
  getSupportSessionBanner,
  listActiveSupportSessions,
  listSupportSessions,
  type SupportSessionHistoryItem,
} from '@ventora/access';
import { getSession } from '@ventora/identity';

/* Sesiunea de suport în Hub (Lotul 2.5c). Tokenul vine din sesiunea din cookie; core/access
   decide ce vede fiecare (R-SS1): proprietarul și adminul — motivul, cererea, închiderea;
   ceilalți membri — doar cine și până când. */

async function token(): Promise<string | null> {
  return (await getSession(await headers()))?.token ?? null;
}

export type BannerData = {
  id: string;
  founderName: string;
  expiresAt: string;
  reason?: string;
  ticketRef?: string;
};

export async function readSupportBanner(): Promise<{
  manager: boolean;
  sessions: BannerData[];
} | null> {
  const sessionToken = await token();
  if (!sessionToken) return null;
  try {
    const open = await listActiveSupportSessions({ sessionToken });
    return {
      manager: true,
      sessions: open.map((s) => ({
        id: s.id,
        founderName: s.founderName,
        expiresAt: s.expiresAt.toISOString(),
        reason: s.reason,
        ticketRef: s.ticketRef,
      })),
    };
  } catch {
    // Nu e proprietar / admin (sau proprietar fără 2FA): doar bannerul pentru membri.
  }
  try {
    const open = await getSupportSessionBanner({ sessionToken });
    return {
      manager: false,
      sessions: open.map((s) => ({
        id: s.id,
        founderName: s.founderName,
        expiresAt: s.expiresAt.toISOString(),
      })),
    };
  } catch {
    return null;
  }
}

export async function closeSupportSession(supportSessionId: string): Promise<boolean> {
  const sessionToken = await token();
  if (!sessionToken) return false;
  try {
    await closeSupportSessionAsOwner({ sessionToken, supportSessionId });
    return true;
  } catch {
    return false;
  }
}

export type SessionsPage = {
  items: (Omit<SupportSessionHistoryItem, 'openedAt' | 'expiresAt' | 'closedAt'> & {
    openedAt: string;
    expiresAt: string;
  })[];
  page: number;
  pageSize: number;
  total: number;
};

export async function readSupportSessions(page = 1): Promise<SessionsPage | null> {
  const sessionToken = await token();
  if (!sessionToken) return null;
  try {
    const res = await listSupportSessions({ sessionToken, page, pageSize: 20 });
    return {
      ...res,
      items: res.items.map((i) => ({
        id: i.id,
        founderName: i.founderName,
        reason: i.reason,
        ticketRef: i.ticketRef,
        status: i.status,
        closedBy: i.closedBy,
        openedAt: i.openedAt.toISOString(),
        expiresAt: i.expiresAt.toISOString(),
      })),
    };
  } catch {
    return null;
  }
}
