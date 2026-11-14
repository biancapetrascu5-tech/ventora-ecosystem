import { describe, expect, it } from 'vitest';
import { brandStyle, shade } from '../ui/public/brand';

describe('BookingPublic — the business brand (S148)', () => {
  it('darkens the main colour as the preview does (hover 0.9, pressed 0.8)', () => {
    expect(shade('#7A2E4D', 0.9)).toBe('#6e2945');
    expect(shade('#7A2E4D', 0.8)).toBe('#62253e');
    expect(shade('#FFFFFF', 1.2)).toBe('#ffffff');
  });

  it('gives the CSS variables only for a valid brand; otherwise the Ventora look', () => {
    const s = brandStyle({ primary: '#7A2E4D', accent: '#E9B872', font: 'Georgia, serif' });
    expect(s).toMatchObject({
      '--primary': '#7A2E4D',
      '--primary-hover': '#6e2945',
      borderTop: '4px solid #E9B872',
      fontFamily: 'Georgia, serif',
    });
    expect(brandStyle(null)).toBeUndefined();
    expect(brandStyle({ primary: 'red', accent: '#E9B872', font: 'x' })).toBeUndefined();
  });
});
