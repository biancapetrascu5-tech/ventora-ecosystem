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

const billingPayment = {
  paymentId: z.uuid(),
  /** `purchase`: a pack or an application bought from the Hub; `subscription`: an invoice of the subscription. */
  kind: z.enum(['purchase', 'subscription']),
  purchaseId: z.uuid().nullable(),
  /** The Stripe invoice (subscription), for the invoice of Lot 3.6. */
  invoiceId: z.string().min(1).nullable(),
  amountMinor: z.number().int().nonnegative(),
  currency: z.enum(['RON', 'EUR']),
};

/**
 * `billing.payment.succeeded` v1 (Lot 3.5): a payment with the card went through (a purchase, or
 * a renewal of the subscription in Stripe Billing). The invoice (SmartBill, Lot 3.6) consumes
 * it; until then it has no consumer and is marked delivered. Only ids and the amount.
 */
export const BillingPaymentSucceededV1 = defineEvent({
  type: 'billing.payment.succeeded',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z.object(billingPayment).strict(),
});

/**
 * `billing.payment.failed` v1 (Lot 3.5): the bank refused a payment — a pack bought from the Hub,
 * or an attempt of the subscription's invoice (`attempt`, and when Stripe tries again). The owner's
 * notification (S115: payment.pack, payment.renewal, payment.retry) is sent by its consumer, so
 * an event without one is a mistake (dead letter).
 */
export const BillingPaymentFailedV1 = defineEvent({
  type: 'billing.payment.failed',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'dead_letter',
  schema: z
    .object({
      ...billingPayment,
      attempt: z.number().int().positive(),
      nextAttemptAt: z.iso.datetime().nullable(),
    })
    .strict(),
});

/**
 * `billing.dispute.opened` v1 (Lot 3.5): a customer disputed a charge with the bank (chargeback).
 * The decision stays manual, at Founder; the webhook also reports it to Sentry. Who in the team is
 * told, and how, is still open (see the Lot 3.5 report).
 */
export const BillingDisputeOpenedV1 = defineEvent({
  type: 'billing.dispute.opened',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({
      disputeId: z.string().min(1),
      amountMinor: z.number().int().nonnegative(),
      currency: z.enum(['RON', 'EUR']),
      reason: z.string().min(1),
    })
    .strict(),
});

/** Ce au în comun evenimentele de fișier (Lot 4.7): id-uri, proprietarul, tipul și mărimea. */
const filePayload = z
  .object({
    fileId: z.uuid(),
    ownerModule: z.string().min(1),
    ownerResourceType: z.string().min(1),
    ownerResourceId: z.string().min(1),
    contentType: z.enum(['image/png', 'image/jpeg', 'application/pdf']),
    sizeBytes: z.number().int().positive(),
  })
  .strict();

/**
 * `file.uploaded` v1 (Lot 4.7): un fișier a fost încărcat și verificat pe server (tipul și mărimea
 * reale). Pentru contorizarea spațiului (cota din F3, prin consumatorul ei) și pentru modulul
 * proprietar. Payload-ul nu are numele fișierului (poate conține date personale).
 */
export const FileUploadedV1 = defineEvent({
  type: 'file.uploaded',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: filePayload,
});

/** `file.deleted` v1 (Lot 4.7): un fișier a fost șters; spațiul lui se eliberează. */
export const FileDeletedV1 = defineEvent({
  type: 'file.deleted',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: filePayload,
});

export const EVENT_CATALOG: readonly EventDefinition[] = [
  InvitationNewLinkRequestedV1 as EventDefinition,
  SubscriptionVersionChangeScheduledV1 as EventDefinition,
  QuotaThresholdV1 as EventDefinition,
  QuotaOverLimitV1 as EventDefinition,
  CommercialRequestDecidedV1 as EventDefinition,
  BillingPaymentSucceededV1 as EventDefinition,
  BillingPaymentFailedV1 as EventDefinition,
  BillingDisputeOpenedV1 as EventDefinition,
  FileUploadedV1 as EventDefinition,
  FileDeletedV1 as EventDefinition,
];

/** Definiția unui eveniment după tip și versiune; null dacă nu e în catalog. */
export function findEventDefinition(
  type: string,
  version: number,
  catalog: readonly EventDefinition[] = EVENT_CATALOG,
): EventDefinition | null {
  return catalog.find((d) => d.type === type && d.version === version) ?? null;
}
