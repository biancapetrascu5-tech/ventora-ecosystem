import { describe, expect, it } from 'vitest';
import { InvalidInput } from '@ventora/errors';
import {
  isValidCui,
  likePattern,
  normalizeBirthday,
  normalizeEmail,
  normalizePhone,
  normalizeTaxId,
  normalizeWebsite,
  optionalText,
} from '../server/validation';

// Lot CR.2: the pure validation of the contacts and the companies.
describe('crm validation', () => {
  const reason = (f: () => unknown) => {
    try {
      f();
    } catch (err) {
      return err instanceof InvalidInput ? `${err.field}:${err.message}` : String(err);
    }
    return 'ok';
  };

  it('phones: Romanian national numbers get +40, 00 becomes +, the rest must be E.164', () => {
    expect(normalizePhone('phone', '0722 123 456')).toBe('+40722123456');
    expect(normalizePhone('phone', '(021) 123.45.67')).toBe('+40211234567');
    expect(normalizePhone('phone', '0040722123456')).toBe('+40722123456');
    expect(normalizePhone('phone', '40722123456')).toBe('+40722123456');
    expect(normalizePhone('phone', '+33 6 12 34 56 78')).toBe('+33612345678');
    expect(normalizePhone('phone', '')).toBeNull();
    expect(normalizePhone('phone', undefined)).toBeUndefined();
    expect(reason(() => normalizePhone('phone', '123'))).toBe('phone:invalid');
    expect(reason(() => normalizePhone('phone', '+0123456789'))).toBe('phone:invalid');
  });

  it('e-mails: trimmed, lower-case, with a domain', () => {
    expect(normalizeEmail('email', ' Ana@Salon.RO ')).toBe('ana@salon.ro');
    expect(reason(() => normalizeEmail('email', 'ana@salon'))).toBe('email:invalid');
    expect(reason(() => normalizeEmail('email', `${'a'.repeat(250)}@b.ro`))).toBe('email:too_long');
  });

  it('the CUI and its control digit (key 753217532)', () => {
    expect(isValidCui('18547290')).toBe(true);
    expect(isValidCui('14399840')).toBe(true);
    expect(isValidCui('12345678')).toBe(false);
    expect(normalizeTaxId(' ro 18547290 ')).toBe('RO18547290');
    expect(normalizeTaxId('18547290')).toBe('18547290');
    expect(reason(() => normalizeTaxId('RO12345678'))).toBe('taxId:invalid');
    expect(reason(() => normalizeTaxId('ABC'))).toBe('taxId:invalid');
  });

  it('the birthday: a real date from 1900 to today', () => {
    const today = new Date(Date.UTC(2026, 10, 10));
    expect(normalizeBirthday('1990-05-17', today)).toBe('1990-05-17');
    expect(normalizeBirthday('2026-11-10', today)).toBe('2026-11-10');
    expect(reason(() => normalizeBirthday('2026-11-11', today))).toBe('birthday:invalid');
    expect(reason(() => normalizeBirthday('2025-02-29', today))).toBe('birthday:invalid');
    expect(reason(() => normalizeBirthday('1899-12-31', today))).toBe('birthday:invalid');
    expect(normalizeBirthday('', today)).toBeNull();
  });

  it('texts, sites and the search pattern', () => {
    expect(optionalText('note', '  două   spații ', 100)).toBe('două spații');
    expect(optionalText('note', '   ', 100)).toBeNull();
    expect(reason(() => optionalText('note', 'abc', 2))).toBe('note:too_long');
    expect(normalizeWebsite('salon.ro')).toBe('https://salon.ro');
    expect(normalizeWebsite('http://salon.ro/a')).toBe('http://salon.ro/a');
    expect(likePattern('50%_a')).toBe('%50\\%\\_a%');
  });
});
