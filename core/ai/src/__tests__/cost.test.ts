import { describe, it, expect } from 'vitest';
import { computeCostRon, currentPeriod } from '../cost';
import type { AiModelConfig } from '../types';

const MODEL: AiModelConfig = {
  slug: 'gpt-4o',
  provider: 'openai',
  providerModelId: 'gpt-4o',
  displayName: 'GPT-4o',
  maxInputTokens: 128_000,
  maxOutputTokens: 16_384,
  costPerInputTokenRon: 0.0000118795,
  costPerOutputTokenRon: 0.000047518,
};

describe('computeCostRon', () => {
  it('is zero for zero tokens', () => {
    expect(computeCostRon(MODEL, 0, 0)).toBe(0);
  });

  it('1M input + 1M output tokens = the per-million prices in lei', () => {
    expect(computeCostRon(MODEL, 1_000_000, 1_000_000)).toBeCloseTo(11.8795 + 47.518, 8);
  });
});

describe('currentPeriod (Europe/Bucharest)', () => {
  it('the month changes at midnight in Bucharest, not in UTC (winter time, UTC+2)', () => {
    // 2026-10-31 23:59:59 Bucharest = 21:59:59Z; 2026-11-01 00:00 Bucharest = 22:00Z
    expect(currentPeriod(new Date('2026-10-31T21:59:59Z'))).toEqual({ year: 2026, month: 10 });
    expect(currentPeriod(new Date('2026-10-31T22:00:00Z'))).toEqual({ year: 2026, month: 11 });
  });

  it('summer time (UTC+3): 1 July starts at 30 June 21:00Z', () => {
    expect(currentPeriod(new Date('2026-06-30T20:59:59Z'))).toEqual({ year: 2026, month: 6 });
    expect(currentPeriod(new Date('2026-06-30T21:00:00Z'))).toEqual({ year: 2026, month: 7 });
  });

  it('year boundary', () => {
    expect(currentPeriod(new Date('2026-12-31T22:00:00Z'))).toEqual({ year: 2027, month: 1 });
  });
});
