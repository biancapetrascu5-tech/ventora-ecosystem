import type { GrowthOfferCost } from '@ventora/contracts';

/* Lotul 5.9 — linia de cost a unei oferte, întreagă înainte de orice confirmare (D-GRW-10):
   prețul și periodicitatea, condițiile probei și costul de implementare (sau „fără”). Pură, ca să
   fie testată fără ecran. */

export type CostText = (
  key: 'month' | 'year' | 'once' | 'trial' | 'setup' | 'noSetup',
  values?: Record<string, string | number>,
) => string;

export function formatGrowthCost(
  c: GrowthOfferCost,
  minor: (amountMinor: number) => string,
  t: CostText,
): string {
  const amount = minor(c.amountMinor);
  const price =
    c.interval === 'month'
      ? t('month', { amount })
      : c.interval === 'year'
        ? t('year', { amount })
        : t('once', { amount });
  const main = c.trial ? t('trial', { days: c.trial.days, price }) : price;
  if (c.trial && !c.setupMinor) return main;
  return `${main} · ${c.setupMinor ? t('setup', { amount: minor(c.setupMinor) }) : t('noSetup')}`;
}
