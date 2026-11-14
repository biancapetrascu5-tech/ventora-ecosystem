'use server';

import './access-config';
import { headers } from 'next/headers';
import {
  authorize,
  getTeamOwnerName,
  listTeamMembers,
  PLATFORM_APPLICATION_ID,
} from '@ventora/access';
import {
  listMyTeamRecommendations,
  listPendingTeamRecommendations,
  rejectTeamRecommendation,
  type TeamRecommendationStatus,
} from '@ventora/commercial';
import { getSession } from '@ventora/identity';
import type { AppName } from '@ventora/ui';
import { reportActionError } from './report-error';

/*
 * Lotul 5.9e — HubMyRecommendations („Recomandările mele”) și „Recomandare de la echipă” din
 * clopoțel (HubRecommendation, S136). Afacerea și persoana vin din sesiune prin authorize(),
 * niciodată din client; core/commercial refuză pe server ce nu e al persoanei (lista ei) sau ce
 * nu e owner / admin (clopoțelul și „Respinge”).
 */

export interface MyRecommendation {
  id: string;
  app: AppName;
  name: string;
  status: TeamRecommendationStatus;
  recommendedAt: string;
  decidedAt: string | null;
  /** Răspunsul owner-ului (opțional; câmpul în care îl scrie nu e desenat încă). */
  answer: string | null;
}

export interface MyRecommendationsData {
  /** Numele owner-ului: „Recomandată lui {owner}”, „Răspunsul lui {owner}”. */
  owner: string;
  items: MyRecommendation[];
}

/** null: fără sesiune, fără afacere activă sau afacere suspendată. */
export async function readMyRecommendations(): Promise<MyRecommendationsData | null> {
  const session = await getSession(await headers());
  if (!session) return null;
  try {
    const ctx = await authorize({
      sessionToken: session.token,
      applicationId: PLATFORM_APPLICATION_ID,
    });
    const [rows, owner] = await Promise.all([
      listMyTeamRecommendations(ctx),
      ctx.role === 'owner'
        ? Promise.resolve(null)
        : getTeamOwnerName({ sessionToken: session.token }),
    ]);
    return {
      owner: owner ?? '',
      items: rows.map((r) => ({
        id: r.id,
        app: r.applicationId as AppName,
        name: r.applicationName,
        status: r.status,
        recommendedAt: r.recommendedAt.toISOString(),
        decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
        answer: r.answer,
      })),
    };
  } catch (err) {
    reportActionError('readMyRecommendations', err);
    return null;
  }
}

export interface TeamRecommendationView {
  id: string;
  app: AppName;
  name: string;
  /** Cine a recomandat (numele din echipă). */
  by: string;
  /** Nota opțională a colegului. */
  note: string | null;
}

/** Clopoțelul owner-ului și al adminilor: recomandările în așteptare; altfel nimic. */
export async function readTeamRecommendations(): Promise<TeamRecommendationView[]> {
  const session = await getSession(await headers());
  if (!session) return [];
  try {
    const ctx = await authorize({
      sessionToken: session.token,
      applicationId: PLATFORM_APPLICATION_ID,
    });
    if (ctx.role !== 'owner' && ctx.role !== 'admin') return [];
    const rows = await listPendingTeamRecommendations(ctx);
    if (rows.length === 0) return [];
    const names = new Map(
      (await listTeamMembers({ sessionToken: session.token })).map((m) => [m.userId, m.name]),
    );
    return rows.map((r) => ({
      id: r.id,
      app: r.applicationId as AppName,
      name: r.applicationName,
      by: names.get(r.recommendedByUserId) ?? '',
      note: r.note,
    }));
  } catch (err) {
    reportActionError('readTeamRecommendations', err);
    return [];
  }
}

/** „Respinge” din clopoțel: „Nu acum” (fără notificare pentru membru); S147: motivul opțional. */
export async function rejectRecommendation(id: string, reason?: string): Promise<{ ok: boolean }> {
  const session = await getSession(await headers());
  if (!session) return { ok: false };
  try {
    const ctx = await authorize({
      sessionToken: session.token,
      applicationId: PLATFORM_APPLICATION_ID,
    });
    await rejectTeamRecommendation(ctx, id, reason ?? null);
    return { ok: true };
  } catch (err) {
    reportActionError('rejectRecommendation', err);
    return { ok: false };
  }
}
