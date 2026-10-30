'use client';

import { useTranslations } from 'next-intl';
import type { DataTableLabels } from '@ventora/ui';

/** Etichetele DataTable + Pagination din cheile ui.* (textele S.* din design, 6 limbi). */
export function useDataTableLabels(): DataTableLabels {
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
