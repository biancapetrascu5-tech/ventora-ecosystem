import { describe, it, expect } from 'vitest';
import { computeCostRon, currentPeriod } from '../cost';
import type { AiModelConfig } from '../types';

const MODEL: AiModelConfig = {
  slug: 'gpt-4o-mini',
  provider: 'openai',
  providerModelId: 'gpt-4o-mini',
  displayName: 'GPT-4o Mini',
  maxInputTokens: 128_000,
  maxOutputTokens: 16_384,
  costPerInputTokenRon: 0.000_000_745,
  costPerOutputTokenRon: 0.000_002_98,
};

describe('computeCostRon', () => {
  it('computes cost for zero tokens', () => {
    expect(computeCostRon(MODEL, 0, 0)).toBe(0);
  });

  it('computes cost for typical usage', () => {
    const cost = computeCostRon(MODEL, 1000, 500);
    const expected = 1000 * 0.000_000_745 + 500 * 0.000_002_98;
    expect(cost).toBeCloseTo(expected, 10);
  });

  it('computes cost for large input', () => {
    const cost = computeCostRon(MODEL, 100_000, 1000);
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBe(100_000 * MODEL.costPerInputTokenRon + 1000 * MODEL.costPerOutputTokenRon);
  });
});

describe('currentPeriod', () => {
  it('returns current year and month', () => {
    const period = currentPeriod();
    expect(period.year).toBeGreaterThanOrEqual(2026);
    expect(period.month).toBeGreaterThanOrEqual(1);
    expect(period.month).toBeLessThanOrEqual(12);
  });

  it('returns period for a specific date', () => {
    const period = currentPeriod(new Date('2026-03-15T00:00:00Z'));
    expect(period.year).toBe(2026);
    expect(period.month).toBe(3);
  });

  it('handles year boundary', () => {
    const period = currentPeriod(new Date('2027-01-01T00:00:00Z'));
    expect(period.year).toBe(2027);
    expect(period.month).toBe(1);
  });
});
