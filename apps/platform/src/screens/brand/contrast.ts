/*
 * HubBrand (S148): the contrast checks of the colours, as in the design (WCAG 2.1 relative
 * luminance). The button text is always white (the design's recommendation, accepted 14.11):
 *   - the main colour needs at least 4.5:1 against white, otherwise a darker shade is proposed;
 *   - the accent under 3:1 against white is used only for details (a note, not an error).
 */

export const MIN_TEXT_CONTRAST = 4.5;
export const MIN_ACCENT_CONTRAST = 3;

/** The Ventora colours, shown when the business has none (tokens: --primary, --accent). */
export const VENTORA_PRIMARY = '#000c3f';
export const VENTORA_ACCENT = '#ffaa75';

const HEX_RE = /^#?([0-9a-f]{6})$/i;

/** `#rrggbb` in lower case, or null when it is not a colour. */
export function normalizeHex(value: string): string | null {
  const m = HEX_RE.exec(value.trim());
  return m ? `#${m[1]!.toLowerCase()}` : null;
}

const channels = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** The colour scaled by `f` (0–1): darker. */
export function shade(hex: string, f: number): string {
  return (
    '#' +
    channels(hex)
      .map((v) =>
        Math.max(0, Math.min(255, Math.round(v * 255 * f)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

/** The first darker shade (by 4% steps, as in the design) that white text reads on. */
export function readableShade(hex: string): string {
  let f = 1;
  let out = hex;
  while (contrast(out, '#ffffff') < MIN_TEXT_CONTRAST && f > 0.1) {
    f -= 0.04;
    out = shade(hex, f);
  }
  return out;
}

/** One decimal, in the person's locale: „9,1”. */
export function formatRatio(ratio: number, locale: string): string {
  return (Math.round(ratio * 10) / 10).toLocaleString(locale);
}
