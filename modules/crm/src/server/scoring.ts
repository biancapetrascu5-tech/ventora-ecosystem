/*
 * Lot CR.10 — the lead score (D-CRM-17, decided 11.11.2026 as recommended by Design in S131):
 * simple rules with points, the sum clamped to 0–100, shown as reasons („+20 recomandare · +15 are
 * buget”). No AI, no sensitive data. Off for the business (settings.lead_scoring_enabled): no score.
 * The same rules are an SQL expression for sorting the inbox by score (scoreSql).
 */

export const SCORE_RULES = [
  { key: 'offer_opened', points: 20 },
  { key: 'referral', points: 20 },
  { key: 'asked_price', points: 15 },
  { key: 'has_budget', points: 15 },
  { key: 'has_date', points: 10 },
  { key: 'has_phone', points: 5 },
  { key: 'budget_below_minimum', points: -10 },
] as const;
export type ScoreRuleKey = (typeof SCORE_RULES)[number]['key'];
export type ScoreReason = { key: ScoreRuleKey; points: number };
export type LeadScore = { score: number; reasons: ScoreReason[] };

export type ScoreInput = {
  offerOpenedAt: Date | null;
  source: string;
  askedPrice: boolean;
  budgetMinor: number | null;
  eventDate: string | null;
  phone: string | null;
};

const POINTS = Object.fromEntries(SCORE_RULES.map((r) => [r.key, r.points])) as Record<
  ScoreRuleKey,
  number
>;

/** The score and its reasons; null when the business switched scoring off. */
export function scoreLead(
  lead: ScoreInput,
  settings: { enabled: boolean; minBudgetMinor: number | null },
): LeadScore | null {
  if (!settings.enabled) return null;
  const hits: ScoreRuleKey[] = [];
  if (lead.offerOpenedAt) hits.push('offer_opened');
  if (lead.source === 'referral') hits.push('referral');
  if (lead.askedPrice) hits.push('asked_price');
  if (lead.budgetMinor !== null) hits.push('has_budget');
  if (lead.eventDate) hits.push('has_date');
  if (lead.phone) hits.push('has_phone');
  if (
    lead.budgetMinor !== null &&
    settings.minBudgetMinor !== null &&
    lead.budgetMinor < settings.minBudgetMinor
  ) {
    hits.push('budget_below_minimum');
  }
  const reasons = hits.map((key) => ({ key, points: POINTS[key] }));
  const sum = reasons.reduce((s, r) => s + r.points, 0);
  return { score: Math.max(0, Math.min(100, sum)), reasons };
}

/** The same rules in SQL, on a lead aliased `l` and the minimum budget `min` (for sorting). */
export function scoreSql(min: string): string {
  return `LEAST(100, GREATEST(0,
    (CASE WHEN l.offer_opened_at IS NOT NULL THEN 20 ELSE 0 END)
  + (CASE WHEN l.source = 'referral' THEN 20 ELSE 0 END)
  + (CASE WHEN l.asked_price THEN 15 ELSE 0 END)
  + (CASE WHEN l.budget_minor IS NOT NULL THEN 15 ELSE 0 END)
  + (CASE WHEN l.event_date IS NOT NULL THEN 10 ELSE 0 END)
  + (CASE WHEN l.phone IS NOT NULL THEN 5 ELSE 0 END)
  - (CASE WHEN l.budget_minor IS NOT NULL AND ${min} IS NOT NULL AND l.budget_minor < ${min} THEN 10 ELSE 0 END)
  ))`;
}
