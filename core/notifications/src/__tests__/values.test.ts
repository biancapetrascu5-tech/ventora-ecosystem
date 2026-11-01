import { describe, expect, it } from 'vitest';
import { InvalidInput } from '@ventora/errors';
import { formatDay, formatMoney, resolveParams, sendNotification } from '../index';

/*
 * D4-28 = a: F3 sends neutral values (a key, an ISO day, an amount in minor units + currency) and
 * core/notifications formats them in the reader's language, as the design shows them (S115).
 */

describe('D4-28 — the values, in the reader’s language', () => {
  it('a day: day and month, as in S115', () => {
    const shown = Object.fromEntries(
      (['ro', 'en', 'fr', 'es', 'de', 'it'] as const).map((l) => [l, formatDay('2026-12-01', l)]),
    );
    expect(shown).toEqual({
      ro: '1 decembrie',
      en: '1 December',
      fr: '1 décembre',
      es: '1 de diciembre',
      de: '1. Dezember',
      it: '1° dicembre',
    });
    // a calendar day: no time zone moves it
    expect(formatDay('2026-11-17', 'it')).toBe('17 novembre');
  });

  it('an amount: „349 lei” in every language, decimals only when there are any', () => {
    for (const l of ['ro', 'en', 'fr', 'es', 'de', 'it'] as const) {
      expect(formatMoney(34900, 'RON', l)).toBe('349 lei');
    }
    expect(formatMoney(125050, 'RON', 'ro')).toBe('1.250,50 lei');
    expect(formatMoney(125050, 'RON', 'en')).toBe('1,250.50 lei');
    // 4 digits are grouped in es too (useGrouping: 'always')
    expect(formatMoney(128400, 'RON', 'es')).toBe('1.284 lei');
    expect(formatMoney(7000, 'EUR', 'de')).toBe('70 €');
    expect(formatMoney(7000, 'EUR', 'en')).toBe('€70');
  });

  it('a key: read in the reader’s language, with its own values', () => {
    const params = {
      resource: { type: 'key', key: 'usageMeter.unlimited' },
      usage: {
        type: 'key',
        key: 'usageMeter.usedOf',
        params: { used: '800', limit: { type: 'money', amountMinor: 100000, currency: 'RON' } },
      },
      business: 'Salon Aurora',
    } as const;
    expect(resolveParams(params, 'ro')).toEqual({
      resource: 'Nelimitat',
      usage: '800 din 1.000 lei',
      business: 'Salon Aurora',
    });
    expect(resolveParams(params, 'de')).toEqual({
      resource: 'Unbegrenzt',
      usage: '800 von 1.000 lei',
      business: 'Salon Aurora',
    });
  });
});

describe('D4-28 — send refuses a value that is not neutral or not well formed', () => {
  const tx = {
    query: async () => {
      throw new Error('must not be reached');
    },
  };
  const restored = (amount: unknown) =>
    sendNotification(tx, {
      category: 'operational',
      type: 'billing.restored',
      version: 1,
      organizationId: '0193a4b0-7c1e-7b3a-9f00-1234567890ab',
      recipientUserIds: ['0193a4b0-7c1e-7b3a-9f00-1234567890ac'],
      idempotencyKey: 'evt-1',
      params: { business: 'Salon Aurora', amount: amount as never },
    });

  it('an amount already formatted in one language', async () => {
    await expect(restored('349 lei')).rejects.toThrow(/amount must be a money/);
  });

  it('an amount that is not whole minor units, or of an unknown currency', async () => {
    await expect(restored({ type: 'money', amountMinor: 349.5, currency: 'RON' })).rejects.toThrow(
      /minor units/,
    );
    await expect(restored({ type: 'money', amountMinor: 34900, currency: 'ABC' })).rejects.toThrow(
      /minor units/,
    );
  });

  it('a date that is not a day, a key without text or without its values, an unknown kind', async () => {
    const limit = (params: Record<string, unknown>) =>
      sendNotification(tx, {
        category: 'operational',
        type: 'billing.limit.owner100',
        version: 1,
        organizationId: '0193a4b0-7c1e-7b3a-9f00-1234567890ab',
        recipientUserIds: ['0193a4b0-7c1e-7b3a-9f00-1234567890ac'],
        idempotencyKey: 'evt-1',
        params: {
          business: 'Salon Aurora',
          limit: '1.000',
          resource: { type: 'key', key: 'usageMeter.unlimited' },
          buyItem: { type: 'key', key: 'usageMeter.unlimited' },
          resetDate: { type: 'date', date: '2026-11-17' },
          ...params,
        } as never,
      });
    await expect(limit({ resetDate: { type: 'date', date: '2026-02-30' } })).rejects.toThrow(
      /YYYY-MM-DD/,
    );
    await expect(limit({ resetDate: '17 noiembrie' })).rejects.toThrow(/resetDate must be a date/);
    await expect(limit({ resource: { type: 'key', key: 'usageMeter.nope' } })).rejects.toThrow(
      /no text usageMeter\.nope/,
    );
    await expect(limit({ resource: { type: 'key', key: 'usageMeter.usedOf' } })).rejects.toThrow(
      /needs used, limit/,
    );
    await expect(limit({ resource: { type: 'number', value: 3 } })).rejects.toBeInstanceOf(
      InvalidInput,
    );
  });
});
