import { describe, it, expect } from 'vitest';
import {
  ceilToStep,
  hhmm,
  isFreeAt,
  memberSlots,
  type Busy,
  type SlotRules,
} from '../server/slots';

/*
 * Lot B.5 — the free start times of one member on one date, without the database (plan
 * reports/2026-11-10_1115_plan-booking-b5.md §3, §4.1, §10). Local minutes: 540 = 09:00.
 */

const S = 'svc-1';
const OTHER = 'svc-2';
const day = [{ startMin: 540, endMin: 1080 }]; // 09:00–18:00

function rules(over: Partial<SlotRules> = {}): SlotRules {
  return {
    serviceId: S,
    durationMin: 60,
    capacity: 1,
    bufferMin: 0,
    earliestMin: null,
    ...over,
  };
}

const times = (slots: Array<{ startMin: number; available: boolean }>, onlyFree = false) =>
  slots.filter((s) => !onlyFree || s.available).map((s) => hhmm(s.startMin));

describe('B.5 — the grid (D-B5-1 = a)', () => {
  it('a closed day (no intervals) has no start', () => {
    expect(memberSlots([], [], rules())).toEqual([]);
  });

  it('from the start of the day, step = the duration (45 min: 09:00, 09:45 … 17:15)', () => {
    const t = times(memberSlots(day, [], rules({ durationMin: 45 })));
    expect(t[0]).toBe('09:00');
    expect(t[1]).toBe('09:45');
    expect(t.at(-1)).toBe('17:15');
    expect(t).toHaveLength(12);
  });

  it('the pause between two intervals stays free; a start fits only inside one interval', () => {
    const split = [
      { startMin: 540, endMin: 780 },
      { startMin: 840, endMin: 1080 },
    ];
    const t = times(memberSlots(split, [], rules()));
    expect(t).toEqual(['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00']);
  });

  it('a taken grid time stays listed, not available; after the appointment the grid goes on', () => {
    const busy: Busy[] = [{ startMin: 630, endMin: 675, serviceId: S }]; // 10:30–11:15
    const slots = memberSlots(day, busy, rules({ durationMin: 45 }));
    expect(slots.find((s) => s.startMin === 630)).toEqual({ startMin: 630, available: false });
    expect(slots.find((s) => s.startMin === 675)).toEqual({ startMin: 675, available: true });
  });

  it('right after an appointment that ends off the grid (no small gap lost)', () => {
    const busy: Busy[] = [{ startMin: 540, endMin: 570, serviceId: OTHER }]; // 09:00–09:30
    const free = times(memberSlots(day, busy, rules()), true);
    expect(free[0]).toBe('09:30');
    expect(free).toContain('10:30');
  });

  it('a variable duration: a shorter one gives more starts (S123-3)', () => {
    const long = memberSlots(day, [], rules({ durationMin: 120 }));
    const short = memberSlots(day, [], rules({ durationMin: 60 }));
    expect(short.length).toBeGreaterThan(long.length);
  });
});

describe('B.5 — what occupies the member', () => {
  it('ends that touch ([)) are free; an overlap is not', () => {
    const busy: Busy[] = [{ startMin: 600, endMin: 660, serviceId: S }];
    expect(isFreeAt(day, busy, rules(), 540)).toBe(true); // 09:00–10:00 touches 10:00
    expect(isFreeAt(day, busy, rules(), 660)).toBe(true);
    expect(isFreeAt(day, busy, rules(), 630)).toBe(false);
  });

  it('a blocked time occupies, without a buffer and never shared', () => {
    const busy: Busy[] = [{ startMin: 600, endMin: 660, serviceId: null }];
    const r = rules({ bufferMin: 10, capacity: 5 });
    expect(isFreeAt(day, busy, r, 600)).toBe(false);
    expect(isFreeAt(day, busy, r, 660)).toBe(true);
    expect(isFreeAt(day, busy, r, 540)).toBe(true);
  });

  it('another service overlapping is never shared, whatever the capacity', () => {
    const busy: Busy[] = [{ startMin: 600, endMin: 660, serviceId: OTHER }];
    expect(isFreeAt(day, busy, rules({ capacity: 3 }), 600)).toBe(false);
  });
});

describe('B.5 — the capacity (D-B4-3 = a)', () => {
  it('capacity 2: the same time stays free once, then it is full', () => {
    const one: Busy[] = [{ startMin: 600, endMin: 660, serviceId: S }];
    const two: Busy[] = [...one, { startMin: 600, endMin: 660, serviceId: S }];
    expect(isFreeAt(day, one, rules({ capacity: 2 }), 600)).toBe(true);
    expect(isFreeAt(day, two, rules({ capacity: 2 }), 600)).toBe(false);
  });

  it('every overlap counts, as in the trigger (10:00 and 10:40 → 10:20 is full at capacity 2)', () => {
    const busy: Busy[] = [
      { startMin: 600, endMin: 660, serviceId: S },
      { startMin: 640, endMin: 700, serviceId: S },
    ];
    expect(isFreeAt(day, busy, rules({ capacity: 2 }), 620)).toBe(false);
  });

  it('at capacity 2 the start of an appointment of the same service is offered to share it', () => {
    const busy: Busy[] = [{ startMin: 610, endMin: 670, serviceId: S }]; // 10:10, off the grid
    const free = times(memberSlots(day, busy, rules({ capacity: 2 })), true);
    expect(free).toContain('10:10');
  });
});

describe('B.5 — the buffer between appointments (D-B5-2 = a)', () => {
  const busy: Busy[] = [{ startMin: 600, endMin: 660, serviceId: OTHER }]; // 10:00–11:00
  const r = rules({ bufferMin: 10 });

  it('no start closer than 10 minutes before or after an appointment', () => {
    expect(isFreeAt(day, busy, r, 540)).toBe(false); // ends 10:00, no buffer before
    expect(isFreeAt(day, busy, r, 660)).toBe(false); // starts 11:00, no buffer after
    expect(isFreeAt(day, busy, r, 670)).toBe(true);
  });

  it('the grid continues after the appointment and its buffer (11:10)', () => {
    const free = times(memberSlots(day, busy, r), true);
    expect(free).toContain('11:10');
    expect(free).not.toContain('11:00');
  });

  it('not at the edges of the schedule', () => {
    expect(isFreeAt(day, [], r, 540)).toBe(true);
    expect(isFreeAt(day, [], r, 1020)).toBe(true); // 17:00–18:00
  });

  it('the same service without an overlap keeps the buffer too (capacity 1)', () => {
    const same: Busy[] = [{ startMin: 600, endMin: 660, serviceId: S }];
    expect(isFreeAt(day, same, r, 665)).toBe(false);
  });
});

describe('B.5 — now and the notice (D-B5-3 = a)', () => {
  it('nothing before the earliest minute; those starts are not listed at all', () => {
    const slots = memberSlots(day, [], rules({ earliestMin: 725 }));
    expect(times(slots)[0]).toBe('13:00');
    expect(slots.every((s) => s.startMin >= 725)).toBe(true);
  });

  it('a date in the past (earliest > 1440) has nothing', () => {
    expect(memberSlots(day, [], rules({ earliestMin: 1441 }))).toEqual([]);
  });
});

describe('B.5 — helpers', () => {
  it('hhmm and the 5-minute step', () => {
    expect(hhmm(0)).toBe('00:00');
    expect(hhmm(545)).toBe('09:05');
    expect(ceilToStep(541)).toBe(545);
    expect(ceilToStep(545)).toBe(545);
  });
});
