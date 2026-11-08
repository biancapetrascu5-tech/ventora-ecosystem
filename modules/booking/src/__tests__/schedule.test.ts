import { describe, it, expect } from 'vitest';
import { InvalidInput } from '@ventora/errors';
import {
  DEFAULT_BUSINESS_WEEK,
  clipToBusiness,
  normalizeReason,
  requireLocalDate,
  dayAvailability,
  daysBetween,
  eachDate,
  intersect,
  isLocalDate,
  validateBusinessWeek,
  validateStaffWeek,
  validateWorkDay,
  weekdayOf,
  type WorkDay,
} from '../server/schedule';

// Lot B.2 — the schedule rules without the database (plan §1.2–1.3, D-B2-2 = a, D-B2-3 = a).

function reasonOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    if (e instanceof InvalidInput) return e.message;
    throw e;
  }
}

function fieldOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    if (e instanceof InvalidInput) return e.field;
    throw e;
  }
}

const open = (weekday: number, opensAtMin = 540, closesAtMin = 1080) => ({
  weekday,
  isOpen: true,
  opensAtMin,
  closesAtMin,
});

describe('B.2 — dates', () => {
  it('real local dates only; ISO weekday; inclusive ranges', () => {
    expect(isLocalDate('2026-11-09')).toBe(true);
    expect(isLocalDate('2026-02-30')).toBe(false);
    expect(isLocalDate('2026-1-09')).toBe(false);
    expect(isLocalDate(20261109)).toBe(false);
    expect(weekdayOf('2026-11-09')).toBe(1); // Monday
    expect(weekdayOf('2026-11-15')).toBe(7); // Sunday
    expect(daysBetween('2026-11-09', '2026-11-09')).toBe(1);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(3); // across the summer-time change
    expect(eachDate('2026-10-24', '2026-10-26')).toEqual([
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
    ]);
  });
});

describe('B.2 — the business week', () => {
  it('7 distinct weekdays, closed or one interval in steps of 5', () => {
    const week = [1, 2, 3, 4, 5, 6, 7].map((d) => open(d));
    expect(validateBusinessWeek(week)).toHaveLength(7);
    expect(fieldOf(() => validateBusinessWeek(week.slice(0, 6)))).toBe('days');
    expect(fieldOf(() => validateBusinessWeek([...week.slice(0, 6), open(1)]))).toBe('days');
    expect(fieldOf(() => validateBusinessWeek([...week.slice(0, 6), open(7, 600, 600)]))).toBe(
      'days.7.hours',
    );
    expect(fieldOf(() => validateBusinessWeek([...week.slice(0, 6), open(7, 601, 900)]))).toBe(
      'days.7.hours',
    );
    expect(fieldOf(() => validateBusinessWeek([...week.slice(0, 6), open(7, 600, 1445)]))).toBe(
      'days.7.hours',
    );
    const closed = validateBusinessWeek([
      ...week.slice(0, 6),
      { weekday: 7, isOpen: false, opensAtMin: 1, closesAtMin: 2 },
    ]);
    expect(closed[6]).toEqual({ weekday: 7, isOpen: false, opensAtMin: null, closesAtMin: null });
  });

  it('the default (D-B2-5 = a): Mon–Fri 9–18, Sat 10–14, Sun closed', () => {
    expect(DEFAULT_BUSINESS_WEEK.map((d) => [d.opensAtMin, d.closesAtMin])).toEqual([
      [540, 1080],
      [540, 1080],
      [540, 1080],
      [540, 1080],
      [540, 1080],
      [600, 840],
      [null, null],
    ]);
  });
});

