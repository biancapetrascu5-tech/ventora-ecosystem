import type { GrowthEligibilityRule } from '@ventora/contracts';

/*
 * Lotul 5.10b — rândurile RuleBuilder ↔ regula de eligibilitate (GROWTH §2.4). Doar criteriile din
 * lista albă au un rând; operatorii au aceleași nume ca în contract (includes / excludes / is /
 * is_not / gte / lte), iar ecranul le arată în română. „Consum” (are nevoie și de cheia limitei)
 * și „Semnal” (modul campaniei) nu sunt rânduri aici. Pur, ca să fie testat.
 */

export type UiRule = { id: string; criterion: string; operator: string; value: string };

export const UI_CRITERIA = [
  'organization.applications',
  'organization.plan',
  'organization.age_days',
  'organization.members',
  'organization.country',
  'user.role',
  'user.locale',
] as const;
export type UiCriterion = (typeof UI_CRITERIA)[number];

export const OPERATORS: Record<UiCriterion, readonly string[]> = {
  'organization.applications': ['includes', 'excludes'],
  'organization.plan': ['is', 'is_not'],
  'organization.age_days': ['gte', 'lte'],
  'organization.members': ['gte', 'lte'],
  'organization.country': ['is', 'is_not'],
  'user.role': ['is', 'is_not'],
  'user.locale': ['is', 'is_not'],
};

const NUMERIC = new Set(['organization.age_days', 'organization.members']);

export function toUiRules(rule: unknown): { match: 'all' | 'any'; rows: UiRule[] } {
  const r = rule as Partial<GrowthEligibilityRule> | null;
  const rows: UiRule[] = [];
  for (const [i, c] of (r?.rules ?? []).entries()) {
    if (!(UI_CRITERIA as readonly string[]).includes(c.criterion)) continue;
    rows.push({
      id: String(i + 1),
      criterion: c.criterion,
      operator: c.operator,
      value: String((c as { value: unknown }).value),
    });
  }
  return { match: r?.match === 'any' ? 'any' : 'all', rows };
}

/**
 * The rule the database will check, or the reason it cannot be built. At least one condition;
 * numbers must be whole and not negative. The server validates again (validateEligibilityRule).
 */
export function fromUiRules(
  match: 'all' | 'any',
  rows: readonly UiRule[],
): { ok: true; rule: GrowthEligibilityRule } | { ok: false } {
  const rules: GrowthEligibilityRule['rules'] = [];
  for (const row of rows) {
    if (!(UI_CRITERIA as readonly string[]).includes(row.criterion)) return { ok: false };
    const crit = row.criterion as UiCriterion;
    if (!OPERATORS[crit].includes(row.operator) || row.value.trim() === '') return { ok: false };
    if (NUMERIC.has(crit)) {
      const n = Number(row.value);
      if (!Number.isInteger(n) || n < 0) return { ok: false };
      rules.push({ criterion: crit, operator: row.operator, value: n } as never);
    } else {
      rules.push({ criterion: crit, operator: row.operator, value: row.value.trim() } as never);
    }
  }
  if (rules.length === 0) return { ok: false };
  return { ok: true, rule: { match, rules } };
}

/** P21: members only ever get „Recomandă aplicația” — a campaign for members says so in its rule. */
export function audienceRoleOf(rows: readonly UiRule[]): 'buyer' | 'member' {
  return rows.some(
    (r) => r.criterion === 'user.role' && r.operator === 'is' && r.value === 'member',
  )
    ? 'member'
    : 'buyer';
}
