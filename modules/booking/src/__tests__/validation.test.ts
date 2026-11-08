import { describe, it, expect } from 'vitest';
import { InvalidInput } from '@ventora/errors';
import { BookingServiceArchivedV1, findEventDefinition } from '@ventora/contracts';
import { validateService } from '../server/validation';

// Lot B.1 — the rules of the catalog, without a database (the same as the CHECKs in booking_init).
function fieldOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    expect(err).toBeInstanceOf(InvalidInput);
    return (err as InvalidInput).field;
  }
}

const base = { name: 'Tuns', durationMinutes: 30, priceMinor: 5000 };

describe('validateService', () => {
  it('fills the defaults: fixed price, RON, capacity 1, bookable online, no category', () => {
    expect(validateService({ ...base, name: '  Tuns  ', description: '   ' })).toEqual({
      categoryId: null,
      name: 'Tuns',
      description: null,
      durationMinutes: 30,
      durationMaxMinutes: null,
      priceKind: 'fixed',
      priceMinor: 5000,
      priceMaxMinor: null,
      currency: 'RON',
      capacity: 1,
      bookableOnline: true,
      sortOrder: 0,
    });
  });

  it('durations: 5–480, multiples of 5; the variable maximum above the minimum', () => {
    expect(fieldOf(() => validateService({ ...base, durationMinutes: 0 }))).toBe('durationMinutes');
    expect(fieldOf(() => validateService({ ...base, durationMinutes: 4 }))).toBe('durationMinutes');
    expect(fieldOf(() => validateService({ ...base, durationMinutes: 33 }))).toBe(
      'durationMinutes',
    );
    expect(fieldOf(() => validateService({ ...base, durationMinutes: 720 }))).toBe(
      'durationMinutes',
    );
    expect(fieldOf(() => validateService({ ...base, durationMinutes: 480 }))).toBeNull();
    expect(fieldOf(() => validateService({ ...base, durationMinutes: 485 }))).toBe(
      'durationMinutes',
    );
    expect(fieldOf(() => validateService({ ...base, durationMaxMinutes: 30 }))).toBe(
      'durationMaxMinutes',
    );
    expect(fieldOf(() => validateService({ ...base, durationMaxMinutes: 62 }))).toBe(
      'durationMaxMinutes',
    );
    expect(validateService({ ...base, durationMaxMinutes: 60 }).durationMaxMinutes).toBe(60);
  });

  it('prices: fixed and „de la” without a maximum; a range needs a maximum above the price', () => {
    expect(fieldOf(() => validateService({ ...base, priceMinor: -1 }))).toBe('priceMinor');
    expect(fieldOf(() => validateService({ ...base, priceMinor: 1.5 }))).toBe('priceMinor');
    expect(fieldOf(() => validateService({ ...base, priceMinor: 10_000_001 }))).toBe('priceMinor');
    expect(fieldOf(() => validateService({ ...base, priceKind: 'range' }))).toBe('priceMaxMinor');
    expect(
      fieldOf(() => validateService({ ...base, priceKind: 'range', priceMaxMinor: 5000 })),
    ).toBe('priceMaxMinor');
    expect(
      fieldOf(() => validateService({ ...base, priceKind: 'from', priceMaxMinor: 9000 })),
    ).toBe('priceMaxMinor');
    expect(fieldOf(() => validateService({ ...base, priceKind: 'other' as never }))).toBe(
      'priceKind',
    );
    expect(validateService({ ...base, priceKind: 'range', priceMaxMinor: 9000 })).toMatchObject({
      priceKind: 'range',
      priceMaxMinor: 9000,
    });
    expect(validateService({ ...base, priceMinor: 0 }).priceMinor).toBe(0);
  });

  it('name, description, currency, capacity, category id', () => {
    expect(fieldOf(() => validateService({ ...base, name: '  ' }))).toBe('name');
    expect(fieldOf(() => validateService({ ...base, name: 'x'.repeat(121) }))).toBe('name');
    expect(fieldOf(() => validateService({ ...base, description: 'x'.repeat(1001) }))).toBe(
      'description',
    );
    expect(fieldOf(() => validateService({ ...base, currency: 'USD' as never }))).toBe('currency');
    expect(validateService({ ...base, currency: 'EUR' }).currency).toBe('EUR');
    expect(fieldOf(() => validateService({ ...base, capacity: 0 }))).toBe('capacity');
    expect(fieldOf(() => validateService({ ...base, capacity: 101 }))).toBe('capacity');
    expect(fieldOf(() => validateService({ ...base, categoryId: 'abc' }))).toBe('categoryId');
    expect(fieldOf(() => validateService({ ...base, sortOrder: -1 }))).toBe('sortOrder');
  });
});

describe('booking.service.archived v1 (§6.4 c)', () => {
  const ID = '2f1b8c3e-4a5d-4e6f-8a7b-9c0d1e2f3a4b';
  it('is in the catalog, completes without a consumer, strict payload', () => {
    expect(findEventDefinition('booking.service.archived', 1)).toBe(BookingServiceArchivedV1);
    expect(BookingServiceArchivedV1).toMatchObject({
      withoutConsumer: 'complete',
      growthSafe: false,
    });
    const payload = { serviceId: ID, name: 'Tuns', archivedAt: '2026-11-06T20:00:00.000Z' };
    expect(BookingServiceArchivedV1.parse(payload)).toEqual(payload);
    expect(() => BookingServiceArchivedV1.parse({ ...payload, price: 1 })).toThrow();
    expect(() => BookingServiceArchivedV1.parse({ ...payload, serviceId: 'x' })).toThrow();
  });
});
