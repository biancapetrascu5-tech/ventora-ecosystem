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

/**
 * `commercial.owner.notified` v1 (Lot 3.7): someone in the business who cannot buy (an admin or a
 * member, D3-8) pressed „Recomandă” on an application or „Anunță proprietarul” on a pack or a
 * limit. The owner gets a notification in the Hub (its consumer, core/organizations), so an event
 * without one is a mistake (dead letter). `day` makes the same person asking for the same thing
 * twice in a day one notification.
 */
export const CommercialOwnerNotifiedV1 = defineEvent({
  type: 'commercial.owner.notified',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'dead_letter',
  schema: z
    .object({
      userId: z.uuid(),
      targetType: z.enum(['application', 'addon', 'quota']),
      targetId: z.string().min(1).max(128),
      day: z.iso.date(),
    })
    .strict(),
});

/**
 * `support.reply.posted` v1 (Lot 4.6, D4-14 b): the Ventora team answered a support request from
 * Founder · Suport. The person who opened it gets „Răspuns nou la solicitarea ta” in the Hub and
 * e-mail E-7 (its consumer, core/support), so an event without one is a mistake (dead letter).
 * Only ids: the texts come from the request, read by the consumer in the organization's context.
 */
export const SupportReplyPostedV1 = defineEvent({
  type: 'support.reply.posted',
  version: 1,
  sourceApp: 'founder',
  growthSafe: false,
  withoutConsumer: 'dead_letter',
  schema: z
    .object({
      requestId: z.uuid(),
      messageId: z.uuid(),
    })
    .strict(),
});

/**
 * `support.request.auto_close_warning` v1 (Lot 4.6, S116-D18): a request waiting for the business
 * for 6 days closes tomorrow. The person who opened it gets the notice in the Hub and by e-mail
 * (its consumer, core/support). `closesAt` is the moment of the automatic closing.
 */
