'use server';

import './access-config';
import { headers } from 'next/headers';
import { authorize, PLATFORM_APPLICATION_ID } from '@ventora/access';
import { recordInteraction } from '@ventora/growth';
import { getSession } from '@ventora/identity';
import { readGrowthSlot, type GrowthSlotView } from './growth-slot';
import { reportActionError } from './report-error';

/*
 * Lotul 5.9a — ce face persoana cu o recomandare (GROWTH §2.5, §2.7): „Nu mă interesează”,
 * „Amintește-mi mai târziu”, „Anulează” din Toast, click pe acțiune, „Recomandă aplicația”.
 * Afacerea și persoana vin din authorize(); afișarea trebuie să fie a ei, în afacerea ei (RLS și
 * garda din baza de date). Niciuna nu cumpără nimic: acțiunea deschide doar opțiunile (5.9c),
 * iar plata are confirmarea ei separată.
 */

export type GrowthInteractionInput = {
  contentId: string;
  kind: 'click' | 'dismiss' | 'snooze' | 'recommend' | 'undo';
  /** Generată în client, una pe gest: un dublu click sau o reîncercare se înregistrează o dată. */
  key: string;
  snooze?: 'week' | 'month';
};

export async function growthInteraction(input: GrowthInteractionInput): Promise<{ ok: boolean }> {
  const session = await getSession(await headers());
  if (!session) return { ok: false };
  try {
    const ctx = await authorize({
      sessionToken: session.token,
      applicationId: PLATFORM_APPLICATION_ID,
    });
    await recordInteraction({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      contentId: input.contentId,
      kind: input.kind,
      idempotencyKey: input.key,
      ...(input.kind === 'snooze' ? { snooze: input.snooze ?? 'week' } : {}),
    });
    return { ok: true };
  } catch (err) {
    reportActionError('growthInteraction', err);
    return { ok: false };
  }
}

/**
 * Lotul 5.9b — recomandarea Ventora din clopoțel (`hub.notifications.recommendations`), citită la
 * deschiderea panoului: afișarea se înregistrează doar când persoana o poate vedea. Clopoțelul
 * continuă să numere doar operaționalele (D4-5). null: gol, Growth oprit sau în eroare.
 */
export async function readBellRecommendation(): Promise<GrowthSlotView | null> {
  const session = await getSession(await headers());
  if (!session) return null;
  try {
    const ctx = await authorize({
      sessionToken: session.token,
      applicationId: PLATFORM_APPLICATION_ID,
    });
    return await readGrowthSlot(ctx, 'hub.notifications.recommendations');
  } catch (err) {
    reportActionError('readBellRecommendation', err);
    return null;
  }
}
