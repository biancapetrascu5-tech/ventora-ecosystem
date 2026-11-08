import { InvalidInput } from '@ventora/errors';

/*
 * Lot B.2 — the rules of a schedule, without the database (the same as the CHECKs in
 * booking_staff; the database refuses anyway, here the form gets the field and the reason).
 *
 * Times are local wall-clock minutes of the business (0–1440, steps of 5); dates are local
 * 'YYYY-MM-DD'. S124 (BookingTeamSchedule): a member's schedule cannot go beyond the business's
 * hours — on save it is refused (before_open / after_close / business_closed); when the business's
 * hours change later, the members' intervals are cut to the new hours. The availability of a day
 * (plan §1.3): a leave covering the day → nothing; otherwise an exception on the date → its
 * intervals; otherwise the member's week (custom) or the business's week (business); always cut
 * to the business's hours (D-B2-2 = a).
 */

export type Interval = { startMin: number; endMin: number };

/** One day of the business's week: closed, or one interval. */
export type BusinessDay = {
  weekday: number;
  isOpen: boolean;
  opensAtMin: number | null;
  closesAtMin: number | null;
};

/** One day of a member's week, or an exception: off, or one or two intervals (D-B2-3 = a). */
export type WorkDay = { isWorking: boolean; intervals: Interval[] };

/**
 * The reason of an InvalidInput on a schedule (its message), for the texts of S124:
 * order → err.order, overlap → err.overlap, before_open / after_close → err.beforeOpen /
 * err.afterClose, business_closed → week.closed, leave_order → err.leaveOrder, required →
 * err.leaveFrom; invalid and too_long for the rest.
 */
export type ScheduleError =
  | 'invalid'
  | 'order'
  | 'overlap'
  | 'too_many'
  | 'before_open'
  | 'after_close'
  | 'business_closed'
  | 'leave_order'
  | 'required'
  | 'too_long';

export const SCHEDULE_LIMITS = {
  step: 5,
  dayMinutes: 1440,
  maxIntervals: 2,
  reason: 200,
  timeOffDays: 366,
  availabilityDays: 62,
} as const;

/** D-B2-5 = a: a business that has not saved its week yet (Mon–Fri 9–18, Sat 10–14, Sun closed). */
export const DEFAULT_BUSINESS_WEEK: readonly BusinessDay[] = [1, 2, 3, 4, 5, 6, 7].map((weekday) =>
  weekday <= 5
    ? { weekday, isOpen: true, opensAtMin: 540, closesAtMin: 1080 }
    : weekday === 6
      ? { weekday, isOpen: true, opensAtMin: 600, closesAtMin: 840 }
      : { weekday, isOpen: false, opensAtMin: null, closesAtMin: null },
);

function fail(field: string, reason: ScheduleError): never {
  throw new InvalidInput(field, reason);
}

function isMinute(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= SCHEDULE_LIMITS.dayMinutes &&
    value % SCHEDULE_LIMITS.step === 0
  );
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date 'YYYY-MM-DD' (not 2026-02-30). */
export function isLocalDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

export function requireLocalDate(field: string, value: unknown): string {
  if (value === undefined || value === null || value === '') fail(field, 'required');
  if (!isLocalDate(value)) fail(field, 'invalid');
  return value;
}

/** Days from a to b, inclusive (b ≥ a gives ≥ 1). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000) + 1;
}

/** ISO weekday of a local date: 1 = Monday … 7 = Sunday. */
export function weekdayOf(date: string): number {
  const d = new Date(date + 'T00:00:00Z').getUTCDay();
  return d === 0 ? 7 : d;
}

/** Every date from `from` to `to`, inclusive. */
export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  for (
    let t = Date.parse(from + 'T00:00:00Z');
    t <= Date.parse(to + 'T00:00:00Z');
    t += 86_400_000
  ) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

function requireWeekday(raw: Record<string, unknown> | null, seen: Set<number>): number {
  const weekday = raw?.weekday;
  if (
    typeof weekday !== 'number' ||
    !Number.isInteger(weekday) ||
    weekday < 1 ||
    weekday > 7 ||
    seen.has(weekday)
  ) {
    fail('days', 'invalid');
  }
  seen.add(weekday);
  return weekday;
}

/** The business's week: exactly the 7 weekdays, each closed or with one valid interval. */
export function validateBusinessWeek(days: unknown): BusinessDay[] {
  if (!Array.isArray(days) || days.length !== 7) fail('days', 'invalid');
  const seen = new Set<number>();
  const out: BusinessDay[] = [];
  for (const raw of days as Array<Record<string, unknown>>) {
    const weekday = requireWeekday(raw, seen);
    if (raw.isOpen === false) {
      out.push({ weekday, isOpen: false, opensAtMin: null, closesAtMin: null });
      continue;
    }
    if (raw.isOpen !== true) fail(`days.${weekday}.isOpen`, 'invalid');
    const { opensAtMin, closesAtMin } = raw;
    if (!isMinute(opensAtMin) || !isMinute(closesAtMin)) fail(`days.${weekday}.hours`, 'invalid');
    if (opensAtMin >= closesAtMin) fail(`days.${weekday}.hours`, 'order');
    out.push({ weekday, isOpen: true, opensAtMin, closesAtMin });
  }
  return out.sort((a, b) => a.weekday - b.weekday);
}

