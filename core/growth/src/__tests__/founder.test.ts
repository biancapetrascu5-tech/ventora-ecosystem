import { describe, expect, it, vi } from 'vitest';

vi.mock('@ventora/identity', () => ({ requireFounderSession: async () => ({ userId: 'x' }) }));

const { campaignOverlaps, GROWTH_CAP_LIMITS, GROWTH_LOG_ACTIONS } = await import('../founder');

// Lot 5.10 — the pure parts of Founder · Growth.

const RULE = {
  match: 'all',
  rules: [{ criterion: 'user.role', operator: 'is_not', value: 'member' }],
};
const k = (id: string, over: Record<string, unknown> = {}) =>
  ({
    id,
    name: id,
    slots: ['hub.launcher.other'],
    rule: RULE,
    audienceRole: 'buyer',
    status: 'active',
    ...over,
  }) as never;

describe('campaignOverlaps (5.10b)', () => {
  it('another active campaign on the same slot, for the same audience', () => {
    expect(campaignOverlaps(k('a'), [k('a'), k('b')])).toEqual([
      { campaignId: 'b', name: 'b', slots: ['hub.launcher.other'] },
    ]);
  });

  it('not: another slot, another rule, another role, or not active', () => {
    expect(
      campaignOverlaps(k('a'), [
        k('b', { slots: ['hub.plan.packs'] }),
        k('c', { rule: { match: 'any', rules: [] } }),
        k('d', { audienceRole: 'member' }),
        k('e', { status: 'stopped' }),
      ]),
    ).toEqual([]);
  });
});

describe('the caps and the log', () => {
  it('P25: at most 2 a day, 5 a week, at least 14 days after a dismissal', () => {
    expect(GROWTH_CAP_LIMITS.dailyPerUser.max).toBe(2);
    expect(GROWTH_CAP_LIMITS.weeklyPerUser.max).toBe(5);
    expect(GROWTH_CAP_LIMITS.dismissCooldownDays.min).toBe(14);
  });

  it('the log covers every growth.* action', () => {
    expect(GROWTH_LOG_ACTIONS).toContain('growth.campaign_slot_removed');
    expect(GROWTH_LOG_ACTIONS).toContain('growth.caps_changed');
    expect(GROWTH_LOG_ACTIONS.every((a) => a.startsWith('growth.'))).toBe(true);
  });
});
