'use server';

import './access-config';
import { headers } from 'next/headers';
import {
  cancelManagedBooking,
  confirmManagedMove,
  getManagedBooking,
  getManagedFreeSlots,
  confirmPublicAnswerPhoto,
  getPublicBookingPage,
  getPublicClassSessions,
  getPublicFreeSlots,
  requestPublicAnswerPhoto,
  resendPublicBookingCode,
  startManagedMove,
  startPublicBooking,
  verifyPublicBooking,
  type FreeSlots,
  type ManagedBooking,
  type PublicBookingPage,
} from '@ventora/booking';
import { localOf } from './booking-time';
import { reportActionError } from './report-error';

/* Decision 7, screen 6 — the public pages of EasyBook, without a session (B.11a / B.11b):
   /r/<slug> (BookingPublic) and /r/<slug>/m/<token> (BookingClientManage). The business comes only
   from the slug, the booking only from the token; the caller's IP comes from the request headers,
   never from the browser. The contracts check the anti-robot token (Turnstile, on the server),
   the limits per IP and per client, a blocked client (refused as „slot_taken”, never told why).
   Instants become local dates and „HH:MM” of the business here; no Date objects reach the page. */

const codeOf = (err: unknown) => (err as { code?: string } | null)?.code;
const reasonOf = (err: unknown) => (err as { message?: string } | null)?.message ?? '';
const fieldOf = (err: unknown) => (err as { field?: string } | null)?.field ?? '';

async function callerIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || h.get('x-real-ip') || null;
}

export type PublicSlotData = { time: string; startsAt: string; available: boolean };
export type PublicDayData = { date: string; slots: PublicSlotData[] };

function daysOf(free: FreeSlots): PublicDayData[] {
  return free.days.map((d) => ({
    date: d.date,
    slots: d.slots.map((x) => ({
      time: x.time,
      startsAt: x.startsAt.toISOString(),
      available: x.available,
    })),
  }));
}

/** `localToday`: the business's date (YYYY-MM-DD); `today` is the hours today (B.11c). */
export type PublicPageData = PublicBookingPage & { localToday: string };
export type PublicPageResult = { ok: true; data: PublicPageData } | { ok: false };

/** The business of the slug, its services and members bookable online; notFound otherwise. */
export async function readPublicPage(slug: string): Promise<PublicPageResult> {
  try {
    const page = await getPublicBookingPage({ slug });
    return { ok: true, data: { ...page, localToday: localOf(new Date(), page.timeZone).date } };
  } catch (err) {
    reportActionError('booking.public.page', err, { quietIfExpected: true });
    return { ok: false };
  }
}

/** The free online times of a range of days (at most the 30 days of D-B5-5). */
export async function readPublicSlots(params: {
  slug: string;
  serviceId: string;
  staffMemberId: string;
  from: string;
  to: string;
  locationId?: string;
}): Promise<{ ok: true; days: PublicDayData[] } | { ok: false }> {
  try {
    return { ok: true, days: daysOf(await getPublicFreeSlots(params)) };
  } catch (err) {
    reportActionError('booking.public.slots', err, { quietIfExpected: true });
    return { ok: false };
  }
}

/**
 * „Primul loc liber” of the public page: the first day from `from` with a free time, looked up a
 * week at a time (the contract gives at most 7 days at once) up to the 30-day horizon; null when
 * nothing is free online (the salon's phone).
 */