export const SupportAutoCloseWarningV1 = defineEvent({
  type: 'support.request.auto_close_warning',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'dead_letter',
  schema: z
    .object({
      requestId: z.uuid(),
      closesAt: z.iso.datetime({ offset: true }),
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

/**
 * `billing.invoice.issued` v1 (Lot 3.6): the invoice of a payment (or its storno) was issued by the
 * invoice provider (SmartBill). Its consumer sends „Ți-am trimis factura” (S115 invoice.card /
 * invoice.pack) through core/notifications; until it is registered, the event is marked
 * delivered. Only ids, the kind and the amount.
 */
export const BillingInvoiceIssuedV1 = defineEvent({
  type: 'billing.invoice.issued',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({
      invoiceId: z.uuid(),
      kind: z.enum(['invoice', 'storno']),
      paymentId: z.uuid().nullable(),
      amountMinor: z.number().int().nonnegative(),
      currency: z.enum(['RON', 'EUR']),
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

/**
 * Lot 3.8 — `commercial.trial.ending` v1 (D3-5): a trial ends in 3 days; the owner is reminded
 * once (the job sets `reminder_sent_at` in the same transaction). Delivery: the F4 consumer.
 */
export const CommercialTrialEndingV1 = defineEvent({
  type: 'commercial.trial.ending',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({
      trialId: z.uuid(),
      kind: z.enum(['application', 'feature']),
      applicationId: z.string().min(1).nullable(),
      endsAt: z.iso.datetime({ offset: true }),
    })
    .strict(),
});

/**
 * Lot 3.8 — `commercial.dunning.changed` v1 (D3-12): a non-payment case opened, went read-only
 * after the grace, or was resolved. The owner is told (Hub notice, F4 e-mail).
 */
export const CommercialDunningChangedV1 = defineEvent({
  type: 'commercial.dunning.changed',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({
      dunningId: z.uuid(),
      cause: z.enum(['card', 'transfer', 'trial']),
      state: z.enum(['opened', 'read_only', 'resolved']),
    })
    .strict(),
});

/**
 * Lot 3.8 — `commercial.setup_request.changed` v1 (S121): a request with implementation moved
 * on; the owner sees it in the Hub and by e-mail (the offer, the start date, live, cancelled with
 * the reason, refunded).
 */
export const CommercialSetupRequestChangedV1 = defineEvent({
  type: 'commercial.setup_request.changed',
  version: 1,
  sourceApp: 'founder',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({
      setupRequestId: z.uuid(),
      applicationId: z.string().min(1),
      status: z.enum([
        'requested',
        'accepted',
        'confirmed',
        'paid',
        'in_progress',
        'live',
        'cancelled',
        'refunded',
      ]),
      offerSent: z.boolean(),
    })
    .strict(),
});

/**
 * Lot 3.8 — `billing.profile.changed` v1 (D-3.6-1): the Ventora team saved the business's billing
 * data; the owner gets an e-mail with the new data (read from the profile, not from the event).
 */
export const BillingProfileChangedV1 = defineEvent({
  type: 'billing.profile.changed',
  version: 1,
  sourceApp: 'founder',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z.object({ changedByFounderId: z.uuid(), created: z.boolean() }).strict(),
});

/**
 * Lot 3.8 — `billing.transfer.received` v1 (D3-11): the team confirmed a transfer for an issued
 * invoice. Its consumer records the receipt in SmartBill (N16).
 */
export const BillingTransferReceivedV1 = defineEvent({
  type: 'billing.transfer.received',
  version: 1,
  sourceApp: 'founder',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({
      invoiceId: z.uuid(),
      paymentId: z.uuid(),
      amountMinor: z.number().int().nonnegative(),
      currency: z.enum(['RON', 'EUR']),
      receivedOn: z.iso.date(),
    })
    .strict(),
});

/**
 * `booking.service.archived` v1 (Lot B.1, ARCHITECTURE §6.4 c): a service of the catalog was
 * archived; it is no longer offered for new appointments, the old ones keep it. The owner module
 * publishes the archiving; no consumer yet (integrations later), so it is marked delivered.
 */
export const BookingServiceArchivedV1 = defineEvent({
  type: 'booking.service.archived',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({
      serviceId: z.uuid(),
      name: z.string().min(1).max(120),
      archivedAt: z.iso.datetime({ offset: true }),
    })
    .strict(),
});

/*
 * Lot B.4b (BOOKING.md B.4; plan reports/2026-11-09_2150_plan-booking-b4.md §6): the appointments.
 * Only ids, states and instants: no client data (name, phone, e-mail) and no team note. The first
 * consumer is the quota refund of the booking module (booking.appointment.cancelled); the others
 * come with B.7 (the note), B.13 (e-mails), B.17 (SMS). Without a consumer they are delivered.
 */
const appointmentStatus = z.enum([
  'awaiting_payment',
  'unconfirmed',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
]);

/** `booking.appointment.created` v1: a new appointment (Hub or, from B.11, the public page). */
export const BookingAppointmentCreatedV1 = defineEvent({
  type: 'booking.appointment.created',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({
      appointmentId: z.uuid(),
      number: z.number().int().positive(),
      staffMemberId: z.uuid(),
      serviceId: z.uuid(),
      clientId: z.uuid(),
      startsAt: z.iso.datetime({ offset: true }),
      endsAt: z.iso.datetime({ offset: true }),
      status: appointmentStatus,
      source: z.enum(['hub', 'public']),
    })
    .strict(),
});

/** `booking.appointment.changed` v1: moved (time, member or duration). */
export const BookingAppointmentChangedV1 = defineEvent({
  type: 'booking.appointment.changed',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({
      appointmentId: z.uuid(),
      staffMemberId: z.uuid(),
      startsAt: z.iso.datetime({ offset: true }),
      endsAt: z.iso.datetime({ offset: true }),
      previousStaffMemberId: z.uuid(),
      previousStartsAt: z.iso.datetime({ offset: true }),
    })
    .strict(),
});

/**
 * `booking.appointment.cancelled` v1: who cancelled and how late (D-B-11). `quotaRefund`: the
 * cancellation came before the start, so the unit of booking.appointments goes back (refundable).
 */
export const BookingAppointmentCancelledV1 = defineEvent({
  type: 'booking.appointment.cancelled',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({
      appointmentId: z.uuid(),
      staffMemberId: z.uuid(),
      clientId: z.uuid(),
      startsAt: z.iso.datetime({ offset: true }),
      cancelledAt: z.iso.datetime({ offset: true }),
      by: z.enum(['client', 'business']),
      late: z.boolean(),
      minutesBefore: z.number().int(),
      quotaRefund: z.boolean(),
    })
    .strict(),
});

/** `booking.appointment.no_show` v1: „Nu a venit”; `corrected` when it came from a correction. */
export const BookingAppointmentNoShowV1 = defineEvent({
  type: 'booking.appointment.no_show',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({
      appointmentId: z.uuid(),
      staffMemberId: z.uuid(),
      clientId: z.uuid(),
      startsAt: z.iso.datetime({ offset: true }),
      corrected: z.boolean(),
    })
    .strict(),
});

/** `booking.appointment.completed` v1: „Încheiată”; `corrected` when it came from a correction. */
export const BookingAppointmentCompletedV1 = defineEvent({
  type: 'booking.appointment.completed',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({
      appointmentId: z.uuid(),
      staffMemberId: z.uuid(),
      clientId: z.uuid(),
      startsAt: z.iso.datetime({ offset: true }),
      corrected: z.boolean(),
    })
    .strict(),
});

export const EVENT_CATALOG: readonly EventDefinition[] = [
  InvitationNewLinkRequestedV1 as EventDefinition,
  SubscriptionVersionChangeScheduledV1 as EventDefinition,
  QuotaThresholdV1 as EventDefinition,
  QuotaOverLimitV1 as EventDefinition,
  CommercialRequestDecidedV1 as EventDefinition,
  CommercialOwnerNotifiedV1 as EventDefinition,
  BillingPaymentSucceededV1 as EventDefinition,
  BillingPaymentFailedV1 as EventDefinition,
  BillingDisputeOpenedV1 as EventDefinition,
  BillingInvoiceIssuedV1 as EventDefinition,
  CommercialTrialEndingV1 as EventDefinition,
  CommercialDunningChangedV1 as EventDefinition,
  CommercialSetupRequestChangedV1 as EventDefinition,
  BillingProfileChangedV1 as EventDefinition,
  BillingTransferReceivedV1 as EventDefinition,
  FileUploadedV1 as EventDefinition,
  FileDeletedV1 as EventDefinition,
  SupportReplyPostedV1 as EventDefinition,
  SupportAutoCloseWarningV1 as EventDefinition,
  BookingServiceArchivedV1 as EventDefinition,
  BookingAppointmentCreatedV1 as EventDefinition,
  BookingAppointmentChangedV1 as EventDefinition,
  BookingAppointmentCancelledV1 as EventDefinition,
  BookingAppointmentNoShowV1 as EventDefinition,
  BookingAppointmentCompletedV1 as EventDefinition,
];

/** Definiția unui eveniment după tip și versiune; null dacă nu e în catalog. */
export function findEventDefinition(
  type: string,
  version: number,
  catalog: readonly EventDefinition[] = EVENT_CATALOG,
): EventDefinition | null {
  return catalog.find((d) => d.type === type && d.version === version) ?? null;
}
