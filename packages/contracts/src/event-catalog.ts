import { z } from 'zod';

/*
 * Catalogul evenimentelor (ARCHITECTURE §11.2, Lot 4.1). Fiecare eveniment are un tip, o
 * versiune, schema Zod a payload-ului, `growthSafe` (dacă poate fi semnal pentru Growth, F5) și
 * ce se întâmplă când nu are niciun consumator înregistrat. Outbox-ul (`@ventora/db-kit`)
 * validează payload-ul cu `parse` înainte de scriere.
 *
 * Evoluția: un câmp opțional nou păstrează versiunea; o schimbare incompatibilă înseamnă o
 * versiune nouă, publicată în paralel cât timp există consumatori ai celei vechi.
 */

/**
 * Fără consumator înregistrat:
 * - `complete`: evenimentul se marchează livrat (nu așteaptă un consumator care poate nu vine);
 * - `dead_letter`: evenimentul ajunge în dead-letter, vizibil în Founder (lipsa e o greșeală).
 */
export type WithoutConsumer = 'complete' | 'dead_letter';

export interface EventDefinition<TPayload = unknown> {
  /** `<entitate>.<acțiune>`, ex. `invitation.new_link_requested`; versiunea e separat. */
  type: string;
  version: number;
  /** Aplicația care îl emite (plicul: `sourceApp`). */
  sourceApp: string;
  /** Payload-ul fără date sensibile, deci poate fi semnal Growth (GROWTH_ENGINE §2.3). */
  growthSafe: boolean;
  withoutConsumer: WithoutConsumer;
  schema: z.ZodType<TPayload>;
  /** Validează payload-ul; aruncă la nepotrivire. */
  parse(payload: unknown): TPayload;
}

export function defineEvent<TPayload>(
  def: Omit<EventDefinition<TPayload>, 'parse'>,
): EventDefinition<TPayload> {
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(def.type)) {
    throw new Error(`[contracts] Tip de eveniment invalid: "${def.type}"`);
  }
  if (!Number.isInteger(def.version) || def.version < 1) {
    throw new Error(`[contracts] Versiune invalidă pentru ${def.type}: ${def.version}`);
  }
  return { ...def, parse: (payload) => def.schema.parse(payload) };
}

/**
 * `invitation.new_link_requested` v1 (Lot 2.6 · E, Lot 2.7 · C): cel invitat a cerut o invitație
 * nouă dintr-o invitație expirată. Consumatorul (F4, Lotul 4.3) trimite owner-ului și adminilor
 * notificarea operațională (ARCHITECTURE §15.1). Până atunci nu are consumator: se marchează
 * livrat. Payload-ul are doar id-uri (fără adresa invitată).
 */
export const InvitationNewLinkRequestedV1 = defineEvent({
  type: 'invitation.new_link_requested',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({
      invitationId: z.uuid(),
      invitedByUserId: z.uuid(),
    })
    .strict(),
});

/**
 * `subscription.version_change_scheduled` v1 (Lot 3.2, ARCHITECTURE §8.5, D-COM-9): Founder a
 * programat mutarea unui abonament pe altă versiune. Anunțul către owner (cu cel puțin 30 de zile
 * înainte, la dezavantaj) îl trimite consumatorul din F4, prin core/notifications; până atunci nu
 * are consumator și se marchează livrat. Payload-ul are doar id-uri și termenul.
 */
export const SubscriptionVersionChangeScheduledV1 = defineEvent({
  type: 'subscription.version_change_scheduled',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({
      subscriptionChangeId: z.uuid(),
      subscriptionId: z.uuid(),
      fromVersionId: z.uuid(),
      toVersionId: z.uuid(),
      classification: z.enum(['advantage', 'disadvantage']),
      effectiveAt: z.iso.datetime(),
    })
    .strict(),
});

/**
 * `commercial.quota.threshold` v1 (Lot 3.3, FAZA-3): consumul unei cote a atins 80% sau 100% din
 * limită în perioada curentă — o dată pe cheie, prag și perioadă. Pentru notificarea owner-ului
 * (F4) și ca semnal Growth (F5): payload-ul are doar cheia, cifrele și perioada.
 */
export const QuotaThresholdV1 = defineEvent({
  type: 'commercial.quota.threshold',
  version: 1,
  sourceApp: 'platform',
  growthSafe: true,
  withoutConsumer: 'complete',
  schema: z
    .object({
      quotaKey: z.string().min(1),
      threshold: z.union([z.literal(80), z.literal(100)]),
      used: z.number().int().nonnegative(),
      limit: z.number().int().nonnegative(),
      periodStart: z.iso.date().nullable(),
    })
    .strict(),
});

/**
 * `commercial.quota.over_limit` v1 (Lot 3.3, D3-6 a): ce era deja programat (remindere, campanii)
 * a plecat și s-a contorizat peste limită. Mesajul către owner îl trimite consumatorul din F4; o
 * dată pe cheie și perioadă.
 */
export const QuotaOverLimitV1 = defineEvent({
  type: 'commercial.quota.over_limit',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({
      quotaKey: z.string().min(1),
      used: z.number().int().nonnegative(),
      limit: z.number().int().nonnegative(),
      periodStart: z.iso.date().nullable(),
    })
    .strict(),
});

/**
 * `commercial.request.decided` v1 (Lot 3.4, FounderRequests, S111): echipa Ventora a rezolvat sau a
 * refuzat o cerere din Hub („Cere activare”, „Cere alt abonament”). Notificarea către cel care a
 * cerut („rezolvată” / „refuzată”, cu motivul) o trimite consumatorul din F4, prin
 * core/notifications; până atunci nu are consumator și se marchează livrat. Payload-ul are doar
 * id-uri și starea: motivul se citește din cerere.
 */
export const CommercialRequestDecidedV1 = defineEvent({
  type: 'commercial.request.decided',
  version: 1,
  sourceApp: 'founder',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({
      requestId: z.uuid(),
      requestedByUserId: z.uuid(),
      status: z.enum(['resolved', 'refused']),
    })
    .strict(),
});

export const EVENT_CATALOG: readonly EventDefinition[] = [
  InvitationNewLinkRequestedV1 as EventDefinition,
  SubscriptionVersionChangeScheduledV1 as EventDefinition,
  QuotaThresholdV1 as EventDefinition,
  QuotaOverLimitV1 as EventDefinition,
  CommercialRequestDecidedV1 as EventDefinition,
];

/** Definiția unui eveniment după tip și versiune; null dacă nu e în catalog. */
export function findEventDefinition(
  type: string,
  version: number,
  catalog: readonly EventDefinition[] = EVENT_CATALOG,
): EventDefinition | null {
  return catalog.find((d) => d.type === type && d.version === version) ?? null;
}