describe('B.2 — a working day (D-B2-3 = a: at most two intervals)', () => {
  it('off, one interval, two ordered intervals with a real break', () => {
    expect(validateWorkDay('d', { isWorking: false })).toEqual({ isWorking: false, intervals: [] });
    expect(
      validateWorkDay('d', { isWorking: true, intervals: [{ startMin: 540, endMin: 780 }] }),
    ).toEqual({ isWorking: true, intervals: [{ startMin: 540, endMin: 780 }] });
    expect(
      validateWorkDay('d', {
        isWorking: true,
        intervals: [
          { startMin: 540, endMin: 780 },
          { startMin: 840, endMin: 1080 },
        ],
      }).intervals,
    ).toHaveLength(2);
    const bad = [
      { isWorking: true, intervals: [] },
      { isWorking: true, intervals: [{ startMin: 540, endMin: 540 }] },
      { isWorking: true, intervals: [{ startMin: 541, endMin: 600 }] },
      {
        isWorking: true,
        intervals: [
          { startMin: 540, endMin: 780 },
          { startMin: 780, endMin: 900 },
        ],
      },
      {
        isWorking: true,
        intervals: [
          { startMin: 840, endMin: 900 },
          { startMin: 540, endMin: 600 },
        ],
      },
      {
        isWorking: true,
        intervals: [
          { startMin: 480, endMin: 540 },
          { startMin: 600, endMin: 660 },
          { startMin: 720, endMin: 780 },
        ],
      },
      { isWorking: false, intervals: [{ startMin: 540, endMin: 600 }] },
    ];
    for (const day of bad) expect(fieldOf(() => validateWorkDay('d', day))).toBe('d.intervals');
    expect(fieldOf(() => validateWorkDay('d', { isWorking: 'yes' }))).toBe('d.isWorking');
  });

  it('the member week needs the 7 weekdays', () => {
    const days = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, isWorking: false }));
    expect(validateStaffWeek(days, DEFAULT_BUSINESS_WEEK)).toHaveLength(7);
    expect(fieldOf(() => validateStaffWeek(days.slice(1), DEFAULT_BUSINESS_WEEK))).toBe('days');
  });

  it('the reason of each refusal, for the texts of S124', () => {
    const one = (startMin: number, endMin: number) => ({
      isWorking: true,
      intervals: [{ startMin, endMin }],
    });
    expect(reasonOf(() => validateWorkDay('d', one(600, 540)))).toBe('order');
    expect(
      reasonOf(() =>
        validateWorkDay('d', {
          isWorking: true,
          intervals: [
            { startMin: 540, endMin: 780 },
            { startMin: 700, endMin: 900 },
          ],
        }),
      ),
    ).toBe('overlap');
    // the default week: Mon 09–18, Sun closed
    const week = (day: Record<string, unknown>) =>
      [1, 2, 3, 4, 5, 6, 7].map((weekday) =>
        weekday === day.weekday ? day : { weekday, isWorking: false },
      );
    expect(
      reasonOf(() =>
        validateStaffWeek(week({ weekday: 1, ...one(480, 600) }), DEFAULT_BUSINESS_WEEK),
      ),
    ).toBe('before_open');
    expect(
      reasonOf(() =>
        validateStaffWeek(week({ weekday: 1, ...one(600, 1140) }), DEFAULT_BUSINESS_WEEK),
      ),
    ).toBe('after_close');
    expect(
      reasonOf(() =>
        validateStaffWeek(week({ weekday: 7, ...one(600, 700) }), DEFAULT_BUSINESS_WEEK),
      ),
    ).toBe('business_closed');
    expect(
      fieldOf(() =>
        validateStaffWeek(week({ weekday: 7, ...one(600, 700) }), DEFAULT_BUSINESS_WEEK),
      ),
    ).toBe('days.7');
    expect(reasonOf(() => requireLocalDate('startsOn', undefined))).toBe('required');
    expect(reasonOf(() => normalizeReason('x'.repeat(201)))).toBe('too_long');
    expect(normalizeReason('  Nunta surorii  ')).toBe('Nunta surorii');
    expect(normalizeReason('   ')).toBeNull();
  });
});