/** A working day: off (no intervals) or one or two ordered intervals with a real gap between. */
export function validateWorkDay(field: string, raw: unknown): WorkDay {
  const day = raw as Record<string, unknown> | null;
  if (!day || typeof day !== 'object') fail(field, 'invalid');
  if (day.isWorking === false) {
    if (
      day.intervals !== undefined &&
      !(Array.isArray(day.intervals) && day.intervals.length === 0)
    ) {
      fail(`${field}.intervals`, 'invalid');
    }
    return { isWorking: false, intervals: [] };
  }
  if (day.isWorking !== true) fail(`${field}.isWorking`, 'invalid');
  const intervals = day.intervals;
  if (!Array.isArray(intervals) || intervals.length < 1) fail(`${field}.intervals`, 'invalid');
  if (intervals.length > SCHEDULE_LIMITS.maxIntervals) fail(`${field}.intervals`, 'too_many');
  const out: Interval[] = [];
  for (const i of intervals as Array<Record<string, unknown>>) {
    const { startMin, endMin } = i ?? {};
    if (!isMinute(startMin) || !isMinute(endMin)) fail(`${field}.intervals`, 'invalid');
    if (startMin >= endMin) fail(`${field}.intervals`, 'order');
    const prev = out[out.length - 1];
    if (prev && startMin <= prev.endMin) fail(`${field}.intervals`, 'overlap');
    out.push({ startMin, endMin });
  }
  return { isWorking: true, intervals: out };
}

/**
 * S124: a working day stays inside that day of the business (err.beforeOpen / err.afterClose);
 * on a day the business is closed the member is off („Afacerea e închisă”).
 */
export function requireWithinBusiness(
  field: string,
  day: WorkDay,
  business: BusinessDay | undefined,
) {
  if (!day.isWorking) return;
  if (
    !business ||
    !business.isOpen ||
    business.opensAtMin === null ||
    business.closesAtMin === null
  ) {
    fail(field, 'business_closed');
  }
  for (const i of day.intervals) {
    if (i.startMin < business.opensAtMin) fail(`${field}.intervals`, 'before_open');
    if (i.endMin > business.closesAtMin) fail(`${field}.intervals`, 'after_close');
  }
}

/** A member's week: exactly the 7 weekdays, inside the business's week (S124). */
export function validateStaffWeek(
  days: unknown,
  business: readonly BusinessDay[],
): Array<WorkDay & { weekday: number }> {
  if (!Array.isArray(days) || days.length !== 7) fail('days', 'invalid');
  const seen = new Set<number>();
  const out: Array<WorkDay & { weekday: number }> = [];
  for (const raw of days as Array<Record<string, unknown>>) {
    const weekday = requireWeekday(raw, seen);
    const day = validateWorkDay(`days.${weekday}`, raw);
    requireWithinBusiness(
      `days.${weekday}`,
      day,
      business.find((b) => b.weekday === weekday),
    );
    out.push({ weekday, ...day });
  }
  return out.sort((a, b) => a.weekday - b.weekday);
}

/** The optional reason of a leave (S124 „Motiv”). */
export function normalizeReason(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') fail('reason', 'invalid');
  const reason = value.trim();
  if (reason.length > SCHEDULE_LIMITS.reason) fail('reason', 'too_long');
  return reason.length > 0 ? reason : null;
}

/** The overlap of two sorted lists of intervals. */
export function intersect(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const x of a) {
    for (const y of b) {
      const startMin = Math.max(x.startMin, y.startMin);
      const endMin = Math.min(x.endMin, y.endMin);
      if (startMin < endMin) out.push({ startMin, endMin });
    }
  }
  return out.sort((p, q) => p.startMin - q.startMin);
}

export function businessIntervals(day: BusinessDay | undefined): Interval[] {
  if (!day || !day.isOpen || day.opensAtMin === null || day.closesAtMin === null) return [];
  return [{ startMin: day.opensAtMin, endMin: day.closesAtMin }];
}

/**
 * S124: a working day cut to the business's day; `changed` when anything was cut. Nothing left →
 * the day becomes off.
 */
export function clipToBusiness(
  day: WorkDay,
  business: BusinessDay | undefined,
): { day: WorkDay; changed: boolean } {
  if (!day.isWorking) return { day, changed: false };
  const kept = intersect(day.intervals, businessIntervals(business));
  const changed =
    kept.length !== day.intervals.length ||
    kept.some(
      (k, i) => k.startMin !== day.intervals[i]!.startMin || k.endMin !== day.intervals[i]!.endMin,
    );
  return {
    day:
      kept.length === 0
        ? { isWorking: false, intervals: [] }
        : { isWorking: true, intervals: kept },
    changed,
  };
}

export type DayInputs = {
  date: string;
  business: readonly BusinessDay[];
  scheduleMode: 'business' | 'custom';
  weekly: Map<number, WorkDay>;
  override: WorkDay | undefined;
  onLeave: boolean;
};

/** The member's local intervals on one date (plan §1.3, D-B2-2 = a). */
export function dayAvailability(input: DayInputs): Interval[] {
  if (input.onLeave) return [];
  const business = businessIntervals(
    input.business.find((d) => d.weekday === weekdayOf(input.date)),
  );
  return intersect(ownDay(input).intervals, business);
}

/** The member's own day before the business cut: exception, else the week (custom or business). */
export function ownDay(input: Omit<DayInputs, 'onLeave'>): WorkDay {
  if (input.override) return input.override;
  const weekday = weekdayOf(input.date);
  if (input.scheduleMode === 'custom') {
    return input.weekly.get(weekday) ?? { isWorking: false, intervals: [] };
  }
  const intervals = businessIntervals(input.business.find((d) => d.weekday === weekday));
  return { isWorking: intervals.length > 0, intervals };
}
