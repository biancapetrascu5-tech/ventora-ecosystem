import { describe, it, expect } from 'vitest';
import type { InvoiceLinePreview } from '@ventora/contracts';
import {
  discountApplies,
  firstDiscountedInvoice,
  priceInvoice,
  type DiscountTerms,
} from '../pricing';

// Lot 3.2 · D3-21 (31.10.2026): discounts on a business — on the subscription or on one line;
// a percentage or a fixed amount; once / N months / forever; ended, not deleted.

const lines: InvoiceLinePreview[] = [
  { kind: 'plan', key: 'business', lineId: null, amountMinor: 34900 },
  { kind: 'application', key: 'crm', lineId: 'line-crm', amountMinor: 4900 },
  { kind: 'addon', key: 'seats-5', lineId: 'line-seats', amountMinor: 6000 },
];

const discount = (over: Partial<DiscountTerms>): DiscountTerms => ({
  id: 'd1',
  scope: 'subscription',
  lineId: null,
  kind: 'percent',
  percentOff: 10,
  amountOffMinor: null,
  duration: 'forever',
  durationMonths: null,
  createdAt: new Date('2027-01-20T10:00:00Z'),
  endedAt: null,
  ...over,
});

describe('D3-21 — priceInvoice: full prices, the discount as its own line, the total', () => {
  it('a percentage on the whole subscription', () => {
    const r = priceInvoice(lines, [discount({ percentOff: 10 })]);
    expect(r.subtotalMinor).toBe(45800);
    expect(r.discounts).toEqual([
      expect.objectContaining({ discountId: 'd1', scope: 'subscription', appliedMinor: 4580 }),
    ]);
    expect(r.totalMinor).toBe(41220);
  });

  it('a fixed amount in the business currency', () => {
    const r = priceInvoice(lines, [
      discount({ kind: 'amount', percentOff: null, amountOffMinor: 5000 }),
    ]);
    expect(r.discountMinor).toBe(5000);
    expect(r.totalMinor).toBe(40800);
  });

  it('100% = free; a fixed amount above the price stops at zero', () => {
    expect(priceInvoice(lines, [discount({ percentOff: 100 })]).totalMinor).toBe(0);
    const big = discount({ kind: 'amount', percentOff: null, amountOffMinor: 99999999 });
    const r = priceInvoice(lines, [big]);
    expect(r.discounts[0]!.appliedMinor).toBe(45800);
    expect(r.totalMinor).toBe(0);
  });

  it('on one line only: an application added, or a monthly add-on', () => {
    const onCrm = discount({ scope: 'application', lineId: 'line-crm', percentOff: 100 });
    const r = priceInvoice(lines, [onCrm]);
    expect(r.discounts[0]!.appliedMinor).toBe(4900);
    expect(r.totalMinor).toBe(40900);
    const onSeats = discount({
      id: 'd2',
      scope: 'addon',
      lineId: 'line-seats',
      kind: 'amount',
      percentOff: null,
      amountOffMinor: 10000,
    });
    // capped at the line, not at the invoice
    expect(priceInvoice(lines, [onSeats]).discounts[0]!.appliedMinor).toBe(6000);
  });

  it('line discounts first, then the subscription discount on what is left', () => {
    const r = priceInvoice(lines, [
      discount({ id: 'sub', percentOff: 50 }),
      discount({ id: 'crm', scope: 'application', lineId: 'line-crm', percentOff: 100 }),
    ]);
    // 45800 - 4900 = 40900; 50% of 40900 = 20450
    expect(r.discounts.map((d) => [d.discountId, d.appliedMinor])).toEqual([
      ['crm', 4900],
      ['sub', 20450],
    ]);
    expect(r.totalMinor).toBe(20450);
  });
});

describe('D3-21 — duration: once / N months / forever, on the billing dates', () => {
  const monthly = { startedOn: '2027-01-31', interval: 'month' as const, anchorDay: 31 };
  const now = new Date('2027-01-20T10:00:00Z');

  it('the first invoice it reaches is the first billing date after the day it was created', () => {
    expect(firstDiscountedInvoice(monthly, new Date('2027-02-10T10:00:00Z'))).toBe('2027-02-28');
  });

  it('once: only the next invoice', () => {
    const d = discount({ duration: 'once', createdAt: new Date('2027-02-10T10:00:00Z') });
    expect(discountApplies(d, monthly, '2027-02-28', now)).toBe(true);
    expect(discountApplies(d, monthly, '2027-03-31', now)).toBe(false);
  });

  it('N months: the invoices in the N months from the first one', () => {
    const d = discount({
      duration: 'repeating',
      durationMonths: 3,
      createdAt: new Date('2027-02-10T10:00:00Z'),
    });
    expect(
      ['2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31'].map((day) =>
        discountApplies(d, monthly, day, now),
      ),
    ).toEqual([true, true, true, false]);
    // on a yearly subscription, 3 months reach only the first yearly invoice
    const yearly = { startedOn: '2027-01-15', interval: 'year' as const, anchorDay: 15 };
    expect(discountApplies(d, yearly, '2028-01-15', now)).toBe(true);
    expect(discountApplies(d, yearly, '2029-01-15', now)).toBe(false);
  });

  it('forever: every invoice from the first one, until it is ended', () => {
    const d = discount({ duration: 'forever', createdAt: new Date('2027-02-10T10:00:00Z') });
    expect(discountApplies(d, monthly, '2031-07-31', now)).toBe(true);
    expect(discountApplies(d, monthly, '2027-01-31', now)).toBe(false);
    const ended = { ...d, endedAt: new Date('2027-03-01T10:00:00Z') };
    expect(discountApplies(ended, monthly, '2027-03-31', new Date('2027-03-02T10:00:00Z'))).toBe(
      false,
    );
  });
});
