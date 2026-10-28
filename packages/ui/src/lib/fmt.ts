export function fmtNumber(n: number, locale?: string): string {
  return new Intl.NumberFormat(locale ?? undefined, { useGrouping: true }).format(n);
}
