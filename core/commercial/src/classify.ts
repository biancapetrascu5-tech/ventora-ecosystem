import type { BillingInterval, Currency } from '@ventora/contracts';

export type PriceKind = 'month' | 'year' | 'setup';

/** What a plan version includes and costs. A quota missing from `quotas` is not included (0). */
export interface VersionTerms {
  applications: readonly string[];
  features: readonly string[];
  /** `null` = unlimited. */
  quotas: Readonly<Record<string, number | null>>;
  prices: ReadonlyArray<{ currency: Currency; kind: PriceKind; amountMinor: number }>;
}

export type ChangeClassification = 'advantage' | 'disadvantage';

export type ChangeReason =
  | { kind: 'price_up'; fromMinor: number; toMinor: number }
  | { kind: 'price_down'; fromMinor: number; toMinor: number }
  | { kind: 'application_removed' | 'application_added'; key: string }
  | { kind: 'feature_removed' | 'feature_added'; key: string }
  | { kind: 'quota_lower' | 'quota_higher'; key: string; from: number | null; to: number | null };

export function priceOf(terms: VersionTerms, currency: Currency, kind: PriceKind): number | null {
  return terms.prices.find((p) => p.currency === currency && p.kind === kind)?.amountMinor ?? null;
}

// null = unlimited sorts above every number
const rank = (v: number | null | undefined) => (v === null ? Infinity : (v ?? 0));

/**
 * ARCHITECTURE §8.5 (P19): moving a subscription from one version to another is in the
 * customer's disadvantage when the price of its currency and interval goes up, or anything is
 * less included (an application, a feature, a lower limit). Otherwise it is in their advantage.
 * Computed, never chosen: Founder cannot bypass it. The reasons are shown in the editor (3.4).
 */
export function classifyChange(
  from: VersionTerms,
  to: VersionTerms,
  billing: { currency: Currency; interval: BillingInterval },
): { classification: ChangeClassification; reasons: ChangeReason[] } {
  const fromPrice = priceOf(from, billing.currency, billing.interval);
  const toPrice = priceOf(to, billing.currency, billing.interval);
  if (toPrice === null) {
    throw new Error(
      `[commercial] the version has no ${billing.interval} price in ${billing.currency}`,
    );
  }
  const reasons: ChangeReason[] = [];
  let worse = false;

  if (fromPrice !== null && toPrice !== fromPrice) {
    const up = toPrice > fromPrice;
    worse ||= up;
    reasons.push({ kind: up ? 'price_up' : 'price_down', fromMinor: fromPrice, toMinor: toPrice });
  }

  const setDiff = (a: readonly string[], b: readonly string[]) => a.filter((x) => !b.includes(x));
  for (const key of setDiff(from.applications, to.applications)) {
    worse = true;
    reasons.push({ kind: 'application_removed', key });
  }
  for (const key of setDiff(to.applications, from.applications)) {
    reasons.push({ kind: 'application_added', key });
  }
  for (const key of setDiff(from.features, to.features)) {
    worse = true;
    reasons.push({ kind: 'feature_removed', key });
  }
  for (const key of setDiff(to.features, from.features)) {
    reasons.push({ kind: 'feature_added', key });
  }

  const keys = [...new Set([...Object.keys(from.quotas), ...Object.keys(to.quotas)])].sort();
  for (const key of keys) {
    const a = key in from.quotas ? from.quotas[key]! : 0;
    const b = key in to.quotas ? to.quotas[key]! : 0;
    if (rank(a) === rank(b)) continue;
    const lower = rank(b) < rank(a);
    worse ||= lower;
    reasons.push({ kind: lower ? 'quota_lower' : 'quota_higher', key, from: a, to: b });
  }

  return { classification: worse ? 'disadvantage' : 'advantage', reasons };
}
