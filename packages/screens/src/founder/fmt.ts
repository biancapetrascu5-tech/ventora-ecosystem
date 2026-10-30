/** „1.000”: separatorul de mii și la 4 cifre (CONFIRMAT 28.10.2026). Founder e doar în română. */
export function thousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