export async function findPublicFirstFree(params: {
  slug: string;
  serviceId: string;
  staffMemberId: string;
  from: string;
  today: string;
  locationId?: string;
}): Promise<{ ok: true; date: string | null } | { ok: false }> {
  const day = (iso: string, n: number) => {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const last = day(params.today, 30);
  try {
    for (let from = params.from; from < last; from = day(from, 7)) {
      const to = day(from, 7) < last ? day(from, 7) : last;
      const free = await getPublicFreeSlots({
        slug: params.slug,
        serviceId: params.serviceId,
        staffMemberId: params.staffMemberId,
        from,
        to,
        locationId: params.locationId,
      });
      const hit = free.days.find((d) => d.slots.some((x) => x.available));
      if (hit) return { ok: true, date: hit.date };
    }
    return { ok: true, date: null };
  } catch (err) {
    reportActionError('booking.public.firstFree', err, { quietIfExpected: true });
    return { ok: false };
  }
}

export type StartError =
  | { kind: 'field'; field: 'name' | 'phone' | 'email' | 'message' | 'captcha' | 'startsAt' }
  | { kind: 'taken' }
  | { kind: 'answers' }
  | { kind: 'full' }
  | { kind: 'limited' }
  | { kind: 'quota' }
  | { kind: 'failed' };
export type StartResult =
  | { ok: true; holdId: string; staffMemberId: string; expiresAt: string }
  | { ok: false; error: StartError };

/** „Trimite codul”: the time held 10 minutes, the code by e-mail. */
export async function startPublicBookingAction(params: {
  slug: string;
  serviceId: string;
  /** Not for a class session (B.9d2). */
  staffMemberId?: string;
  startsAt?: string;
  classSessionId?: string;
  locationId?: string;
  /** B.12: the answers to the salon's questions. */
  answers?: Array<{ questionId: string; value: string | string[] | number | null }>;
  name: string;
  phone: string;
  email: string;
  message: string;
  locale: 'ro' | 'en' | 'fr' | 'es' | 'de' | 'it';
  captchaToken: string;
}): Promise<StartResult> {
  try {
    const hold = await startPublicBooking({
      ...params,
      message: params.message.trim() || null,
      ip: await callerIp(),
    });
    return {
      ok: true,
      holdId: hold.holdId,
      staffMemberId: hold.staffMemberId,
      expiresAt: hold.expiresAt.toISOString(),
    };
  } catch (err) {
    reportActionError('booking.public.start', err, { quietIfExpected: true });
    const code = codeOf(err);
    if (code === 'INVALID_INPUT') {
      const f = fieldOf(err);
      if (f === 'name' || f === 'phone' || f === 'email' || f === 'message' || f === 'captcha')
        return { ok: false, error: { kind: 'field', field: f } };
      if (f === 'answers') return { ok: false, error: { kind: 'answers' } };
      if (f === 'startsAt') return { ok: false, error: { kind: 'taken' } };
    }
    if (code === 'CONFLICT') {
      const r = reasonOf(err);
      if (r === 'slot_taken') return { ok: false, error: { kind: 'taken' } };
      if (r === 'class_full' || r === 'class_closed' || r === 'already_participant')
        return { ok: false, error: { kind: 'full' } };
      if (r === 'rate_limited') return { ok: false, error: { kind: 'limited' } };
    }
    if (code === 'QUOTA_EXCEEDED') return { ok: false, error: { kind: 'quota' } };
    return { ok: false, error: { kind: 'failed' } };
  }
}

export type VerifyResult =
  | { ok: true; status: 'confirmed' | 'unconfirmed'; manageToken: string }
  | {
      ok: false;
      error: 'wrong' | 'expired' | 'tooMany' | 'invalid' | 'failed';
      triesLeft?: number;
    };

/** The 6-digit code → the appointment (confirmed, or sent to the salon). */
export async function verifyPublicBookingAction(params: {
  slug: string;
  holdId: string;
  code: string;
}): Promise<VerifyResult> {
  try {
    const r = await verifyPublicBooking(params);
    return { ok: true, status: r.status, manageToken: r.manageToken };
  } catch (err) {
    reportActionError('booking.public.verify', err, { quietIfExpected: true });
    const code = codeOf(err);
    const reason = reasonOf(err);
    if (code === 'INVALID_INPUT') {
      const m = /^wrong:(\d+)$/.exec(reason);
      return m
        ? { ok: false, error: 'wrong', triesLeft: Number(m[1]) }
        : { ok: false, error: 'invalid' };
    }
    if (code === 'CONFLICT' && reason === 'code_expired') return { ok: false, error: 'expired' };
    if (code === 'CONFLICT' && reason === 'too_many_attempts')
      return { ok: false, error: 'tooMany' };
    return { ok: false, error: 'failed' };
  }
}

/** „Retrimite codul” (after 60 seconds, at most 3 sends). */
export async function resendPublicCodeAction(params: {
  slug: string;
  holdId: string;
}): Promise<{ ok: true; expiresAt: string } | { ok: false; error: 'soon' | 'failed' }> {
  try {
    const r = await resendPublicBookingCode(params);
    return { ok: true, expiresAt: r.expiresAt.toISOString() };
  } catch (err) {
    reportActionError('booking.public.resend', err, { quietIfExpected: true });
    return {
      ok: false,
      error: reasonOf(err) === 'resend_too_soon' ? 'soon' : 'failed',
    };
  }
}

export type PublicSessionData = {
  id: string;
  staffMemberId: string;
  staff: string;
  date: string;
  time: string;
  endTime: string;
  startsAt: string;
  endsAt: string;
  seatsLeft: number;
};

/** B.9d2: the sessions of a class bookable online on a day, with the seats left (0 = „Plin”). */
export async function readPublicClassSessions(params: {
  slug: string;
  serviceId: string;
  date: string;
  timeZone: string;
  locationId?: string;
}): Promise<{ ok: true; sessions: PublicSessionData[] } | { ok: false }> {
  const next = new Date(`${params.date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  try {
    const list = await getPublicClassSessions({
      slug: params.slug,
      serviceId: params.serviceId,
      from: params.date,
      to: next.toISOString().slice(0, 10),
      locationId: params.locationId,
    });
    return {
      ok: true,
      sessions: list.map((x) => {
        const s = localOf(x.startsAt, params.timeZone);
        return {
          id: x.id,
          staffMemberId: x.staffMemberId,
          staff: x.staffDisplayName,
          date: s.date,
          time: s.time,
          endTime: localOf(x.endsAt, params.timeZone).time,
          startsAt: x.startsAt.toISOString(),
          endsAt: x.endsAt.toISOString(),
          seatsLeft: x.seatsLeft,
        };
      }),
    };
  } catch (err) {
    reportActionError('booking.public.classes', err, { quietIfExpected: true });
    return { ok: false };
  }
}

export type PhotoError = 'type' | 'size' | 'count' | 'failed';

/** B.12 (S146): the upload link of a question's photo, on the pending hold (after Turnstile). */
export async function requestPublicPhotoAction(params: {
  slug: string;
  holdId: string;
  questionId: string;
  name: string;
  contentType: string;
  sizeBytes: number;
}): Promise<{ ok: true; fileId: string; uploadUrl: string } | { ok: false; error: PhotoError }> {
  try {
    const r = await requestPublicAnswerPhoto(params);
    return { ok: true, fileId: r.fileId, uploadUrl: r.uploadUrl };
  } catch (err) {
    reportActionError('booking.public.photo', err, { quietIfExpected: true });
    const f = fieldOf(err);
    const reason = reasonOf(err);
    if (f === 'contentType') return { ok: false, error: 'type' };
    if (f === 'sizeBytes') return { ok: false, error: 'size' };
    if (/too_many|count/.test(reason)) return { ok: false, error: 'count' };
    return { ok: false, error: 'failed' };
  }
}

/** After the upload: the photo checked by its content; it goes to the booking with the code. */
export async function confirmPublicPhotoAction(params: {
  slug: string;
  holdId: string;
  fileId: string;
}): Promise<{ ok: true } | { ok: false; error: PhotoError }> {
  try {
    await confirmPublicAnswerPhoto(params);
    return { ok: true };
  } catch (err) {
    reportActionError('booking.public.photoConfirm', err, { quietIfExpected: true });
    return { ok: false, error: fieldOf(err) === 'contentType' ? 'type' : 'failed' };
  }
}

/* ── BookingClientManage ─────────────────────────────────────────────────────────────────── */

export type ManagedData = {
  /** B.11c: the phone of the booking's location, else the business's (E.164) or null. */
  business: { name: string; phone: string | null };
  appointment: Omit<ManagedBooking['appointment'], 'startsAt' | 'endsAt'> & {
    date: string;
    time: string;
    endTime: string;
    /** ISO instants, for „Adaugă în calendar” (.ics). */
    startsAt: string;
    endsAt: string;
  };
  policy: {
    freeCancelHours: number;
    freeUntil: { date: string; time: string };
    onlineCutoffHours: number;
  };
  state: ManagedBooking['state'];
  canCancel: boolean;
  cancelLate: boolean;
  canMove: boolean;
  moveRefusal: ManagedBooking['moveRefusal'];
  today: string;
};
export type ManagedResult = { ok: true; data: ManagedData } | { ok: false };

/** „Programarea dumneavoastră”; an unknown, malformed or revoked link → not found. */
export async function readManagedBooking(slug: string, token: string): Promise<ManagedResult> {
  try {
    const m = await getManagedBooking({ slug, token });
    const tz = m.business.timeZone;
    const s = localOf(m.appointment.startsAt, tz);
    const e = localOf(m.appointment.endsAt, tz);
    const { startsAt: _s, endsAt: _e, ...rest } = m.appointment;
    return {
      ok: true,
      data: {
        business: { name: m.business.name, phone: m.business.phone },
        appointment: {
          ...rest,
          date: s.date,
          time: s.time,
          endTime: e.time,
          startsAt: m.appointment.startsAt.toISOString(),
          endsAt: m.appointment.endsAt.toISOString(),
        },
        policy: {
          freeCancelHours: m.policy.freeCancelHours,
          freeUntil: localOf(m.policy.freeUntil, tz),
          onlineCutoffHours: m.policy.onlineCutoffHours,
        },
        state: m.state,
        canCancel: m.canCancel,
        cancelLate: m.cancelLate,
        canMove: m.canMove,
        moveRefusal: m.moveRefusal,
        today: localOf(new Date(), tz).date,
      },
    };
  } catch (err) {
    reportActionError('booking.manage.read', err, { quietIfExpected: true });
    return { ok: false };
  }
}

export async function readManagedSlots(params: {
  slug: string;
  token: string;
  from: string;
  to: string;
}): Promise<{ ok: true; days: PublicDayData[] } | { ok: false }> {
  try {
    return { ok: true, days: daysOf(await getManagedFreeSlots(params)) };
  } catch (err) {
    reportActionError('booking.manage.slots', err, { quietIfExpected: true });
    return { ok: false };
  }
}

export type ManageActionError = 'taken' | 'expired' | 'refused' | 'limited' | 'failed';

/** „Mută programarea”: the new time held 10 minutes. */
export async function startManagedMoveAction(params: {
  slug: string;
  token: string;
  startsAt: string;
}): Promise<
  { ok: true; holdId: string; expiresAt: string } | { ok: false; error: ManageActionError }
> {
  try {
    const h = await startManagedMove({ ...params, ip: await callerIp() });
    return { ok: true, holdId: h.holdId, expiresAt: h.expiresAt.toISOString() };
  } catch (err) {
    reportActionError('booking.manage.move', err, { quietIfExpected: true });
    return { ok: false, error: manageError(err) };
  }
}

/** „Mută pe …”: confirms the held time; after the 10 minutes the booking stays as it was. */
export async function confirmManagedMoveAction(params: {
  slug: string;
  token: string;
  holdId: string;
}): Promise<{ ok: true } | { ok: false; error: ManageActionError }> {
  try {
    await confirmManagedMove(params);
    return { ok: true };
  } catch (err) {
    reportActionError('booking.manage.confirm', err, { quietIfExpected: true });
    return { ok: false, error: manageError(err) };
  }
}

/** „Da, anulează programarea”. */
export async function cancelManagedBookingAction(params: {
  slug: string;
  token: string;
}): Promise<{ ok: true; late: boolean } | { ok: false; error: ManageActionError }> {
  try {
    const r = await cancelManagedBooking(params);
    return { ok: true, late: r.late };
  } catch (err) {
    reportActionError('booking.manage.cancel', err, { quietIfExpected: true });
    return { ok: false, error: manageError(err) };
  }
}

function manageError(err: unknown): ManageActionError {
  if (codeOf(err) !== 'CONFLICT') return 'failed';
  switch (reasonOf(err)) {
    case 'slot_taken':
      return 'taken';
    case 'hold_expired':
      return 'expired';
    case 'rate_limited':
      return 'limited';
    case 'too_late':
    case 'cancelled':
    case 'over':
    case 'online_closed':
    case 'moved_once':
    case 'manual_confirmation':
      return 'refused';
    default:
      return 'failed';
  }
}
