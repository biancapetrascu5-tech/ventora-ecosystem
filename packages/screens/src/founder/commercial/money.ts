/* Prețurile în Founder (S113, glosarul): „349 lei”, „70 €”; zecimalele apar doar când există,
   mereu două („22,13 lei”); separatorul de mii și la 4 cifre („1.290 lei”, CONFIRMAT 28.10.2026).
   Sumele vin în unități minore (bani / cenți), ca în core/commercial. Founder e doar în română. */

export type Currency = 'RON' | 'EUR';

const GROUPING = { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions;

/** „1.290”, „22,13” — fără monedă. */
export function amount(minor: number): string {
  const n = minor / 100;
  const fractional = Math.round(minor) % 100 !== 0;
  return new Intl.NumberFormat('ro-RO', {
    ...GROUPING,
    minimumFractionDigits: fractional ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(n);
}

/** „349 lei”, „70 €”. */
export function money(minor: number, currency: Currency): string {
  return currency === 'EUR' ? `${amount(minor)} €` : `${amount(minor)} lei`;
}

/** Sufixul câmpului de preț: „lei” / „€”. */
export function currencySuffix(currency: Currency): string {
  return currency === 'EUR' ? '€' : 'lei';
}

/**
 * Suma scrisă într-un câmp („3.790”, „3790”, „22,13”) în unități minore; null dacă nu e o sumă
 * (gol, litere, mai mult de două zecimale, negativă).
 */
export function parseAmount(text: string): number | null {
  const v = text.trim().replace(/\s/g, '');
  if (!v) return null;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(v)) return null;
  const [int, dec = ''] = v.replace(/\./g, '').split(',');
  return Number(int) * 100 + Number(dec.padEnd(2, '0'));
}

/** Suma în unități minore, cum se scrie în câmp („3.790”, „22,13”). */
export function amountInput(minor: number | null | undefined): string {
  return minor == null ? '' : amount(minor);
}

/** Un număr întreg scris într-un câmp („1.500”, „1500”); null dacă nu e. */
export function parseCount(text: string): number | null {
  const v = text.trim().replace(/\s/g, '');
  if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(v)) return null;
  return Number(v.replace(/\./g, ''));
}

/** „1.500” */
export function count(n: number): string {
  return new Intl.NumberFormat('ro-RO', GROUPING).format(n);
}
