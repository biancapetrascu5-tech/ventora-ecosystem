import { describe, it, expect } from 'vitest';
import {
  checkForeignVatCode,
  checkRegCom,
  checkRomanianCui,
  isRomanianVatPayer,
  normalizeTaxId,
} from '../billing-profile';

// Lot 3.8 (D-3.6-1) — the checks of the billing profile without a database; the same vectors run
// against billing.ro_cui_valid in lot38.integration.test.ts.

const VALID_CUIS = ['14399840', 'RO14399840', '1590082', '18547290', '13548146', '6859662'];

describe('CUI (cifra de control 753217532)', () => {
  it.each(VALID_CUIS)('%s e valid', (cui) => {
    expect(checkRomanianCui(cui)).toBe('ok');
  });

  it('cifra de control greșită → „control” (founder.billingProfile.cuiErrCheck)', () => {
    expect(checkRomanianCui('14399841')).toBe('control');
    expect(checkRomanianCui('RO18547291')).toBe('control');
  });

  it('alt format → „format” (cuiErrFormat): litere, zero la început, prea scurt / lung', () => {
    for (const bad of ['', '1', 'RO', 'RX14399840', '014399840', '12345678901', '1439984O']) {
      expect(checkRomanianCui(bad)).toBe('format');
    }
  });

  it('spațiile și literele mici nu contează; „RO” = plătitor de TVA', () => {
    expect(normalizeTaxId(' ro 14 399 840 ')).toBe('RO14399840');
    expect(checkRomanianCui(' ro 14 399 840 ')).toBe('ok');
    expect(isRomanianVatPayer('ro14399840')).toBe(true);
    expect(isRomanianVatPayer('14399840')).toBe(false);
  });
});

describe('firma din afara României: cod de TVA cu prefix, fără VIES', () => {
  it('cu prefixul țării', () => {
    expect(checkForeignVatCode('DE123456789')).toBe(true);
    expect(checkForeignVatCode('fr 12 345678901')).toBe(true);
    expect(checkForeignVatCode('ATU12345678')).toBe(true);
  });
  it('fără prefix sau cu RO → refuzat (RO se scrie ca CUI)', () => {
    expect(checkForeignVatCode('123456789')).toBe(false);
    expect(checkForeignVatCode('RO14399840')).toBe(false);
    expect(checkForeignVatCode('D')).toBe(false);
  });
});

describe('Nr. Reg. Com.', () => {
  it('forma clasică și forma de după 2024', () => {
    expect(checkRegCom('J32/1234/2019')).toBe(true);
    expect(checkRegCom('j40/12345/2005')).toBe(true);
    expect(checkRegCom('F05/77/2020')).toBe(true);
    expect(checkRegCom('J2024012345320')).toBe(true);
  });
  it('altceva → regComErr', () => {
    expect(checkRegCom('J99/1234/2019')).toBe(false);
    expect(checkRegCom('32/1234/2019')).toBe(false);
    expect(checkRegCom('J32-1234-2019')).toBe(false);
    expect(checkRegCom('')).toBe(false);
  });
});
