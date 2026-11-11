'use client';

import { useTranslations } from 'next-intl';
import type { GrowthSlotView } from '@/server/growth-slot';
import { useMoney } from '../plan/format';
import { formatGrowthCost } from './cost-line';

/** Linia de cost a recomandării, în limba persoanei și moneda afacerii (formatGrowthCost). */
export function useCostLine(view: GrowthSlotView | null): string | null {
  const t = useTranslations('hub.growth.cost');
  const money = useMoney(view?.cost.currency ?? 'RON');
  if (!view) return null;
  return formatGrowthCost(view.cost, money.minor, (key, values) => t(key, values));
}
