/* BookingTeamSchedule (S124): the pure rules of the screen. The schedule is in local minutes
   (0–1440, steps of 5, B.2); the screen shows „HH:MM”. The validation follows the server
   (src/server/schedule.ts: validateWorkDay, then requireWithinBusiness) in the same order, so the
   same day gets the same error; a unit test compares the two. */

export const TEAM_LIMITS = { step: 5, maxIntervals: 2, reason: 200, timeOffDays: 366 } as const;

/** One day of the business's week (the B.2 contract BusinessDay). */
export type BusinessDayData = {
  weekday: number;
  isOpen: boolean;
  opensAtMin: number | null;
  closesAtMin: number | null;
};
export type IntervalData = { startMin: number; endMin: number };

/** A day in a form: on or off, with one or two intervals as „HH:MM”. */
export type DayForm = { on: boolean; intervals: { from: string; to: string }[] };
/** The member's week in the Drawer, weekday 1 (Monday) … 7. */
export type WeekForm = Record<number, DayForm>;

export type DayErrorCode = 'order' | 'overlap' | 'before_open' | 'after_close' | 'invalid';
/** The first error of a day: the interval, the field marked, the reason. */
export type DayError = { i: number; at: 'from' | 'to'; code: DayErrorCode };

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export function minToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** „HH:MM” → minutes, or null when it is not a time on the 5-minute step (24:00 = 1440). */
export function timeToMin(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const min = Number(m[1]) * 60 + Number(m[2]);
  if (Number(m[2]) > 59 || min > 1440 || min % TEAM_LIMITS.step !== 0) return null;
  return min;
}

export const intervalText = (i: IntervalData) => `${minToTime(i.startMin)}–${minToTime(i.endMin)}`;

export function businessOf(business: readonly BusinessDayData[], weekday: number) {
  const b = business.find((d) => d.weekday === weekday);
  return b && b.isOpen && b.opensAtMin !== null && b.closesAtMin !== null
    ? { opensAtMin: b.opensAtMin, closesAtMin: b.closesAtMin }
    : null;
}

/** The first error of a working day, as the server finds it (order, overlap, then the business). */
export function validateDay(
  day: DayForm,
  business: { opensAtMin: number; closesAtMin: number } | null,
): DayError | null {
  if (!day.on) return null;
  if (day.intervals.length < 1 || day.intervals.length > TEAM_LIMITS.maxIntervals) {
    return { i: 0, at: 'from', code: 'invalid' };
  }
  const mins: IntervalData[] = [];
  for (const [i, iv] of day.intervals.entries()) {
    const startMin = timeToMin(iv.from);
    const endMin = timeToMin(iv.to);
    if (startMin === null) return { i, at: 'from', code: 'invalid' };
    if (endMin === null) return { i, at: 'to', code: 'invalid' };
    if (startMin >= endMin) return { i, at: 'to', code: 'order' };
    const prev = mins[mins.length - 1];
    if (prev && startMin <= prev.endMin) return { i, at: 'from', code: 'overlap' };
    mins.push({ startMin, endMin });
  }
  if (!business) return { i: 0, at: 'from', code: 'invalid' };
  for (const [i, iv] of mins.entries()) {
    if (iv.startMin < business.opensAtMin) return { i, at: 'from', code: 'before_open' };
    if (iv.endMin > business.closesAtMin) return { i, at: 'to', code: 'after_close' };
  }
  return null;
}

/** The errors of the week, by weekday (only the days with one). */
export function validateWeek(
  week: WeekForm,
  business: readonly BusinessDayData[],
): Record<number, DayError> {
  const out: Record<number, DayError> = {};
  for (const w of WEEKDAYS) {
    const day = week[w];
    if (!day) continue;
    const err = validateDay(day, businessOf(business, w));
    if (err) out[w] = err;
  }
  return out;
}

/** A day of the form → the contract's WorkDayInput (after validation). */
export function dayInput(day: DayForm): { isWorking: boolean; intervals: IntervalData[] } {
  if (!day.on) return { isWorking: false, intervals: [] };
  return {
    isWorking: true,
    intervals: day.intervals.map((iv) => ({
      startMin: timeToMin(iv.from) ?? 0,
      endMin: timeToMin(iv.to) ?? 0,
    })),
  };
}

export function dayForm(day: { isWorking: boolean; intervals: IntervalData[] }): DayForm {
  return {
    on: day.isWorking && day.intervals.length > 0,
    intervals: day.intervals.map((i) => ({ from: minToTime(i.startMin), to: minToTime(i.endMin) })),
  };
}

/** A new day turned on: the business's hours of that day. */
export function defaultDay(business: { opensAtMin: number; closesAtMin: number } | null): DayForm {
  return business
    ? {
        on: true,
        intervals: [{ from: minToTime(business.opensAtMin), to: minToTime(business.closesAtMin) }],
      }
    : { on: false, intervals: [] };
}

