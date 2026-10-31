/**
 * Lot 3.2 (D3-3): the anchor day of a subscription is the day it started. Billing and the reset of
 * flow quotas fall on that day each month; for 29–31, on the last day of shorter months. On a
 * yearly subscription, billing is yearly (same month and day, clamped the same way) but the flow
 * quotas still reset monthly on the anchor day. Dates are calendar days ('YYYY-MM-DD') in the
 * platform's time zone, never instants: the anchor does not move with daylight saving.
 */

import type { BillingInterval } from '@ventora/contracts';

/** Calendar dates are counted in the platform's home time zone (as the e-mails, Lot 2.x). */
export const BILLING_TIME_ZONE = 'Europe/Bucharest';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parse(date: string): { y: number; m: number; d: number } {
  const match = DATE_RE.exec(date);
  if (!match) throw new Error(`[commercial] not a calendar date: ${date}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

const pad = (n: number) => String(n).padStart(2, '0');
const format = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The anchor day in a given month: the day itself, or the month's last day if it is shorter. */
export function anchorDateIn(year: number, month: number, anchorDay: number): string {
  return format(year, month, Math.min(anchorDay, daysInMonth(year, month)));
}

/** The calendar date of an instant in the platform's time zone. */
export function calendarDate(at: Date, timeZone = BILLING_TIME_ZONE): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

export function anchorDayOf(startedOn: string): number {
  return parse(startedOn).d;
}

function addMonths(year: number, month: number, n: number): { y: number; m: number } {
  const total = year * 12 + (month - 1) + n;
  return { y: Math.floor(total / 12), m: (total % 12) + 1 };
}

/**
 * The billing dates of a subscription, from the start: `count` of them. Monthly: every month on
 * the anchor day; yearly: every year in the start month. Started on the 31st → 31 Jan, 28/29 Feb,
 * 31 Mar, 30 Apr.
 */
export function billingDates(
  subscription: { startedOn: string; interval: BillingInterval },
  count: number,
): string[] {
  const { y, m, d } = parse(subscription.startedOn);
  const step = subscription.interval === 'year' ? 12 : 1;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const at = addMonths(y, m, i * step);
    out.push(anchorDateIn(at.y, at.m, d));
  }
  return out;
}

/** The next billing date strictly after `onDate` (the start itself counts as the first one). */
export function nextBillingDate(
  subscription: { startedOn: string; interval: BillingInterval },
  onDate: string,
): string {
  const { y, m, d } = parse(subscription.startedOn);
  if (subscription.startedOn > onDate) return subscription.startedOn;
  const step = subscription.interval === 'year' ? 12 : 1;
  const on = parse(onDate);
  // start near onDate, then walk forward
  let i = Math.max(0, Math.floor(((on.y - y) * 12 + (on.m - m)) / step) - 1);
  for (;;) {
    const at = addMonths(y, m, i * step);
    const date = anchorDateIn(at.y, at.m, d);
    if (date > onDate) return date;
    i++;
  }
}

/**
 * The monthly quota period that contains `onDate` (for flow quotas, on monthly and yearly
 * subscriptions alike): from the latest anchor date on or before it (not before the start) to
 * the next one, exclusive.
 */
export function quotaPeriod(startedOn: string, onDate: string): { start: string; end: string } {
  const monthly = { startedOn, interval: 'month' as const };
  const end = nextBillingDate(monthly, onDate);
  if (startedOn > onDate) return { start: startedOn, end: nextBillingDate(monthly, startedOn) };
  const e = parse(end);
  const prev = addMonths(e.y, e.m, -1);
  const start = anchorDateIn(prev.y, prev.m, parse(startedOn).d);
  return { start: start < startedOn ? startedOn : start, end };
}

/** The instant a calendar date starts in the platform's time zone (for ends_at columns). */
export function startOfDay(date: string, timeZone = BILLING_TIME_ZONE): Date {
  const { y, m, d } = parse(date);
  const midnightUtc = Date.UTC(y, m - 1, d);
  // the zone's offset near local midnight, checked again at the result (DST days)
  const first = midnightUtc - offsetAt(new Date(midnightUtc), timeZone);
  return new Date(midnightUtc - offsetAt(new Date(first), timeZone));
}

function offsetAt(at: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}
