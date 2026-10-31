'use client';

import { useTranslations } from 'next-intl';
import { money, type Currency } from '@ventora/screens';

/* Etichetele cotelor (founder.quota.<cheie cu „_”>): „SMS-uri”, „Limită de SMS-uri”,
   „SMS pe lună”. O cheie nouă din registru, fără text încă, apare cu numele ei tehnic. */
export function useQuotaText() {
  const t = useTranslations('founder.quota');
  const id = (key: string) => key.replace(/\./g, '_');
  const pick = (key: string, field: 'label' | 'limit' | 'perMonth') =>
    t.has(`${id(key)}.${field}`) ? t(`${id(key)}.${field}`) : key;
  return {
    label: (key: string) => pick(key, 'label'),
    limit: (key: string) => pick(key, 'limit'),
    perMonth: (key: string) => pick(key, 'perMonth'),
  };
}

/** „49 lei · 10 €” din prețurile pe monedă; o monedă lipsă nu apare. */
export function bothPrices(
  prices: ReadonlyArray<{ currency: Currency; amountMinor: number }>,
): string {
  return (['RON', 'EUR'] as const)
    .map((c) => prices.find((p) => p.currency === c))
    .filter((p): p is { currency: Currency; amountMinor: number } => !!p)
    .map((p) => money(p.amountMinor, p.currency))
    .join(' · ');
}

/** Data calendaristică 'AAAA-LL-ZZ' ca Date la prânz (fără salturi de fus la afișare). */
export const dayDate = (d: string) => new Date(`${d}T12:00:00`);
