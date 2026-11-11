import { describe, it, expect } from 'vitest';
import { scoreLead, type ScoreInput } from '../server/scoring';

// Lot CR.10 (D-CRM-17 = the S131 rules): points, reasons, 0–100, the switch.
const base: ScoreInput = {
  offerOpenedAt: null,
  source: 'manual',
  askedPrice: false,
  budgetMinor: null,
  eventDate: null,
  phone: null,
};
const on = { enabled: true, minBudgetMinor: null };

describe('CR.10 — the lead score', () => {
  it('nothing known: 0, no reasons', () => {
    expect(scoreLead(base, on)).toEqual({ score: 0, reasons: [] });
  });

  it('each rule with its points, in the S131 order', () => {
    const s = scoreLead(
      {
        offerOpenedAt: new Date(),
        source: 'referral',
        askedPrice: true,
        budgetMinor: 100000,
        eventDate: '2027-06-01',
        phone: '+40722111222',
      },
      on,
    );
    expect(s!.reasons).toEqual([
      { key: 'offer_opened', points: 20 },
      { key: 'referral', points: 20 },
      { key: 'asked_price', points: 15 },
      { key: 'has_budget', points: 15 },
      { key: 'has_date', points: 10 },
      { key: 'has_phone', points: 5 },
    ]);
    expect(s!.score).toBe(85);
  });

  it('a budget below the minimum: −10; at the minimum or with no minimum: no penalty', () => {
    const lead = { ...base, budgetMinor: 50000 };
    expect(scoreLead(lead, { enabled: true, minBudgetMinor: 80000 })).toEqual({
      score: 5,
      reasons: [
        { key: 'has_budget', points: 15 },
        { key: 'budget_below_minimum', points: -10 },
      ],
    });
    expect(scoreLead(lead, { enabled: true, minBudgetMinor: 50000 })!.score).toBe(15);
    expect(scoreLead(lead, on)!.score).toBe(15);
  });

  it('never below 0', () => {
    // only the penalty cannot happen without a budget; the clamp still holds for any sum
    expect(
      scoreLead({ ...base, budgetMinor: 0 }, { enabled: true, minBudgetMinor: 1 })!.score,
    ).toBe(5);
  });

  it('switched off: no score', () => {
    expect(
      scoreLead({ ...base, phone: '+40722111222' }, { enabled: false, minBudgetMinor: null }),
    ).toBeNull();
  });
});
