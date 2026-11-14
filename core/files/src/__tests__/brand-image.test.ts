import { describe, expect, it } from 'vitest';
import { InvalidInput } from '@ventora/errors';
import { BRAND_LOGO_OWNER, checkDeclaredFile, imageSize, isBrandLogoOwner } from '../index';
import { jpegOf, pngOf } from './brand-fixtures';

/* Brand Kit (S148): the logo is a PNG or JPEG, its pixel size read from the bytes (no package). */

describe('Brand Kit — imageSize', () => {
  it('reads a PNG and a JPEG', () => {
    expect(imageSize(pngOf(512, 300))).toEqual({ width: 512, height: 300 });
    expect(imageSize(jpegOf(1024, 256))).toEqual({ width: 1024, height: 256 });
  });

  it('null for what does not say its size', () => {
    expect(imageSize(pngOf(512, 300).subarray(0, 20))).toBeNull();
    expect(imageSize(new TextEncoder().encode('%PDF-1.7\n'))).toBeNull();
    expect(imageSize(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
    expect(imageSize(new TextEncoder().encode('<svg width="512" height="512"></svg>'))).toBeNull();
  });
});

describe('Brand Kit — the logo owner', () => {
  it('a logo is only PNG or JPG (no PDF, no SVG)', () => {
    expect(isBrandLogoOwner(BRAND_LOGO_OWNER)).toBe(true);
    expect(isBrandLogoOwner({ module: 'support', resourceType: 'ticket' })).toBe(false);
    const owner = { ...BRAND_LOGO_OWNER };
    expect(() =>
      checkDeclaredFile({ contentType: 'image/png', sizeBytes: 10, owner }),
    ).not.toThrow();
    expect(() =>
      checkDeclaredFile({ contentType: 'image/jpeg', sizeBytes: 10, owner }),
    ).not.toThrow();
    expect(() =>
      checkDeclaredFile({ contentType: 'image/png', sizeBytes: 2 * 1024 * 1024 + 1, owner }),
    ).toThrow(InvalidInput);
    for (const contentType of ['application/pdf', 'image/svg+xml', 'text/csv']) {
      expect(() => checkDeclaredFile({ contentType, sizeBytes: 10, owner })).toThrow(InvalidInput);
    }
  });
});
