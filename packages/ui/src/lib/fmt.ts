// useGrouping: 'always' (Intl.NumberFormat v3 / ES2023): grupează și numerele de 4 cifre în
// toate limbile (cu `true`, es/it lasă „1284” negrupat). Lib-ul TS al proiectului e es2022, deci
// tipul vechi (boolean) nu cunoaște valoarea — de aici conversia.
const GROUPING = { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions;

export function fmtNumber(n: number, locale?: string): string {
  return new Intl.NumberFormat(locale ?? undefined, GROUPING).format(n);
}
