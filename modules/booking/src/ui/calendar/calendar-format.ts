import type { ScheduleEvent, ScheduleEventStatus } from '@ventora/ui';

/* BookingCalendar (B.6a): the pure rules of the calendar — the days of a week, moving through the
   dates, the appointments and blocked times as Schedule events. Every date is a local business day
   („YYYY-MM-DD”) and every time a local „HH:MM” (the server converts with the business's time zone,
   C.0); nothing here depends on the browser's clock or zone. */

export type CalendarView = 'day' | 'week' | 'res';

/** The 7 states of an appointment (B.4a). */
export type CalendarAppointmentStatus =
  | 'awaiting_payment'
  | 'unconfirmed'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type CalendarAppointment = {
  id: string;
  staffId: string;
  /** „YYYY-MM-DD”, local */
  date: string;
  /** „HH:MM”, local */
  start: string;
  end: string;
  client: string;
  service: string;
  status: CalendarAppointmentStatus;
};

export type CalendarBlock = {
  id: string;
  staffId: string;
  date: string;
  start: string;
  end: string;
  /** The reason the team wrote („Pauză de prânz”), or null. */
  reason: string | null;
};

/** The Schedule look of each appointment state. */
export function scheduleStatus(status: CalendarAppointmentStatus): ScheduleEventStatus {
  switch (status) {
    case 'completed':
      return 'done';
    case 'in_progress':
      return 'now';
    case 'confirmed':
      return 'confirmed';
    case 'cancelled':
      return 'cancelled';
    case 'no_show':
      return 'noshow';
    default:
      // unconfirmed, awaiting_payment
      return 'unconfirmed';
  }
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A local day as UTC noon (no daylight-saving edge can move it to another day). */
export function dayDate(iso: string): Date {
  const m = ISO.exec(iso);
  if (!m) throw new Error(`[calendar] not a day: ${iso}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
}

export const isoOf = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(iso: string, n: number): string {
  const d = dayDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return isoOf(d);
}

/** 1 = Monday … 7 = Sunday */
export function weekdayOf(iso: string): number {
  const w = dayDate(iso).getUTCDay();
  return w === 0 ? 7 : w;
}

/** The Monday of the week of a day. */
export const weekStart = (iso: string) => addDays(iso, 1 - weekdayOf(iso));

/** The 7 days (Monday first) of the week of a day. */
export const weekDays = (iso: string) =>
  Array.from({ length: 7 }, (_, i) => addDays(weekStart(iso), i));

/** One step back or forward: a day in the day and resources views, a week in the week view. */
export const stepDate = (iso: string, view: CalendarView, dir: -1 | 1) =>
  addDays(iso, view === 'week' ? 7 * dir : dir);

/** The column id of a week day („2026-10-23” → „d2026-10-23”). */
export const dayColumn = (iso: string) => `d${iso}`;

/**
 * Appointments and blocked times as Schedule events, each in its column: the member's id (day and
 * resources views) or the day (week view). `blockTitle` names a block without a reason.
 */
export function toEvents(
  appointments: CalendarAppointment[],
  blocks: CalendarBlock[],
  columnOf: (item: { staffId: string; date: string }) => string | null,
  blockTitle: (block: CalendarBlock) => string,
): ScheduleEvent[] {
  const out: ScheduleEvent[] = [];
  for (const a of appointments) {
    const col = columnOf(a);
    if (!col) continue;
    out.push({
      id: a.id,
      col,
      start: a.start,
      end: a.end,
      title: a.client,
      subtitle: a.service,
      status: scheduleStatus(a.status),
    });
  }
  for (const b of blocks) {
    const col = columnOf(b);
    if (!col) continue;
    out.push({
      id: `block:${b.id}`,
      col,
      start: b.start,
      end: b.end,
      title: blockTitle(b),
      status: 'blocked',
    });
  }
  return out;
}

/** The hours the grid shows: from an hour before the opening to the closing (rounded up), at least 8–19. */
export function gridHours(open: { from: string; to: string } | null): { from: number; to: number } {
  if (!open) return { from: 8, to: 19 };
  const h = (s: string) => Number(s.slice(0, 2)) + (s.slice(3) === '00' ? 0 : 1);
  const from = Math.max(0, Math.min(8, Number(open.from.slice(0, 2)) - 1));
  const to = Math.min(24, Math.max(19, h(open.to)));
  return { from, to };
}

/** How many appointments a day holds (the cancelled and no-show ones don't count). */
export const activeCount = (appointments: CalendarAppointment[]) =>
  appointments.filter((a) => a.status !== 'cancelled' && a.status !== 'no_show').length;
