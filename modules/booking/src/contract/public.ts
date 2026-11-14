import {
  configurePublicBooking,
  getPublicBookingPage as pageInOrg,
  getPublicClassSessions as classSessionsInOrg,
  getPublicFreeSlots as slotsInOrg,
  resendPublicBookingCode as resendInOrg,
  requestPublicAnswerPhoto as requestPhotoInOrg,
  confirmPublicAnswerPhoto as confirmPhotoInOrg,
  startPublicBooking as startInOrg,
  verifyPublicBooking as verifyInOrg,
  type CaptchaVerifier,
  type PublicBookingPage,
  type PublicBookingResult,
  type PublicClassSession,
  type PublicHoldResult,
} from '../server/public';
import type { FreeSlots } from '../server/availability';
import type { TodayHours } from '../server/public-contact';

/*
 * Lot B.11a — the public contract of the booking page (app.ventora-hub.com/r/<slug>), without a
 * session: the business comes only from the slug. The route passes the caller's IP from the
 * request, never from the body. Errors: ResourceNotFound (slug, hold); InvalidInput (captcha,
 * name / phone / email / message, startsAt, answers (B.12), code: invalid | wrong:<tries left>); Conflict
 * (slot_taken — also for a blocked client, who is never told why —, rate_limited, code_expired,
 * too_many_attempts, resend_too_soon, too_many_sends, email_not_delivered); QuotaExceeded.
 * B.9d2 (a seat of a class session): Conflict class_full („Plin”), class_closed (cancelled, past
 * the notice, no longer online), already_participant; InvalidInput serviceId (not the session's).
 */

export type PublicSlotsParams = {
  slug: string;
  serviceId: string;
  staffMemberId: string | 'any';
  from: string;
  to: string;
  locationId?: string;
};

export type PublicClassSessionsParams = {
  slug: string;
  serviceId: string;
  /** Local dates (YYYY-MM-DD): from included, to excluded, at most 31 days. */
  from: string;
  to: string;
  locationId?: string;
};

export type StartPublicBookingParams = {
  slug: string;
  serviceId: string;
  /** Not used for a class session. */
  staffMemberId?: string | 'any';
  /** Not used for a class session. */
  startsAt?: string;
  /** B.9d2: a seat of this class session instead of a free time. */
  classSessionId?: string;
  locationId?: string;
  name: string;
  phone: string;
  email: string;
  locale?: 'ro' | 'en' | 'fr' | 'es' | 'de' | 'it';
  message?: string | null;
  /** B.12: the answers to the questions of the service; a required one left empty → InvalidInput. */
  answers?: Array<{ questionId: string; value: string | string[] | number | null }>;
  captchaToken: string;
  ip: string | null;
};

/** The business, its locations, the services and members bookable online. */
export function getPublicBookingPage(params: { slug: string }): Promise<PublicBookingPage> {
  return pageInOrg(params.slug);
}

/** The free online times (notice, horizon of 30 days, times held for others excluded). */
export function getPublicFreeSlots(params: PublicSlotsParams): Promise<FreeSlots> {
  return slotsInOrg(params.slug, params);
}

/** B.9d2 (D-9d-3): the sessions of a class bookable online, with the seats left (0 = „Plin”). */
export function getPublicClassSessions(
  params: PublicClassSessionsParams,
): Promise<PublicClassSession[]> {
  return classSessionsInOrg(params.slug, params);
}

/** „Trimite codul”: the time (or B.9d2 a seat of a class) held 10 minutes, the code by e-mail. */
export function startPublicBooking(params: StartPublicBookingParams): Promise<PublicHoldResult> {
  return startInOrg(params.slug, params);
}

/** The 6-digit code → the appointment (confirmed, or sent to the salon). */
export function verifyPublicBooking(params: {
  slug: string;
  holdId: string;
  code: string;
}): Promise<PublicBookingResult> {
  return verifyInOrg(params.slug, params);
}

/** „Retrimite codul”, after 60 seconds, at most 3 sends. */
export function resendPublicBookingCode(params: {
  slug: string;
  holdId: string;
}): Promise<{ expiresAt: Date }> {
  return resendInOrg(params.slug, params);
}

/**
 * B.12 (S127): the upload link for the optional photo of a question, only on a pending hold of the
 * business (after the anti-robot check of startPublicBooking): PNG / JPEG, at most 10 MB, one per
 * question, 5 per hold.
 */
export function requestPublicAnswerPhoto(params: {
  slug: string;
  holdId: string;
  questionId: string;
  name: string;
  contentType: string;
  sizeBytes: number;
}): Promise<{ fileId: string; uploadUrl: string; expiresAt: Date }> {
  return requestPhotoInOrg(params.slug, params);
}

/** After the upload: the photo checked by its content; it goes to the booking with the code. */
export function confirmPublicAnswerPhoto(params: {
  slug: string;
  holdId: string;
  fileId: string;
}): Promise<{ fileId: string; questionId: string }> {
  return confirmPhotoInOrg(params.slug, params);
}

export { configurePublicBooking };
export type {
  CaptchaVerifier,
  PublicBookingPage,
  PublicBookingResult,
  TodayHours,
  PublicClassSession,
  PublicHoldResult,
};