/** „Al doilea interval”: after the first one, up to the business's closing (or the first's end). */
export function secondInterval(
  day: DayForm,
  business: { opensAtMin: number; closesAtMin: number } | null,
): DayForm {
  const first = day.intervals[0];
  const end = business?.closesAtMin ?? 1440;
  const firstEnd = first ? (timeToMin(first.to) ?? end) : end;
  const from = Math.min(firstEnd + 60, end - TEAM_LIMITS.step);
  return {
    ...day,
    intervals: [...day.intervals.slice(0, 1), { from: minToTime(from), to: minToTime(end) }],
  };
}

/** The break between the two intervals of a valid day („Pauză 13:00–14:00”). */
export function breakOf(day: DayForm): { from: string; to: string } | null {
  if (!day.on || day.intervals.length !== 2) return null;
  const [a, b] = day.intervals as [{ from: string; to: string }, { from: string; to: string }];
  return { from: a.to, to: b.from };
}

/* ── the lines of the list ───────────────────────────────────────────────────────────────── */

/** Weekday runs: [1,2,3,5] → [[1,3],[5,5]]. */
function runs(days: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const d of days) {
    const last = out[out.length - 1];
    if (last && d === last[1] + 1) last[1] = d;
    else out.push([d, d]);
  }
  return out;
}

const daysText = (days: number[], short: (w: number) => string) =>
  runs(days)
    .map(([a, b]) => (a === b ? short(a) : `${short(a)}–${short(b)}`))
    .join(', ');

/** Groups the days with the same value, in the order of their first day. */
function groups<T>(items: { weekday: number; key: string; value: T }[]) {
  const out: { key: string; value: T; days: number[] }[] = [];
  for (const it of items) {
    const g = out.find((x) => x.key === it.key);
    if (g) g.days.push(it.weekday);
    else out.push({ key: it.key, value: it.value, days: [it.weekday] });
  }
  return out;
}

/** „Lun–Vin 09:00–13:00, 14:00–18:00 · Sâm 10:00–14:00”; the days off are left out. */
export function weekText(
  week: { weekday: number; intervals: IntervalData[] }[],
  short: (w: number) => string,
): string {
  const items = [...week]
    .sort((a, b) => a.weekday - b.weekday)
    .filter((d) => d.intervals.length > 0)
    .map((d) => {
      const value = d.intervals.map(intervalText).join(', ');
      return { weekday: d.weekday, key: value, value };
    });
  return groups(items)
    .map((g) => `${daysText(g.days, short)} ${g.value}`)
    .join(' · ');
}

/** „Lun–Mie 09:00–19:00 · Joi–Vin 09:00–20:00 · Sâm 10:00–16:00 · Dum închis”. */
export function businessText(
  business: readonly BusinessDayData[],
  short: (w: number) => string,
  closed: (days: string) => string,
): string {
  const items = WEEKDAYS.map((w) => {
    const b = businessOf(business, w);
    const value = b ? intervalText({ startMin: b.opensAtMin, endMin: b.closesAtMin }) : null;
    return { weekday: w, key: value ?? 'closed', value };
  });
  return groups(items)
    .map((g) =>
      g.value === null ? closed(daysText(g.days, short)) : `${daysText(g.days, short)} ${g.value}`,
    )
    .join(' · ');
}

/* ── dates ──────────────────────────────────────────────────────────────────────────────── */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A local date „YYYY-MM-DD” as a Date at noon UTC (for Intl with timeZone UTC and DatePicker). */
export function dateOf(value: string): Date {
  const m = DATE_RE.exec(value);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)) : new Date(NaN);
}

/** A Date picked in the DatePicker (local midnight) → „YYYY-MM-DD”. */
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The DatePicker shows a local Date: „YYYY-MM-DD” → local midnight. */
export function pickerDate(value: string): Date | null {
  const m = DATE_RE.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

export function weekdayOfDate(value: string): number {
  const d = dateOf(value).getUTCDay();
  return d === 0 ? 7 : d;
}

/** The days of a leave, both ends included (0 when „Până la” is before „De la”). */
export function leaveDays(from: string, to: string): number {
  const n = Math.round((dateOf(to).getTime() - dateOf(from).getTime()) / 86_400_000) + 1;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** The leave dialog, as the server checks it (requireLocalDate, then the order and the length). */
export function validateTimeOff(
  from: string,
  to: string,
): { field: 'startsOn' | 'endsOn'; code: 'required' | 'leave_order' | 'too_long' } | null {
  if (!DATE_RE.test(from)) return { field: 'startsOn', code: 'required' };
  if (!DATE_RE.test(to)) return { field: 'endsOn', code: 'required' };
  const n = leaveDays(from, to);
  if (n < 1) return { field: 'endsOn', code: 'leave_order' };
  if (n > TEAM_LIMITS.timeOffDays) return { field: 'endsOn', code: 'too_long' };
  return null;
}

/** „one” / „few” / „many”: the Romanian forms of the keys (1 · 0 and 2–19 · 20+). */
export function pluralOf(n: number): 'one' | 'few' | 'many' {
  if (n === 1) return 'one';
  const r = n % 100;
  return n === 0 || (r > 0 && r < 20) ? 'few' : 'many';
}
