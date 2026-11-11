import { describe, expect, it } from 'vitest';
import { validateEligibilityRule } from '@ventora/contracts';
import { audienceRoleOf, fromUiRules, toUiRules } from '../rules';

// Lotul 5.10b — RuleBuilder ↔ regula de eligibilitate; ce iese trece validatorul din contract.

describe('fromUiRules / toUiRules', () => {
  it('builds a rule the contract accepts, and reads it back', () => {
    const rows = [
      { id: 'a', criterion: 'organization.applications', operator: 'includes', value: 'booking' },
      { id: 'b', criterion: 'organization.applications', operator: 'excludes', value: 'crm' },
      { id: 'c', criterion: 'user.role', operator: 'is', value: 'owner' },
      { id: 'd', criterion: 'organization.age_days', operator: 'gte', value: '30' },
    ];
    const r = fromUiRules('all', rows);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(validateEligibilityRule(r.rule).ok).toBe(true);
    expect(r.rule.rules[3]).toEqual({
      criterion: 'organization.age_days',
      operator: 'gte',
      value: 30,
    });
    expect(toUiRules(r.rule).rows.map((x) => x.value)).toEqual(['booking', 'crm', 'owner', '30']);
  });

  it('refuses: no condition, a criterion outside the whitelist, a bad number', () => {
    expect(fromUiRules('all', []).ok).toBe(false);
    expect(
      fromUiRules('all', [{ id: 'a', criterion: 'client.health', operator: 'is', value: 'x' }]).ok,
    ).toBe(false);
    expect(
      fromUiRules('any', [
        { id: 'a', criterion: 'organization.members', operator: 'gte', value: '-1' },
      ]).ok,
    ).toBe(false);
  });

  it('P21: a campaign for members only when the rule says role is member', () => {
    expect(
      audienceRoleOf([{ id: 'a', criterion: 'user.role', operator: 'is', value: 'member' }]),
    ).toBe('member');
    expect(
      audienceRoleOf([{ id: 'a', criterion: 'user.role', operator: 'is', value: 'owner' }]),
    ).toBe('buyer');
  });
});
