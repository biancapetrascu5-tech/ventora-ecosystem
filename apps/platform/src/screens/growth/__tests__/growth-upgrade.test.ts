import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GrowthOfferCost } from '@ventora/contracts';
import { formatGrowthCost, type CostText } from '../cost-line';

/*
 * Lotul 5.9c (FAZA-5, „Gata când”):
 *   - prețul, periodicitatea, costul de implementare și condițiile probei sunt în linia de cost,
 *     afișată pe card și în pasul `options` al UpgradeDialog, înainte de orice confirmare;
 *   - nicio activare plătită fără confirmare: din recomandare nu se apelează nicio plată, iar proba
 *     pornește doar din butonul pasului `confirm` („Începe perioada de probă”).
 */

const RO: Record<string, string> = {
  month: '{amount} pe lună',
  year: '{amount} pe an',
  once: '{amount}, o singură dată',
  trial: 'Gratuit {days} zile. Apoi {price}, doar dacă alegi să continui.',
  setup: 'implementare {amount}, o singură dată',
  noSetup: 'fără cost de implementare',
};
const t: CostText = (key, values = {}) =>
  RO[key]!.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k]));
const lei = (m: number) => `${m / 100} lei`;
const cost = (c: Partial<GrowthOfferCost>): GrowthOfferCost => ({
  currency: 'RON',
  amountMinor: 4900,
  interval: 'month',
  setupMinor: null,
  trial: null,
  ...c,
});

describe('linia de cost a unei recomandări (D-GRW-10)', () => {
  it('prețul, periodicitatea și „fără cost de implementare”', () => {
    expect(formatGrowthCost(cost({}), lei, t)).toBe('49 lei pe lună · fără cost de implementare');
    expect(formatGrowthCost(cost({ interval: 'year', amountMinor: 49000 }), lei, t)).toBe(
      '490 lei pe an · fără cost de implementare',
    );
  });

  it('costul de implementare, când există', () => {
    expect(formatGrowthCost(cost({ setupMinor: 150000 }), lei, t)).toBe(
      '49 lei pe lună · implementare 1500 lei, o singură dată',
    );
  });

  it('condițiile probei: gratuit N zile, apoi prețul, doar la alegere', () => {
    const trial = { days: 14, requiresCard: false as const, atEnd: 'pause' as const };
    expect(formatGrowthCost(cost({ trial, amountMinor: 7900 }), lei, t)).toBe(
      'Gratuit 14 zile. Apoi 79 lei pe lună, doar dacă alegi să continui.',
    );
    expect(formatGrowthCost(cost({ trial, setupMinor: 50000 }), lei, t)).toContain(
      'implementare 500 lei',
    );
  });
});

describe('nicio activare plătită fără confirmare', () => {
  const dir = join(__dirname, '..');
  const src = (f: string) => readFileSync(join(dir, f), 'utf8');

  it('recomandarea nu apelează nicio plată sau activare', () => {
    for (const f of ['GrowthRecommendation.tsx', 'GrowthUpgrade.tsx']) {
      expect(src(f)).not.toMatch(/\b(buy|confirmBuy|previewBuy|activateApplication)\b/);
    }
    expect(src('GrowthRecommendation.tsx')).not.toMatch(/\bstartTrial\b/);
  });

  it('proba pornește doar din pasul confirm (onPay), nu din options (onContinue)', () => {
    const s = src('GrowthUpgrade.tsx');
    expect(s.match(/startTrial\(/g)).toHaveLength(1);
    expect(s).toMatch(/const begin = async \(\) => \{[\s\S]*?await startTrial\(view\.app\)/);
    expect(s.match(/\bbegin\(\)/g)).toHaveLength(1);
    expect(s).toMatch(/onPay=\{\(\) => void begin\(\)\}/);
    const cont = s.slice(s.indexOf('onContinue={() => {'), s.indexOf('summary={'));
    expect(cont).not.toMatch(/begin|startTrial/);
    expect(cont).toMatch(/setStep\('confirm'\)/);
  });
});
