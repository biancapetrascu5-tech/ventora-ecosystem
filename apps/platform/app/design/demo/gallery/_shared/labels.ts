import type { ChartLabels, DataTableLabels, PaginationLabels } from '@ventora/ui';

// Textele RO din bundle.js (S.rangeOf, S.pageOf, S.rowsPerPage, S.prevPage, S.nextPage)
export const PAGINATION_RO: PaginationLabels = {
  range: (from, to, total) => `${from}–${to} din ${total}`,
  pageOf: (n, total) => `Pagina ${n} din ${total}`,
  rowsPerPage: 'Rânduri pe pagină',
  prevPage: 'Pagina anterioară',
  nextPage: 'Pagina următoare',
};

// S.viewTable, S.viewChart și sufixul „mil.” din compact() (bundle.js)
export const CHART_RO: ChartLabels = {
  viewTable: 'Vezi ca tabel',
  viewChart: 'Vezi graficul',
  millions: 'mil.',
};

// S.selectedN (cu plural), S.clearSelection, S.selectAll, S.selectRow, S.sortAsc, S.sortDesc, S.rowActions
const RO_PLURAL = new Intl.PluralRules('ro-RO');
const SELECTED_RO = { one: 'selectat', few: 'selectate', other: 'de selectate' } as const;
export const DATATABLE_RO: DataTableLabels = {
  selectedN: (n) => {
    const form = RO_PLURAL.select(n);
    return `${n} ${form === 'one' || form === 'few' ? SELECTED_RO[form] : SELECTED_RO.other}`;
  },
  clearSelection: 'Renunță la selecție',
  selectAll: 'Selectează toate rândurile',
  selectRow: 'Selectează rândul',
  sortAsc: 'Sortat crescător',
  sortDesc: 'Sortat descrescător',
  rowActions: 'Acțiuni',
  pagination: PAGINATION_RO,
};
