import { describe, expect, it } from 'vitest';
import {
  contrast,
  formatRatio,
  MIN_TEXT_CONTRAST,
  normalizeHex,
  readableShade,
  shade,
} from './contrast';

describe('HubBrand — the colour checks', () => {
  it('normalizes a colour or refuses it', () => {
    expect(normalizeHex(' #7A2E4D ')).toBe('#7a2e4d');
    expect(normalizeHex('7a2e4d')).toBe('#7a2e4d');
    expect(normalizeHex('#7a2e4')).toBeNull();
    expect(normalizeHex('red')).toBeNull();
  });

  it('contrast: black on white is 21:1, white on white 1:1', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('the design’s examples: the plum reads well, the yellow does not', () => {
    expect(contrast('#7a2e4d', '#ffffff')).toBeGreaterThan(MIN_TEXT_CONTRAST);
    expect(contrast('#f4c542', '#ffffff')).toBeLessThan(MIN_TEXT_CONTRAST);
  });

  it('proposes the first darker shade that reads with white text', () => {
    const fixed = readableShade('#f4c542');
    expect(contrast(fixed, '#ffffff')).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    // one step lighter would not be enough
    expect(readableShade('#7a2e4d')).toBe('#7a2e4d');
    expect(shade('#808080', 0.5)).toBe('#404040');
  });

  it('formats the ratio with one decimal in the locale', () => {
    expect(formatRatio(9.137, 'ro-RO')).toBe('9,1');
    expect(formatRatio(4.5, 'en-GB')).toBe('4.5');
  });
});
