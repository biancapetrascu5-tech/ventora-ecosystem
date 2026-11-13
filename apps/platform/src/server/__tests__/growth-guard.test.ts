import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Lotul 5.9 — garda fluxurilor critice (GROWTH §2.2, FAZA-5 5.9): o recomandare Growth nu apare în
 * autentificare, în dialogurile de plată, în erori sau în formularele în lucru. Testul caută în
 * fișierele acestor fluxuri orice folosire a slotului (GrowthSlot, GrowthRecommendation,
 * readGrowthSlot, getSlotContent).
 */

const ROOT = join(__dirname, '..', '..', '..');
const SLOT = /\b(GrowthSlot|GrowthRecommendation|readGrowthSlot|getSlotContent)\b/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(tsx?|mts)$/.test(name) ? [p] : [];
  });
}

const rel = (p: string) => relative(ROOT, p).split(sep).join('/');

/** Fluxurile în care un slot nu are voie (căile din apps/platform). */
const CRITICAL: RegExp[] = [
  /^app\/\(auth\)\//, // autentificarea, invitația, resetarea parolei, 2FA
  /^src\/screens\/auth\//,
  /(^|\/)(error|global-error|not-found)\.tsx$/, // paginile de eroare
  /^src\/screens\/plan\/(PurchaseDialog|CardDialog|LimitDialog)\.tsx$/, // plata și confirmarea
  /^app\/invoices\//,
];

describe('Growth: niciun slot în fluxurile critice', () => {
  const all = [...files(join(ROOT, 'app')), ...files(join(ROOT, 'src'))].filter(
    (p) => !rel(p).startsWith('app/design/'),
  );

  it('găsește fișierele fluxurilor critice (garda nu e goală)', () => {
    const critical = all.filter((p) => CRITICAL.some((re) => re.test(rel(p))));
    expect(critical.length).toBeGreaterThan(5);
  });

  it('niciun fișier critic nu folosește slotul Growth', () => {
    const offenders = all
      .filter((p) => CRITICAL.some((re) => re.test(rel(p))))
      .filter((p) => SLOT.test(readFileSync(p, 'utf8')))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  // B.6b: + booking.today.aside, odată cu ecranul BookingToday (BOOKING.md §B.35)
  it('slotul se citește doar pe server, din locurile v1 (launcher, abonament, catalog, clopoțelul, EasyBook · Azi)', () => {
    const readers = all
      .filter((p) => !rel(p).includes('/__tests__/'))
      .filter((p) => /\breadGrowthSlot\(/.test(readFileSync(p, 'utf8')))
      .map(rel)
      .sort();
    expect(readers).toEqual([
      'src/server/booking-today-actions.ts',
      'src/server/catalog-actions.ts',
      'src/server/growth-actions.ts',
      'src/server/growth-slot.ts',
      'src/server/launcher-actions.ts',
      'src/server/plan-actions.ts',
    ]);
  });
});
