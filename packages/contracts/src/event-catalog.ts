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
    // C.4e: text/csv doar pentru importul ClientDesk (crm / import); fără consumatori, rămâne v1
    contentType: z.enum(['image/png', 'image/jpeg', 'application/pdf', 'text/csv']),
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
 * Lot 5.0 (D5-7): also a Growth signal — the payload has only ids, the kind and the end date.
 */
export const CommercialTrialEndingV1 = defineEvent({
  type: 'commercial.trial.ending',
  version: 1,
  sourceApp: 'platform',
  growthSafe: true,
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

/*
 * Lot B.7a — the client of Booking, for ClientDesk (D-CRM-9, CRM.md CR.12; plan
 * reports/2026-11-10_1745_plan-booking-b7.md). Only ids and moments: never the name, the phone, the
 * e-mail, the locale, a note, a block or the behaviour note (S139: it never leaves EasyBook).
 */

/** `booking.client.created` v1: a client of the business, from the team or the public page. */
export const BookingClientCreatedV1 = defineEvent({
  type: 'booking.client.created',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z.object({ clientId: z.uuid(), createdAt: z.iso.datetime({ offset: true }) }).strict(),
});

/** `booking.client.updated` v1: the client's details changed (which ones is not said). */
export const BookingClientUpdatedV1 = defineEvent({
  type: 'booking.client.updated',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z.object({ clientId: z.uuid(), updatedAt: z.iso.datetime({ offset: true }) }).strict(),
});

/** `booking.client.merged` v1: `mergedClientId` is archived, its history shows on `keptClientId`. */
export const BookingClientMergedV1 = defineEvent({
  type: 'booking.client.merged',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({
      keptClientId: z.uuid(),
      mergedClientId: z.uuid(),
      mergedAt: z.iso.datetime({ offset: true }),
    })
    .strict(),
});

/** `booking.client.erased` v1: the GDPR erasure (D-B7-1); the consumers erase their copies too. */
export const BookingClientErasedV1 = defineEvent({
  type: 'booking.client.erased',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z.object({ clientId: z.uuid(), erasedAt: z.iso.datetime({ offset: true }) }).strict(),
});

/**
 * `booking.payment.recorded` v1 (Lot B.21, C-B-2): a payment or a refund recorded on an appointment
 * („Încasează”), for Finance. Ids, the amount, the currency, the method: never the client's name or
 * the note.
 */
export const BookingPaymentRecordedV1 = defineEvent({
  type: 'booking.payment.recorded',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({
      paymentId: z.uuid(),
      appointmentId: z.uuid(),
      clientId: z.uuid(),
      kind: z.enum(['payment', 'refund']),
      amountMinor: z.number().int().positive(),
      currency: z.enum(['RON', 'EUR']),
      method: z.enum(['cash', 'card', 'transfer', 'other']),
      recordedAt: z.iso.datetime({ offset: true }),
    })
    .strict(),
});

/*
 * Lot 5.0 — Growth Engine v1 (FAZA-5.md, D5-7, GROWTH_ENGINE §2.3, §2.7). Semnalele și conversiile
 * sunt `growthSafe`: doar id-uri și chei, fără sume, nume sau conținut. Venitul atribuit se citește
 * din core/billing la raportare, nu vine în eveniment. Emițătorii vin în Lotul 5.7; până atunci,
 * fără consumator, evenimentele se marchează livrate.
 */

/**
 * `commercial.feature.locked_clicked` v1: persoana a apăsat pe o funcționalitate blocată (componenta
 * comună). Semnal cerut de persoană: slotul care urmează e `userInitiated`, deci fără plafoane.
 */
export const CommercialFeatureLockedClickedV1 = defineEvent({
  type: 'commercial.feature.locked_clicked',
  version: 1,
  sourceApp: 'platform',
  growthSafe: true,
  withoutConsumer: 'complete',
  schema: z
    .object({
      userId: z.uuid(),
      applicationId: z.string().min(1).nullable(),
      featureKey: z.string().min(1),
    })
    .strict(),
});

/**
 * `integration.target_missing` v1: o aplicație declară că o integrare ar fi utilă, dar aplicația
 * țintă nu e activă (cross-sell, GROWTH §2.3). Doar declarat în v1 (D5-7): primul emițător real
 * vine cu a doua aplicație.
 */
export const IntegrationTargetMissingV1 = defineEvent({
  type: 'integration.target_missing',
  version: 1,
  sourceApp: 'platform',
  growthSafe: true,
  withoutConsumer: 'complete',
  schema: z
    .object({
      sourceApplicationId: z.string().min(1),
      targetApplicationId: z.string().min(1),
      integrationKey: z.string().min(1),
    })
    .strict(),
});

/** `commercial.addon.purchased` v1 (conversie): afacerea a cumpărat un pachet în plus. */
export const CommercialAddonPurchasedV1 = defineEvent({
  type: 'commercial.addon.purchased',
  version: 1,
  sourceApp: 'platform',
  growthSafe: true,
  withoutConsumer: 'complete',
  schema: z
    .object({
      purchaseId: z.uuid(),
      addonCode: z.string().min(1),
      quantity: z.number().int().positive(),
    })
    .strict(),
});

/** `commercial.application.activated` v1 (conversie): o aplicație a intrat în abonament. */
export const CommercialApplicationActivatedV1 = defineEvent({
  type: 'commercial.application.activated',
  version: 1,
  sourceApp: 'platform',
  growthSafe: true,
  withoutConsumer: 'complete',
  schema: z
    .object({
      applicationId: z.string().min(1),
      via: z.enum(['purchase', 'request', 'trial_conversion']),
    })
    .strict(),
});

/** `commercial.trial.started` v1 (conversie): a pornit o perioadă de probă, confirmată explicit. */
export const CommercialTrialStartedV1 = defineEvent({
  type: 'commercial.trial.started',
  version: 1,
  sourceApp: 'platform',
  growthSafe: true,
  withoutConsumer: 'complete',
  schema: z
    .object({
      trialId: z.uuid(),
      kind: z.enum(['application', 'feature']),
      applicationId: z.string().min(1).nullable(),
      featureKey: z.string().min(1).nullable(),
      endsAt: z.iso.datetime({ offset: true }),
    })
    .strict(),
});

/** `commercial.subscription.changed` v1 (conversie): abonamentul a trecut pe alt plan / bundle. */
export const CommercialSubscriptionChangedV1 = defineEvent({
  type: 'commercial.subscription.changed',
  version: 1,
  sourceApp: 'platform',
  growthSafe: true,
  withoutConsumer: 'complete',
  schema: z
    .object({
      subscriptionId: z.uuid(),
      fromPlanVersionId: z.uuid().nullable(),
      toPlanVersionId: z.uuid().nullable(),
    })
    .strict(),
});

// ── Lot CR.2: ClientDesk — the contacts and the companies (plans/CRM.md) ─────────────────────
// Ids only: no name, phone, e-mail, note or birthday (the payload goes to webhooks in CR.18 and
// may become a Growth signal). Without a consumer yet (CampaignKit, CR.12, CR.18): delivered.

const crmContactSource = z.enum(['easybook', 'form', 'referral', 'event', 'import', 'manual']);

/** `crm.contact.created` v1: a contact added in ClientDesk (ARCHITECTURE §5: CampaignKit consumes it). */
export const CrmContactCreatedV1 = defineEvent({
  type: 'crm.contact.created',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({
      contactId: z.uuid(),
      source: crmContactSource,
      companyId: z.uuid().nullable(),
      ownerUserId: z.uuid().nullable(),
    })
    .strict(),
});

/** `crm.contact.updated` v1: which fields changed (their names, not their values). */
export const CrmContactUpdatedV1 = defineEvent({
  type: 'crm.contact.updated',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({
      contactId: z.uuid(),
      fields: z.array(z.string().min(1).max(40)).min(1).max(30),
    })
    .strict(),
});

/** `crm.contact.deleted` v1: moved to the 30-day bin (S130). */
export const CrmContactDeletedV1 = defineEvent({
  type: 'crm.contact.deleted',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z.object({ contactId: z.uuid() }).strict(),
});

/** `crm.contact.restored` v1: back from the bin. */
export const CrmContactRestoredV1 = defineEvent({
  type: 'crm.contact.restored',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z.object({ contactId: z.uuid() }).strict(),
});

/** `crm.company.created` v1. */
export const CrmCompanyCreatedV1 = defineEvent({
  type: 'crm.company.created',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z.object({ companyId: z.uuid(), ownerUserId: z.uuid().nullable() }).strict(),
});

/** `crm.company.updated` v1: which fields changed. */
export const CrmCompanyUpdatedV1 = defineEvent({
  type: 'crm.company.updated',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({
      companyId: z.uuid(),
      fields: z.array(z.string().min(1).max(40)).min(1).max(30),
    })
    .strict(),
});

/** `crm.company.deleted` v1: moved to the 30-day bin. */
export const CrmCompanyDeletedV1 = defineEvent({
  type: 'crm.company.deleted',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z.object({ companyId: z.uuid() }).strict(),
});

/** `crm.company.restored` v1: back from the bin. */
export const CrmCompanyRestoredV1 = defineEvent({
  type: 'crm.company.restored',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z.object({ companyId: z.uuid() }).strict(),
});

/**
 * `organization.created` v1 (Lot 5.10c, decizia din 11.11.2026): o afacere nouă, cu țara ei
 * (ISO 3166-1 alpha-2, implicit RO). Îl scrie în outbox funcția
 * `organizations.founder_create_organization`, în aceeași tranzacție cu afacerea. Agregatele
 * zilnice Growth îl vor consuma; până atunci nu are consumator și se marchează livrat. Doar id-ul și
 * țara, fără date personale. Nu e semnal Growth (lista D5-7 rămâne neschimbată).
 */
export const OrganizationCreatedV1 = defineEvent({
  type: 'organization.created',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({
      organizationId: z.uuid(),
      country: z.string().regex(/^[A-Z]{2}$/),
    })
    .strict(),
});

/**
 * `user.locale_changed` v1 (Lot 5.10c, decizia din 11.11.2026): o persoană și-a schimbat limba
 * (una din cele 6: ro / en / fr / es / de / it). Îl scrie `setUserLocale` în outbox-ul identity,
 * câte un rând pe fiecare afacere a persoanei (plicul poartă afacerea), doar când limba chiar se
 * schimbă. Agregatele zilnice Growth îl vor consuma; până atunci se marchează livrat. Doar
 * id-ul persoanei și codul limbii. Nu e semnal Growth (lista D5-7 rămâne neschimbată).
 */
export const UserLocaleChangedV1 = defineEvent({
  type: 'user.locale_changed',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({
      userId: z.string().min(1).max(64),
      locale: z.enum(['ro', 'en', 'fr', 'es', 'de', 'it']),
    })
    .strict(),
});

const MembershipRoleSchema = z.enum(['owner', 'admin', 'member', 'external_collaborator']);

/**
 * `organization.member_added` v1 (Lot 5.10c, decizia din 10:41): o persoană a intrat în afacere
 * (invitația acceptată), cu rolul ei. Scris de `acceptInvitation` în aceeași tranzacție cu
 * membership-ul. Agregatele Growth îl vor consuma; până atunci se marchează livrat. Doar id-uri și
 * rolul. Nu e semnal Growth.
 */
export const OrganizationMemberAddedV1 = defineEvent({
  type: 'organization.member_added',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({ membershipId: z.uuid(), userId: z.uuid(), role: MembershipRoleSchema })
    .strict(),
});

/** `organization.member_removed` v1 (5.10c): „Elimină din afacere”, cu rolul pe care îl avea. */
export const OrganizationMemberRemovedV1 = defineEvent({
  type: 'organization.member_removed',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({ membershipId: z.uuid(), userId: z.uuid(), role: MembershipRoleSchema })
    .strict(),
});

/** `organization.member_role_changed` v1 (5.10c): rolul vechi și cel nou (admin ↔ member). */
export const OrganizationMemberRoleChangedV1 = defineEvent({
  type: 'organization.member_role_changed',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({
      membershipId: z.uuid(),
      userId: z.uuid(),
      fromRole: MembershipRoleSchema,
      toRole: MembershipRoleSchema,
    })
    .strict(),
});

/**
 * `commercial.application.stopped` v1 (Lot 5.10c, decizia din 10:41): o aplicație a ieșit din
 * abonament (linia încheiată de echipă, `endApplicationLine`; rămâne în istoric). Scris în
 * aceeași tranzacție cu încheierea liniei. Agregatele Growth îl vor consuma; până atunci se
 * marchează livrat. Doar aplicația, fără date personale sau sume. Nu e semnal Growth.
 */
export const CommercialApplicationStoppedV1 = defineEvent({
  type: 'commercial.application.stopped',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({
      applicationId: z.string().min(1),
      via: z.enum(['founder']),
    })
    .strict(),
});

// ── Lot C.8 (approved 11.11.2026): ClientDesk — the leads (CR.8) and the deals (CR.9) ──────────
// As the contacts: ids, states and amounts only — never a name, phone, e-mail, request or note
// (the payload goes to webhooks in CR.18 and to the automations in CR.13). No consumer yet.

const fieldNames = z.array(z.string().min(1).max(40)).min(1).max(30);
const crmLeadSource = z.enum(['form', 'phone', 'email', 'referral', 'event', 'manual', 'custom']);
const crmLeadState = z.enum(['new', 'contacted', 'qualified']);
const currency = z.string().regex(/^[A-Z]{3}$/);
const amountMinor = z.number().int().nonnegative();

/** `crm.lead.created` v1: a lead arrived (by hand, a form, the import…); `sourceId` for `custom`. */
export const CrmLeadCreatedV1 = defineEvent({
  type: 'crm.lead.created',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({
      leadId: z.uuid(),
      source: crmLeadSource,
      sourceId: z.uuid().nullable(),
      ownerUserId: z.uuid().nullable(),
    })
    .strict(),
});

/** `crm.lead.updated` v1: which fields changed (names only); a state change carries the new state. */
export const CrmLeadUpdatedV1 = defineEvent({
  type: 'crm.lead.updated',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({ leadId: z.uuid(), fields: fieldNames, state: crmLeadState.optional() })
    .strict(),
});

/** `crm.lead.assigned` v1: the new owner, or nobody („Neatribuit”). */
export const CrmLeadAssignedV1 = defineEvent({
  type: 'crm.lead.assigned',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z.object({ leadId: z.uuid(), ownerUserId: z.uuid().nullable() }).strict(),
});

/** `crm.lead.converted` v1: into a new or an existing contact, with the deal created at once, if any. */
export const CrmLeadConvertedV1 = defineEvent({
  type: 'crm.lead.converted',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({
      leadId: z.uuid(),
      contactId: z.uuid(),
      newContact: z.boolean(),
      dealId: z.uuid().nullable(),
    })
    .strict(),
});

/** `crm.lead.disqualified` v1: closed with a reason from S131 (the note never leaves ClientDesk). */
export const CrmLeadDisqualifiedV1 = defineEvent({
  type: 'crm.lead.disqualified',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({
      leadId: z.uuid(),
      reason: z.enum(['budget', 'no_reply', 'not_offered', 'competitor', 'spam', 'other']),
    })
    .strict(),
});

/** `crm.lead.deleted` v1: moved to the bin. */
export const CrmLeadDeletedV1 = defineEvent({
  type: 'crm.lead.deleted',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z.object({ leadId: z.uuid() }).strict(),
});

/** `crm.deal.created` v1: in a pipeline and a stage; the value is the sum of its items. */
export const CrmDealCreatedV1 = defineEvent({
  type: 'crm.deal.created',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({
      dealId: z.uuid(),
      pipelineId: z.uuid(),
      stageId: z.uuid(),
      contactId: z.uuid().nullable(),
      companyId: z.uuid().nullable(),
      leadId: z.uuid().nullable(),
      ownerUserId: z.uuid().nullable(),
      valueMinor: amountMinor,
      currency,
    })
    .strict(),
});

/** `crm.deal.updated` v1: which fields changed (names only). */
export const CrmDealUpdatedV1 = defineEvent({
  type: 'crm.deal.updated',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z.object({ dealId: z.uuid(), fields: fieldNames }).strict(),
});

/** `crm.deal.stage_changed` v1: moved between the open stages of its pipeline. */
export const CrmDealStageChangedV1 = defineEvent({
  type: 'crm.deal.stage_changed',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({
      dealId: z.uuid(),
      pipelineId: z.uuid(),
      fromStageId: z.uuid(),
      toStageId: z.uuid(),
    })
    .strict(),
});

/** `crm.deal.won` v1: the final value and the day it was won. */
export const CrmDealWonV1 = defineEvent({
  type: 'crm.deal.won',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z
    .object({
      dealId: z.uuid(),
      valueMinor: amountMinor,
      currency,
      wonOn: z.iso.date(),
    })
    .strict(),
});

/** `crm.deal.lost` v1: with its loss reason (the business's list, S131). */
export const CrmDealLostV1 = defineEvent({
  type: 'crm.deal.lost',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z.object({ dealId: z.uuid(), lossReasonId: z.uuid() }).strict(),
});

/** `crm.deal.reopened` v1: back to an open stage after won or lost. */
export const CrmDealReopenedV1 = defineEvent({
  type: 'crm.deal.reopened',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z.object({ dealId: z.uuid(), stageId: z.uuid() }).strict(),
});

/** `crm.deal.deleted` v1: moved to the bin. */
export const CrmDealDeletedV1 = defineEvent({
  type: 'crm.deal.deleted',
  version: 1,
  sourceApp: 'platform',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z.object({ dealId: z.uuid() }).strict(),
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
  BookingClientCreatedV1 as EventDefinition,
  BookingClientUpdatedV1 as EventDefinition,
  BookingClientMergedV1 as EventDefinition,
  BookingClientErasedV1 as EventDefinition,
  BookingPaymentRecordedV1 as EventDefinition,
  CommercialFeatureLockedClickedV1 as EventDefinition,
  IntegrationTargetMissingV1 as EventDefinition,
  CommercialAddonPurchasedV1 as EventDefinition,
  CommercialApplicationActivatedV1 as EventDefinition,
  CommercialTrialStartedV1 as EventDefinition,
  CommercialSubscriptionChangedV1 as EventDefinition,
  CrmContactCreatedV1 as EventDefinition,
  CrmContactUpdatedV1 as EventDefinition,
  CrmContactDeletedV1 as EventDefinition,
  CrmContactRestoredV1 as EventDefinition,
  CrmCompanyCreatedV1 as EventDefinition,
  CrmCompanyUpdatedV1 as EventDefinition,
  CrmCompanyDeletedV1 as EventDefinition,
  CrmCompanyRestoredV1 as EventDefinition,
  OrganizationCreatedV1 as EventDefinition,
  UserLocaleChangedV1 as EventDefinition,
  OrganizationMemberAddedV1 as EventDefinition,
  OrganizationMemberRemovedV1 as EventDefinition,
  OrganizationMemberRoleChangedV1 as EventDefinition,
  CommercialApplicationStoppedV1 as EventDefinition,
  CrmLeadCreatedV1 as EventDefinition,
  CrmLeadUpdatedV1 as EventDefinition,
  CrmLeadAssignedV1 as EventDefinition,
  CrmLeadConvertedV1 as EventDefinition,
  CrmLeadDisqualifiedV1 as EventDefinition,
  CrmLeadDeletedV1 as EventDefinition,
  CrmDealCreatedV1 as EventDefinition,
  CrmDealUpdatedV1 as EventDefinition,
  CrmDealStageChangedV1 as EventDefinition,
  CrmDealWonV1 as EventDefinition,
  CrmDealLostV1 as EventDefinition,
  CrmDealReopenedV1 as EventDefinition,
  CrmDealDeletedV1 as EventDefinition,
];

/** Definiția unui eveniment după tip și versiune; null dacă nu e în catalog. */
export function findEventDefinition(
  type: string,
  version: number,
  catalog: readonly EventDefinition[] = EVENT_CATALOG,
): EventDefinition | null {
  return catalog.find((d) => d.type === type && d.version === version) ?? null;
}
