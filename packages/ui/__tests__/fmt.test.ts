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

  it('nu grupează sub 1000', () => {
    expect(fmtNumber(248, 'ro')).toBe('248');
  });
});