describe('B.2 — cutting to the business hours (S124)', () => {
  const mon = DEFAULT_BUSINESS_WEEK[0]; // 09–18
  it('keeps what is inside, reports a change, turns an empty day off', () => {
    const inside = { isWorking: true, intervals: [{ startMin: 600, endMin: 900 }] };
    expect(clipToBusiness(inside, mon)).toEqual({ day: inside, changed: false });
    expect(
      clipToBusiness(
        {
          isWorking: true,
          intervals: [
            { startMin: 480, endMin: 780 },
            { startMin: 840, endMin: 1200 },
          ],
        },
        mon,
      ),
    ).toEqual({
      day: {
        isWorking: true,
        intervals: [
          { startMin: 540, endMin: 780 },
          { startMin: 840, endMin: 1080 },
        ],
      },
      changed: true,
    });
    expect(clipToBusiness(inside, DEFAULT_BUSINESS_WEEK[6])).toEqual({
      day: { isWorking: false, intervals: [] },
      changed: true,
    });
    expect(clipToBusiness({ isWorking: false, intervals: [] }, mon).changed).toBe(false);
  });
});

describe('B.2 — the availability of a day (plan §1.3)', () => {
  const business = validateBusinessWeek([
    open(1),
    open(2),
    open(3),
    open(4),
    open(5),
    open(6, 600, 840),
    { weekday: 7, isOpen: false },
  ]);
  const week = new Map<number, WorkDay>([
    [1, { isWorking: true, intervals: [{ startMin: 480, endMin: 1200 }] }],
    [
      2,
      {
        isWorking: true,
        intervals: [
          { startMin: 600, endMin: 780 },
          { startMin: 840, endMin: 1020 },
        ],
      },
    ],
    [3, { isWorking: false, intervals: [] }],
    [7, { isWorking: true, intervals: [{ startMin: 600, endMin: 720 }] }],
  ]);
  const base = {
    business,
    scheduleMode: 'custom' as const,
    weekly: week,
    override: undefined,
    onLeave: false,
  };

  it('the member week, cut to the business hours (D-B2-2 = a)', () => {
    // Monday 08:00–20:00 for the member, the business 09:00–18:00
    expect(dayAvailability({ ...base, date: '2026-11-09' })).toEqual([
      { startMin: 540, endMin: 1080 },
    ]);
    // Tuesday with a break
    expect(dayAvailability({ ...base, date: '2026-11-10' })).toEqual([
      { startMin: 600, endMin: 780 },
      { startMin: 840, endMin: 1020 },
    ]);
    // Wednesday off; Thursday has no row → off
    expect(dayAvailability({ ...base, date: '2026-11-11' })).toEqual([]);
    expect(dayAvailability({ ...base, date: '2026-11-12' })).toEqual([]);
    // Sunday: the member would work, the business is closed
    expect(dayAvailability({ ...base, date: '2026-11-15' })).toEqual([]);
  });

  it('schedule_mode business follows the business week', () => {
    expect(dayAvailability({ ...base, scheduleMode: 'business', date: '2026-11-14' })).toEqual([
      { startMin: 600, endMin: 840 },
    ]);
  });

  it('a leave beats an exception, an exception beats the week', () => {
    const override: WorkDay = { isWorking: true, intervals: [{ startMin: 720, endMin: 900 }] };
    expect(dayAvailability({ ...base, date: '2026-11-11', override })).toEqual([
      { startMin: 720, endMin: 900 },
    ]);
    expect(
      dayAvailability({
        ...base,
        date: '2026-11-09',
        override: { isWorking: false, intervals: [] },
      }),
    ).toEqual([]);
    expect(dayAvailability({ ...base, date: '2026-11-09', override, onLeave: true })).toEqual([]);
  });

  it('intersect keeps only the overlap', () => {
    expect(
      intersect(
        [
          { startMin: 0, endMin: 600 },
          { startMin: 700, endMin: 900 },
        ],
        [{ startMin: 500, endMin: 800 }],
      ),
    ).toEqual([
      { startMin: 500, endMin: 600 },
      { startMin: 700, endMin: 800 },
    ]);
  });
});
