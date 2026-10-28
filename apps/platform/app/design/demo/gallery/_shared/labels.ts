import type {
  ChartLabels,
  DataTableLabels,
  FileUploadLabels,
  PaginationLabels,
  SpineLabels,
} from '@ventora/ui';
import ro from '@ventora/i18n/messages/ro.json';

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

// S.dropFiles, S.dropNow, S.browse, S.maxSize, S.uploaded, S.retry, S.remove (bundle.js)
export const UPLOAD_RO: FileUploadLabels = {
  dropFiles: 'Trage fișierele aici sau',
  dropNow: 'Dă drumul ca să încarci',
  browse: 'alege-le de pe dispozitiv',
  maxSize: (size) => `Până la ${size} de fiecare fișier`,
  uploaded: 'Încărcat',
  retry: 'Încearcă din nou',
  remove: 'Elimină',
};

// UsageMeter: textele din packages/i18n (usageMeter.*), ca în galeria UsageMeter
const tpl = (str: string, args: Record<string, string>) =>
  Object.entries(args).reduce((s, [k, v]) => s.replace(`{${k}}`, v), str);
export const USAGE_RO = {
  locale: 'ro',
  unlimitedLabel: ro.usageMeter.unlimited,
  usedOfLabel: (a: { used: string; limit: string }) => tpl(ro.usageMeter.usedOf, a),
  leftLabel: (a: { n: string }) => tpl(ro.usageMeter.left, a),
  nearLimitLabel: ro.usageMeter.nearLimit,
  atLimitLabel: ro.usageMeter.atLimit,
  atLimitHint: ro.usageMeter.atLimitHint,
  upgradeLabel: ro.usageMeter.upgrade,
  buyMoreLabel: ro.usageMeter.buyMore,
  notifyOwnerLabel: ro.usageMeter.notifyOwner,
  onlyOwnerBuysLabel: (a: { who: string }) => tpl(ro.usageMeter.onlyOwnerBuys, a),
};

// S.backToHub, S.expandMenu, S.collapseMenu, S.more, S.close, S.back (ro)
export const SPINE_RO: SpineLabels = {
  backToHub: 'Înapoi la aplicații',
  expandMenu: 'Extinde meniul',
  collapseMenu: 'Restrânge meniul',
  more: 'Mai multe',
  close: 'Închide',
  back: 'Înapoi',
};
