import type { Interval } from './schedule';

/*
 * Lot B.5 — the free start times of one member on one local date, without the database (plan
 * reports/2026-11-10_1115_plan-booking-b5.md §3–§4, approved 10.11.2026). Everything is in local
 * wall-clock minutes of the date (0–1440, steps of 5), like the schedule of B.2; the caller turns
 * the result into instants in Postgres (AT TIME ZONE).
 *
 * A start t is free for the member when [t, t + duration):
 *   1. lies inside one interval of the member's day (the pause between two intervals stays free);
 *   2. overlaps no active blocked time;
 *   3. overlaps no occupying appointment of another service;
 *   4. overlaps fewer occupying appointments of the same service than the capacity (every
 *      overlap counts, as in the trigger appointment_guard);
 *   5. keeps the buffer (booking.settings.buffer_min, D-B5-2 = a) from every appointment it does
 *      not share — another service, or the same service without an overlap — before and after;
 *      not at the edges of the schedule;
 *   6. is not before `earliestMin` (now, plus the notice for online, D-B5-3 = a).
 *
 * The grid (D-B5-1 = a): from the start of each interval, step = the duration; plus right after
 * each appointment or blocked time (and its buffer), again step = the duration; plus, at capacity
 * 2 or more, the start of each appointment of the same service (to share it). Grid times from the
 * interval starts that are taken stay in the list, not available (the design shows them struck
 * through); the others are listed only when free. B.3b adds the resources as more `busy` rows,
 * each with its own capacity (D-B5-8 = a).
 */

/** Something that holds the member's time on the date (local minutes, cut to the date). */
export type Busy = {
  startMin: number;
  endMin: number;
  /** null = a blocked time (no buffer, never shared). */
  serviceId: string | null;
};

export type SlotRules = {
  serviceId: string;
  durationMin: number;
  /** service.capacity: clients at once with the same member, for the same service (D-B4-3). */
  capacity: number;
  bufferMin: number;
  /** No start before this minute of the date (null = none; > 1440 = the whole date is past). */
  earliestMin: number | null;
};

export type MemberSlot = { startMin: number; available: boolean };

const overlaps = (a: number, b: number, c: number, d: number) => a < d && c < b;

/** Is the start `t` free for the member (rules 1–6)? */
export function isFreeAt(
  intervals: readonly Interval[],
  busy: readonly Busy[],
  rules: SlotRules,
  t: number,
): boolean {
  const end = t + rules.durationMin;
  if (rules.earliestMin !== null && t < rules.earliestMin) return false;
  if (!intervals.some((i) => i.startMin <= t && end <= i.endMin)) return false;
  let shared = 0;
  for (const b of busy) {
    if (b.serviceId === null) {
      if (overlaps(t, end, b.startMin, b.endMin)) return false;
      continue;
    }
    if (b.serviceId === rules.serviceId && overlaps(t, end, b.startMin, b.endMin)) {
      shared += 1;
      continue;
    }
    if (overlaps(t - rules.bufferMin, end + rules.bufferMin, b.startMin, b.endMin)) return false;
  }
  return shared < rules.capacity;
}

/** The member's start times on the date, in order (D-B5-1 = a). */
export function memberSlots(
  intervals: readonly Interval[],
  busy: readonly Busy[],
  rules: SlotRules,
): MemberSlot[] {
  const d = rules.durationMin;
  const grid = new Set<number>();
  const extra = new Set<number>();
  const chain = (from: number, into: Set<number>) => {
    for (const i of intervals) {
      if (from < i.startMin || from >= i.endMin) continue;
      for (let t = from; t + d <= i.endMin; t += d) into.add(t);
    }
  };
  for (const i of intervals) chain(i.startMin, grid);
  for (const b of busy) {
    const after = b.endMin + (b.serviceId === null ? 0 : rules.bufferMin);
    chain(after, extra);
    if (b.serviceId === rules.serviceId && rules.capacity > 1) chain(b.startMin, extra);
  }
  const out: MemberSlot[] = [];
  for (const t of new Set([...grid, ...extra])) {
    // a start before the earliest is not listed at all (past, or inside the notice)
    if (rules.earliestMin !== null && t < rules.earliestMin) continue;
    const available = isFreeAt(intervals, busy, rules, t);
    if (available || grid.has(t)) out.push({ startMin: t, available });
  }
  return out.sort((a, b) => a.startMin - b.startMin);
}

/** 'HH:MM' of a local minute. */
export function hhmm(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

/** The first multiple of 5 at or after `minute`. */
export function ceilToStep(minute: number, step = 5): number {
  return Math.ceil(minute / step) * step;
}
