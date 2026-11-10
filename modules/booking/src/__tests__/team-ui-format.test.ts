import { describe, expect, it } from 'vitest';
import {
  businessText,
  breakOf,
  leaveDays,
  timeToMin,
  validateDay,
  validateTimeOff,
  weekText,
  type BusinessDayData,
  type DayForm,
} from '../ui/team/team-format';
import { requireWithinBusiness, validateWorkDay, type BusinessDay } from '../server/schedule';

/* Lot B.2-UI — the pure rules of BookingTeamSchedule (S124), with the example data of preview.html,
   and the client validation compared with the server's on the same days. */

const SHORT = ['', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm', 'Dum'];
const short = (w: number) => SHORT[w] ?? '';
const iv = (a: number, b: number) => ({ startMin: a, endMin: b });
const H = (h: number, m = 0) => h * 60 + m;

// preview.html BIZ: Lun–Mie 09–19, Joi–Vin 09–20, Sâm 10–16, Dum închis
const BIZ: BusinessDayData[] = [1, 2, 3, 4, 5, 6, 7].map((weekday) =>
  weekday <= 3
    ? { weekday, isOpen: true, opensAtMin: H(9), closesAtMin: H(19) }
    : weekday <= 5
      ? { weekday, isOpen: true, opensAtMin: H(9), closesAtMin: H(20) }
      : weekday === 6
        ? { weekday, isOpen: true, opensAtMin: H(10), closesAtMin: H(16) }
        : { weekday, isOpen: false, opensAtMin: null, closesAtMin: null },
);

describe('BookingTeamSchedule — the lines of the list', () => {
  it('the business: „Lun–Mie 09:00–19:00 · Joi–Vin 09:00–20:00 · Sâm 10:00–16:00 · Dum închis”', () => {
    expect(businessText(BIZ, short, (d) => `${d} închis`)).toBe(
      'Lun–Mie 09:00–19:00 · Joi–Vin 09:00–20:00 · Sâm 10:00–16:00 · Dum închis',
    );
  });

  it('a week: the days with the same intervals are grouped, runs with „–”, the rest with „, ”', () => {
    const ioana = [1, 2, 3, 4, 5]
      .map((weekday) => ({ weekday, intervals: [iv(H(9), H(13)), iv(H(14), H(18))] }))
      .concat([
        { weekday: 6, intervals: [iv(H(10), H(14))] },
        { weekday: 7, intervals: [] },
      ]);
    expect(weekText(ioana, short)).toBe('Lun–Vin 09:00–13:00, 14:00–18:00 · Sâm 10:00–14:00');
    const diana = [1, 3, 5].map((weekday) => ({ weekday, intervals: [iv(H(9), H(17))] }));
    expect(weekText(diana, short)).toBe('Lun, Mie, Vin 09:00–17:00');
    const radu = [1, 2, 3]
      .map((weekday) => ({ weekday, intervals: [iv(H(12), H(19))] }))
      .concat([4, 5].map((weekday) => ({ weekday, intervals: [iv(H(12), H(20))] })));
    expect(weekText(radu, short)).toBe('Lun–Mie 12:00–19:00 · Joi–Vin 12:00–20:00');
    expect(weekText([], short)).toBe('');
  });

  it('the break and the times', () => {
    const day: DayForm = {
      on: true,
      intervals: [
        { from: '09:00', to: '13:00' },
        { from: '14:00', to: '18:00' },
      ],
    };
    expect(breakOf(day)).toEqual({ from: '13:00', to: '14:00' });
    expect(timeToMin('09:05')).toBe(545);
    expect(timeToMin('09:07')).toBeNull(); // the 5-minute step (decision 1)
    expect(timeToMin('24:00')).toBe(1440);
    expect(timeToMin('25:00')).toBeNull();
  });

  it('a leave: the days, both ends included; „Până la” not before „De la”', () => {
    expect(leaveDays('2026-11-16', '2026-11-20')).toBe(5);
    expect(leaveDays('2026-11-16', '2026-11-16')).toBe(1);
    expect(validateTimeOff('2026-11-16', '2026-11-12')).toEqual({
      field: 'endsOn',
      code: 'leave_order',
    });
    expect(validateTimeOff('', '2026-11-12')).toEqual({ field: 'startsOn', code: 'required' });
    expect(validateTimeOff('2026-01-01', '2027-01-02')).toEqual({
      field: 'endsOn',
      code: 'too_long',
    });
    expect(validateTimeOff('2026-11-16', '2026-11-20')).toBeNull();
  });
});

describe('BookingTeamSchedule — the client validation is the server validation', () => {
  /** The reason of the server for a day (null when it saves). */
  function server(day: DayForm, weekday: number): string | null {
    const raw = day.on
      ? {
          isWorking: true,
          intervals: day.intervals.map((i) => ({
            startMin: timeToMin(i.from),
            endMin: timeToMin(i.to),
          })),
        }
      : { isWorking: false };
    try {
      const wd = validateWorkDay('d', raw);
      requireWithinBusiness('d', wd, BIZ.find((b) => b.weekday === weekday) as BusinessDay);
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  }
  function client(day: DayForm, weekday: number): string | null {
    const b = BIZ.find((x) => x.weekday === weekday);
    const bounds =
      b && b.isOpen && b.opensAtMin !== null && b.closesAtMin !== null
        ? { opensAtMin: b.opensAtMin, closesAtMin: b.closesAtMin }
        : null;
    const err = validateDay(day, bounds);
    if (!err) return null;
    if (err.code === 'invalid') return bounds ? 'invalid' : 'business_closed';
    return err.code;
  }
  const on = (...pairs: [string, string][]): DayForm => ({
    on: true,
    intervals: pairs.map(([from, to]) => ({ from, to })),
  });

  // preview.html ERRS and a few more: [day, weekday, the reason]
  const CASES: [DayForm, number, string | null][] = [
    [on(['09:00', '13:00'], ['14:00', '18:00']), 1, null],
    [on(['08:00', '13:00'], ['14:00', '18:00']), 4, 'before_open'], // joi la 08:00
    [on(['09:00', '13:00'], ['12:30', '18:00']), 5, 'overlap'], // vineri
    [on(['10:00', '17:00']), 6, 'after_close'], // sâmbătă până la 17:00
    [on(['13:00', '13:00']), 2, 'order'],
    [on(['14:00', '12:00']), 2, 'order'],
    [on(['09:00', '13:00'], ['13:00', '18:00']), 1, 'overlap'], // the second starts at the first's end
    [on(['10:00', '12:00']), 7, 'business_closed'], // duminică: închis
    [{ on: false, intervals: [] }, 7, null],
    [on(['09:00', '19:00']), 3, null],
    [on(['08:00', '07:00']), 1, 'order'], // the order before the business
    [on(['09:00', '10:00'], ['11:00', '12:00'], ['13:00', '14:00']), 1, 'too_many'],
  ];

  it.each(CASES)('case %#', (day, weekday, reason) => {
    const c = client(day, weekday);
    const s = server(day, weekday);
    // three intervals: the client calls it „invalid”, the server „too_many” — both refuse
    if (reason === 'too_many') {
      expect(s).toBe('too_many');
      expect(c).toBe('invalid');
      return;
    }
    expect(s).toBe(reason);
    expect(c).toBe(reason);
  });
});
