import { describe, it, expect } from 'vitest';
import { classifyChange, type VersionTerms } from '../classify';

// Lot 3.2 (§8.5, P19): the move is classified for the subscription's currency and interval.

const base: VersionTerms = {
  applications: ['booking', 'crm'],
  features: ['booking.sms.ownNumber'],
  quotas: { 'messaging.sms': 500, 'platform.members': 10, 'booking.appointments': null },
  prices: [
    { currency: 'RON', kind: 'month', amountMinor: 34900 },
    { currency: 'RON', kind: 'year', amountMinor: 349000 },
    { currency: 'EUR', kind: 'month', amountMinor: 7000 },
  ],
};
const ron = { currency: 'RON' as const, interval: 'month' as const };

describe('Lot 3.2 — classifyChange', () => {
  it('the same or more for the same price is in the advantage', () => {
    const more = { ...base, quotas: { ...base.quotas, 'messaging.sms': 1000 } };
    const r = classifyChange(base, more, ron);
    expect(r.classification).toBe('advantage');
    expect(r.reasons).toEqual([
      { kind: 'quota_higher', key: 'messaging.sms', from: 500, to: 1000 },
    ]);
    expect(classifyChange(base, base, ron).classification).toBe('advantage');
  });

  it('a higher price in the subscription’s currency and interval is a disadvantage', () => {
    const dearer = {
      ...base,
      prices: base.prices.map((p) =>
        p.currency === 'RON' && p.kind === 'month' ? { ...p, amountMinor: 44900 } : p,
      ),
    };
    expect(classifyChange(base, dearer, ron).classification).toBe('disadvantage');
    // a yearly RON subscription or a EUR one does not see that price change
    expect(classifyChange(base, dearer, { currency: 'RON', interval: 'year' }).classification).toBe(
      'advantage',
    );
    expect(
      classifyChange(base, dearer, { currency: 'EUR', interval: 'month' }).classification,
    ).toBe('advantage');
  });

  it('anything less included is a disadvantage, even with more elsewhere', () => {
    const noCrm = {
      ...base,
      applications: ['booking'],
      quotas: { ...base.quotas, 'messaging.sms': 5000 },
    };
    expect(classifyChange(base, noCrm, ron).classification).toBe('disadvantage');
    const noFeature = { ...base, features: [] };
    expect(classifyChange(base, noFeature, ron).reasons).toContainEqual({
      kind: 'feature_removed',
      key: 'booking.sms.ownNumber',
    });
    // unlimited → a number is lower; a quota dropped from the version is 0
    const limited = { ...base, quotas: { ...base.quotas, 'booking.appointments': 1000 } };
    expect(classifyChange(base, limited, ron).classification).toBe('disadvantage');
    const { 'platform.members': _dropped, ...rest } = base.quotas;
    expect(classifyChange(base, { ...base, quotas: rest }, ron).reasons).toContainEqual({
      kind: 'quota_lower',
      key: 'platform.members',
      from: 10,
      to: 0,
    });
  });

  it('a target version without the price of that currency and interval cannot be classified', () => {
    const ronOnly = { ...base, prices: base.prices.filter((p) => p.currency === 'RON') };
    expect(() => classifyChange(base, ronOnly, { currency: 'EUR', interval: 'month' })).toThrow(
      /no month price in EUR/,
    );
  });
});
