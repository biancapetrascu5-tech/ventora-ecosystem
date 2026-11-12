'use server';

import './access-config';
import { headers } from 'next/headers';
import { authorize } from '@ventora/access';
import {
  findFirstFreeSlot,
  getBusinessHours,
  getFreeSlots,
  listAppointments,
  listServices,
  listStaff,
  listTimeBlocks,
  type Appointment,
  type TimeBlock,
} from '@ventora/booking';
import { getSession } from '@ventora/identity';
import { getOrganizationTimeZone } from '@ventora/organizations';
import { reportActionError } from './report-error';

/* Lot B.6a — EasyBook · Calendar (BookingCalendar). The business and the person come only from
   the session; every read goes through the booking contracts, which start with authorize()
   (booking:read, D-B4-6 = a: the whole team reads the calendar). The instants become local dates
   and „HH:MM” in the business's time zone (C.0) here, so the screen never depends on the browser's
   zone. The data reaches the screen without Date objects. */

export type CalendarStaffData = { id: string; name: string; role: string };
export type CalendarAppointmentData = {
  id: string;
  staffId: string;
  date: string;
  start: string;
  end: string;
  client: string;
  service: string;
  status: Appointment['status'];
};
export type CalendarBlockData = {
  id: string;
  staffId: string;
  date: string;
  start: string;
  end: string;
  reason: string | null;
};
export type CalendarBusinessDay = { weekday: number; open: { from: string; to: string } | null };
/** `staffIds`: who does the service (B.2b), in the team's order. */
export type CalendarServiceData = { id: string; name: string; minutes: number; staffIds: string[] };

export type CalendarRangeData = {
  /** The local days asked for, in order. */
  days: string[];
  appointments: CalendarAppointmentData[];
  blocks: CalendarBlockData[];
};

export type CalendarPageData = {
  staff: CalendarStaffData[];
  business: CalendarBusinessDay[];
  services: CalendarServiceData[];
  timeZone: string;
  /** The business's today („YYYY-MM-DD”) and time now („HH:MM”). */
  today: string;
  now: string;
  /** The week of today (Monday first), already read. */
  week: CalendarRangeData;
};

export type CalendarPage =
  | { kind: 'ok'; data: CalendarPageData }
  | { kind: 'signedOut' }
  | { kind: 'notEnabled' }
  | { kind: 'forbidden' };

const codeOf = (err: unknown) => (err as { code?: string } | null)?.code;

async function sessionToken(): Promise<string | null> {
  const session = await getSession(await headers());
  return session?.token ?? null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

/** An instant as the business's local day and „HH:MM”. */
function localOf(at: Date, timeZone: string): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const noonOf = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const addDays = (iso: string, n: number) =>
  new Date(noonOf(iso) + n * 86_400_000).toISOString().slice(0, 10);

/** The days of a range, at most 7 (a week). */
function daysOf(from: string, to: string): string[] {
  if (!ISO.test(from) || !ISO.test(to) || to < from) throw new Error('invalid_range');
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 7; d = addDays(d, 1)) out.push(d);
  return out;
}

/** A local [start, end) cut into the local days it covers (a block can last several days). */
function perDay(
  startsAt: Date,
  endsAt: Date,
  timeZone: string,
): { date: string; start: string; end: string }[] {
  const a = localOf(startsAt, timeZone);
  const b = localOf(endsAt, timeZone);
  if (a.date === b.date) return [{ date: a.date, start: a.time, end: b.time }];
  const out = [{ date: a.date, start: a.time, end: '24:00' }];
  for (let d = addDays(a.date, 1); d < b.date; d = addDays(d, 1)) {
    out.push({ date: d, start: '00:00', end: '24:00' });
  }
  if (b.time !== '00:00') out.push({ date: b.date, start: '00:00', end: b.time });
  return out;
}

async function readRange(
  token: string,
  timeZone: string,
  days: string[],
): Promise<CalendarRangeData> {
  const first = days[0] as string;
  const last = days[days.length - 1] as string;
  // every zone is within ±14 h of UTC: the instants that can fall on these local days
  const from = new Date(Date.parse(`${first}T00:00:00Z`) - 14 * 3_600_000).toISOString();
  const to = new Date(Date.parse(`${addDays(last, 1)}T00:00:00Z`) + 14 * 3_600_000).toISOString();
  const [list, blocks] = await Promise.all([
    listAppointments({ sessionToken: token, from, to, limit: 500 }),
    listTimeBlocks({ sessionToken: token, from, to }),
  ]);
  const wanted = new Set(days);
  const appointments: CalendarAppointmentData[] = [];
  for (const a of list.items) {
    const s = localOf(a.startsAt, timeZone);
    if (!wanted.has(s.date)) continue;
    const e = localOf(a.endsAt, timeZone);
    appointments.push({
      id: a.id,
      staffId: a.staffMemberId,
      date: s.date,
      start: s.time,
      end: e.date === s.date ? e.time : '24:00',
      client: a.clientName,
      service: a.serviceName,
      status: a.status,
    });
  }
  const out: CalendarBlockData[] = [];
  for (const b of blocks as TimeBlock[]) {
    if (b.archivedAt) continue;
    for (const piece of perDay(b.startsAt, b.endsAt, timeZone)) {
      if (!wanted.has(piece.date)) continue;
      out.push({
        id: `${b.id}:${piece.date}`,
        staffId: b.staffMemberId,
        reason: b.reason,
        ...piece,
      });
    }
  }
  return { days, appointments, blocks: out };
}

