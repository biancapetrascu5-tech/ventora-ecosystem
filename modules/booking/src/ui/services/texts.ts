'use client';

import { useTranslations } from 'next-intl';
import type { DataTableLabels } from '@ventora/ui';
import { amountText, capacityForm, pluralForm, type Currency, type PriceKind } from './format';

export type ServiceRow = {
  id: string;
  name: string;
  categoryId: string | null;
  description: string | null;
  durationMinutes: number;
  durationMaxMinutes: number | null;
  priceKind: PriceKind;
  priceMinor: number;
  priceMaxMinor: number | null;
  currency: Currency;
  capacity: number;
  bookableOnline: boolean;
  /** S129 „Cine îl face”: „Toată echipa”, or the members (ids) who do it; [] = nobody. */
  doneBy: 'all' | string[];
  /** S137: some member has their own duration or price („Diferă pe membru”). */
  varies: boolean;
};

/** The texts of the list (preview.html: PL, durTxt, priceTxt, capTxt, money). */
export function useServiceTexts() {
  const t = useTranslations('booking.services');
  const money = (minor: number, cur: Currency) => t(`money.${cur}`, { amount: amountText(minor) });
  return {
    t,
    count: (n: number) => t(`count.${pluralForm(n)}`, { n }),
    archivedCount: (n: number) =>
      n === 0 ? t('archived.catCount.none') : t(`archived.catCount.${pluralForm(n)}`, { n }),
    duration: (s: Pick<ServiceRow, 'durationMinutes' | 'durationMaxMinutes'>) =>
      s.durationMaxMinutes
        ? t('duration.range', { min: s.durationMinutes, max: s.durationMaxMinutes })
        : t('duration.fixed', { n: s.durationMinutes }),
    money,
    price: (s: Pick<ServiceRow, 'priceKind' | 'priceMinor' | 'priceMaxMinor' | 'currency'>) => {
      if (s.priceKind === 'from')
        return t('price.from', { amount: money(s.priceMinor, s.currency) });
      if (s.priceKind === 'range') {
        const range = t('price.range', {
          min: amountText(s.priceMinor),
          max: amountText(s.priceMaxMinor ?? s.priceMinor),
        });
        return t(`money.${s.currency}`, { amount: range });
      }
      return money(s.priceMinor, s.currency);
    },
    /** „2 membri” */
    members: (n: number) => t(`members.${pluralForm(n)}`, { n }),
    capacity: (n: number) => {
      const form = capacityForm(n);
      return form === 'one' ? t('capacity.one') : t(`capacity.${form}`, { n });
    },
  };
}

/** The DataTable texts from the common ui.* keys (as apps/platform/src/screens/labels.ts). */
export function useTableLabels(): DataTableLabels {
  const t = useTranslations('ui');
  return {
    selectedN: (n) => t('selectedN', { n }),
    clearSelection: t('clearSelection'),
    selectAll: t('selectAll'),
    selectRow: t('selectRow'),
    sortAsc: t('sortAsc'),
    sortDesc: t('sortDesc'),
    rowActions: t('rowActions'),
    pagination: {
      range: (from, to, total) => t('rangeOf', { from, to, total }),
      pageOf: (n, total) => t('pageOf', { n, total }),
      rowsPerPage: t('rowsPerPage'),
      prevPage: t('prevPage'),
      nextPage: t('nextPage'),
    },
  };
}
