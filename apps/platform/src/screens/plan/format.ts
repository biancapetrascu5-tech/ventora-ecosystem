'use client';

import { useLocale } from 'next-intl';

/* Lotul 3.7: sumele în moneda afacerii, cu cifrele în limba persoanei (D3-2, S113: „349 lei” și
   „70 €” în orice limbă; zecimale doar când există, atunci mereu două), și zilele calendarului
   (YYYY-MM-DD, fără fus orar). Ca în CatalogScreen. */

const GROUPING = { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions;

export type Money = {
  /** Din unități mici (bani, cenți): „349 lei”, „22,13 lei”, „70 €”. */
  minor: (minor: number) => string;
  /** Din unități mari, pentru AddonPurchase / UpgradeDialog (`format`). */
  major: (n: number) => string;
  /** Simbolul monedei, pentru AddonPurchase (`currency`). */
  symbol: string;
};

export function useMoney(currency: 'RON' | 'EUR'): Money {
  const locale = useLocale();
  const major = (n: number) => {
    const cents = Math.round(n * 100);
    const text = new Intl.NumberFormat(locale, {
      ...GROUPING,
      minimumFractionDigits: cents % 100 !== 0 ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(Math.abs(n));
    const sign = n < 0 ? '−' : '';
    return currency === 'EUR' ? `${sign}${text} €` : `${sign}${text} lei`;
  };
  return { major, minor: (m) => major(m / 100), symbol: currency === 'EUR' ? '€' : 'lei' };
}

export type Days = {
  /** „17 noiembrie” */
  long: (iso: string) => string;
  /** „17 noiembrie 2026” */
  longYear: (iso: string) => string;
  /** „17 oct.” */
  short: (iso: string) => string;
  /** „17 oct. 2026” */
  shortYear: (iso: string) => string;
  /** „17” (ziua lunii) */
  dayOfMonth: (iso: string) => string;
};

/** O zi a calendarului ('YYYY-MM-DD' sau un ISO complet, din care se ia ziua). */
const asDay = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);

export function useDays(): Days {
  const locale = useLocale();
  const f = (o: Intl.DateTimeFormatOptions) => (iso: string) =>
    new Intl.DateTimeFormat(locale, { ...o, timeZone: 'UTC' }).format(asDay(iso));
  return {
    long: f({ day: 'numeric', month: 'long' }),
    longYear: f({ day: 'numeric', month: 'long', year: 'numeric' }),
    short: f({ day: 'numeric', month: 'short' }),
    shortYear: f({ day: 'numeric', month: 'short', year: 'numeric' }),
    dayOfMonth: f({ day: 'numeric' }),
  };
}

/** Ziua dinainte (sfârșitul inclusiv al unei perioade care se termină exclusiv la `iso`). */
export function dayBefore(iso: string): string {
  const d = asDay(iso);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Cheia de text a unei limite (`messaging.sms` → `messaging_sms`). */
export const quotaSlug = (key: string) => key.replace(/\./g, '_');