/** The page: who may open it (booking:read), the team, the business's week, today's week. */
export async function readCalendarPage(): Promise<CalendarPage> {
  const token = await sessionToken();
  if (!token) return { kind: 'signedOut' };
  let organizationId: string;
  try {
    const ctx = await authorize({
      sessionToken: token,
      applicationId: 'booking',
      permission: 'booking:read',
    });
    organizationId = ctx.organizationId;
  } catch (err) {
    const code = codeOf(err);
    if (code === 'APP_NOT_ENABLED') return { kind: 'notEnabled' };
    if (code === 'NOT_AUTHENTICATED') return { kind: 'signedOut' };
    reportActionError('booking.calendar.read', err, { quietIfExpected: true });
    return { kind: 'forbidden' };
  }
  const timeZone = await getOrganizationTimeZone({ organizationId });
  const here = localOf(new Date(), timeZone);
  const weekday = ((new Date(noonOf(here.date)).getUTCDay() + 6) % 7) + 1;
  const monday = addDays(here.date, 1 - weekday);
  const [staff, business, services, week] = await Promise.all([
    listStaff({ sessionToken: token }),
    getBusinessHours({ sessionToken: token }),
    listServices({ sessionToken: token }),
    readRange(token, timeZone, daysOf(monday, addDays(monday, 6))),
  ]);
  return {
    kind: 'ok',
    data: {
      staff: staff.members.map((m) => ({ id: m.id, name: m.displayName, role: m.role })),
      business: business.map((d) => ({
        weekday: d.weekday,
        open:
          d.isOpen && d.opensAtMin !== null && d.closesAtMin !== null
            ? { from: hhmm(d.opensAtMin), to: hhmm(d.closesAtMin) }
            : null,
      })),
      services: services.map((s) => ({
        id: s.id,
        name: s.name,
        minutes: s.durationMinutes,
        staffIds: s.doneBy.staffMemberIds,
      })),
      timeZone,
      today: here.date,
      now: here.time,
      week,
    },
  };
}

export type CalendarActionResult<T> = { ok: true; value: T } | { ok: false; error: 'failed' };

/** Another day or week: the appointments and blocked times of [from, to] (local days, ≤ 7). */
export async function readCalendarRange(
  from: string,
  to: string,
): Promise<CalendarActionResult<CalendarRangeData & { today: string; now: string }>> {
  const token = await sessionToken();
  if (!token) return { ok: false, error: 'failed' };
  try {
    const ctx = await authorize({
      sessionToken: token,
      applicationId: 'booking',
      permission: 'booking:read',
    });
    const timeZone = await getOrganizationTimeZone({ organizationId: ctx.organizationId });
    const here = localOf(new Date(), timeZone);
    const range = await readRange(token, timeZone, daysOf(from, to));
    return { ok: true, value: { ...range, today: here.date, now: here.time } };
  } catch (err) {
    reportActionError('booking.calendar.range', err, { quietIfExpected: true });
    return { ok: false, error: 'failed' };
  }
}

export type FirstFreeData = {
  date: string;
  time: string;
  staffId: string;
  staffName: string;
  /** The members who do the service and have no free time that day (S: „Mara și Radu nu au loc joi”). */
  busyStaffIds: string[];
  /** The service's duration („Pentru Tratament facial (45 min)”). */
  minutes: number;
} | null;

/** „Primul loc liber”: the next free slot for a service, with anyone, from a local day on. */
export async function readFirstFree(
  serviceId: string,
  from?: string,
): Promise<CalendarActionResult<FirstFreeData>> {
  const token = await sessionToken();
  if (!token) return { ok: false, error: 'failed' };
  try {
    const slot = await findFirstFreeSlot({
      sessionToken: token,
      serviceId,
      staffMemberId: 'any',
      from,
    });
    if (!slot) return { ok: true, value: null };
    const [day, services] = await Promise.all([
      getFreeSlots({
        sessionToken: token,
        serviceId,
        staffMemberId: 'any',
        from: slot.date,
        to: slot.date,
      }),
      listServices({ sessionToken: token }),
    ]);
    const free = new Set(
      day.days.flatMap((d) =>
        d.slots.flatMap((x) => (x.available ? (x.staffMemberIds ?? []) : [])),
      ),
    );
    const service = services.find((x) => x.id === serviceId);
    const doers = service?.doneBy.staffMemberIds ?? [];
    return {
      ok: true,
      value: {
        date: slot.date,
        time: slot.time,
        staffId: slot.staffMemberId,
        staffName: slot.staffDisplayName,
        busyStaffIds: doers.filter((id) => !free.has(id)),
        minutes: service?.durationMinutes ?? day.durationMinutes,
      },
    };
  } catch (err) {
    reportActionError('booking.calendar.firstFree', err, { quietIfExpected: true });
    return { ok: false, error: 'failed' };
  }
}
