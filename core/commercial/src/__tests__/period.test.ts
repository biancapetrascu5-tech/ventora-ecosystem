import { describe, it, expect } from 'vitest';
import {
  anchorDateIn,
  billingDates,
  calendarDate,
  nextBillingDate,
  quotaPeriod,
  startOfDay,
} from '../period';

// Lot 3.2 (D3-3): billing and the reset of flow quotas on the anchor day — the day the
// subscription started; 29–31 → the last day of shorter months; monthly resets on yearly too.

describe('Lot 3.2 — the anchor day (D3-3)', () => {
  it('started on the 31st: billed on 30 April and on 28 February (29 in a leap year)', () => {
    expect(billingDates({ startedOn: '2027-01-31', interval: 'month' }, 5)).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
      '2027-05-31',
    ]);
    expect(billingDates({ startedOn: '2028-01-31', interval: 'month' }, 2)).toEqual([
      '2028-01-31',
      '2028-02-29',
    ]);
  });

  it('the anchor comes back to the 31st after a short month (no drift to the 28th)', () => {
    expect(nextBillingDate({ startedOn: '2027-01-31', interval: 'month' }, '2027-02-28')).toBe(
      '2027-03-31',
    );
  });

  it('started on the 29th or 30th: the last day of February', () => {
    expect(anchorDateIn(2027, 2, 29)).toBe('2027-02-28');
    expect(anchorDateIn(2027, 2, 30)).toBe('2027-02-28');
    expect(anchorDateIn(2028, 2, 30)).toBe('2028-02-29');
    expect(anchorDateIn(2027, 4, 15)).toBe('2027-04-15');
  });

  it('yearly: billed every year in the start month, clamped the same way', () => {
    expect(billingDates({ startedOn: '2028-02-29', interval: 'year' }, 3)).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
    ]);
    expect(nextBillingDate({ startedOn: '2027-03-15', interval: 'year' }, '2027-11-01')).toBe(
      '2028-03-15',
    );
  });

  it('the next billing date is strictly after the given day; before the start, the start', () => {
    const sub = { startedOn: '2027-01-15', interval: 'month' as const };
    expect(nextBillingDate(sub, '2027-01-15')).toBe('2027-02-15');
    expect(nextBillingDate(sub, '2027-02-14')).toBe('2027-02-15');
    expect(nextBillingDate(sub, '2026-12-01')).toBe('2027-01-15');
  });

  it('flow quotas reset monthly on the anchor day, on yearly subscriptions too', () => {
    expect(quotaPeriod('2027-01-31', '2027-03-15')).toEqual({
      start: '2027-02-28',
      end: '2027-03-31',
    });
    expect(quotaPeriod('2027-01-31', '2027-01-31')).toEqual({
      start: '2027-01-31',
      end: '2027-02-28',
    });
    // a yearly subscription started on 15 March still resets on the 15th every month
    expect(quotaPeriod('2027-03-15', '2027-11-20')).toEqual({
      start: '2027-11-15',
      end: '2027-12-15',
    });
  });

  it('calendar days are in the platform time zone (Europe/Bucharest)', () => {
    // 22:30 UTC on 30 April is already 1 May in Bucharest (UTC+3 in summer)
    expect(calendarDate(new Date('2027-04-30T22:30:00Z'))).toBe('2027-05-01');
    expect(startOfDay('2027-05-01').toISOString()).toBe('2027-04-30T21:00:00.000Z');
    expect(startOfDay('2027-01-01').toISOString()).toBe('2026-12-31T22:00:00.000Z');
    // the day summer time starts (28 March 2027, 03:00 → 04:00): midnight is still UTC+2
    expect(startOfDay('2027-03-28').toISOString()).toBe('2027-03-27T22:00:00.000Z');
  });
});
