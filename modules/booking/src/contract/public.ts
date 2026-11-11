import {
  configurePublicBooking,
  getPublicBookingPage as pageInOrg,
  getPublicFreeSlots as slotsInOrg,
  resendPublicBookingCode as resendInOrg,
  startPublicBooking as startInOrg,
  verifyPublicBooking as verifyInOrg,
  type CaptchaVerifier,
  type PublicBookingPage,
  type PublicBookingResult,
  type PublicHoldResult,
} from '../server/public';
import type { FreeSlots } from '../server/availability';

/*
 * Lot B.11a — the public contract of the booking page (app.ventora-hub.com/r/<slug>), without a
 * session: the business comes only from the slug. The route passes the caller's IP from the
 * request, never from the body. Errors: ResourceNotFound (slug, hold); InvalidInput (captcha,
 * name / phone / email / message, startsAt, answers (B.12), code: invalid | wrong:<tries left>); Conflict
 * (slot_taken — also for a blocked client, who is never told why —, rate_limited, code_expired,
 * too_many_attempts, resend_too_soon, too_many_sends, email_not_delivered); QuotaExceeded.
 */

export type PublicSlotsParams = {
  slug: string;
  serviceId: string;
  staffMemberId: string | 'any';
  from: string;
  to: string;
  locationId?: string;
};

export type StartPublicBookingParams = {
  slug: string;
  serviceId: string;
  staffMemberId: string | 'any';
  startsAt: string;
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

/** „Trimite codul”: the time held 10 minutes, the code by e-mail. */
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

export { configurePublicBooking };
export type { CaptchaVerifier, PublicBookingPage, PublicBookingResult, PublicHoldResult };
