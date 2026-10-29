import { describe, it, expect } from 'vitest';
import { fmtNumber } from '../src/lib/fmt';

describe('fmtNumber', () => {
  it('pune separatorul de mii și la numere de 4 cifre, în toate limbile', () => {
    expect(fmtNumber(4310, 'ro')).toBe('4.310');
    expect(fmtNumber(4310, 'es')).toBe('4.310');
    expect(fmtNumber(4310, 'de')).toBe('4.310');
    expect(fmtNumber(4310, 'it')).toBe('4.310');
    expect(fmtNumber(4310, 'en')).toBe('4,310');
    expect(fmtNumber(4310, 'fr')).toMatch(/^4\s310$/u);
  });

  it('1284 → „1.284” cu separatorul limbii, în toate cele 6 limbi (useGrouping: always)', () => {
    expect(fmtNumber(1284, 'ro')).toBe('1.284');
    expect(fmtNumber(1284, 'en')).toBe('1,284');
    expect(fmtNumber(1284, 'fr')).toMatch(/^1\s284$/u);
    expect(fmtNumber(1284, 'es')).toBe('1.284');
    expect(fmtNumber(1284, 'de')).toBe('1.284');
    expect(fmtNumber(1284, 'it')).toBe('1.284');
  });

  it('nu grupează sub 1000', () => {
    expect(fmtNumber(248, 'ro')).toBe('248');
  });
});
