import type { CSSProperties } from 'react';

/* S148 — the business brand on the client-facing pages (Hub › Setări › Brand, HubBrand): the logo
   (light / dark), the main colour on buttons and selections, the accent line, the font. The
   colours and the font are the business's data, not values of the design system; without a brand
   the pages keep the Ventora look. preview.html brandVars148 / b148sh, 1:1. */

export type PublicBrand = {
  logo?: string | null;
  logoDark?: string | null;
  /** „#7A2E4D” */
  primary: string;
  accent: string;
  font: string;
};

const HEX = /^#[0-9a-f]{6}$/i;

/** A colour darkened by a factor (0.9 = hover, 0.8 = pressed), as the preview computes it. */
export function shade(hex: string, factor: number): string {
  if (!HEX.test(hex)) return hex;
  return `#${[1, 3, 5]
    .map((i) =>
      Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * factor)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** The CSS variables of the brand on the page's root; undefined without a brand. */
export function brandStyle(b: PublicBrand | null | undefined): CSSProperties | undefined {
  if (!b || !HEX.test(b.primary) || !HEX.test(b.accent)) return undefined;
  return {
    ['--primary' as string]: b.primary,
    ['--primary-hover' as string]: shade(b.primary, 0.9),
    ['--primary-pressed' as string]: shade(b.primary, 0.8),
    ['--on-primary' as string]: '#FFFFFF',
    ['--font-sans' as string]: b.font,
    ['--font-display' as string]: b.font,
    fontFamily: b.font,
    borderTop: `4px solid ${b.accent}`,
  };
}
