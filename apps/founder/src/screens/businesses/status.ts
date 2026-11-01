import type { BusinessStatus } from '@ventora/screens';

/* Starea afacerii în Founder (Lot 2.8): „Activă” ca în design; „Suspendată” (D3-20 a) nu e
   desenată în listă (DE VALIDAT la Design). Lotul 3.4: ce cere atenție din partea comercială,
   ca în FounderBusinesses — „La limită” / „Aproape de limită” (peste 80% la o limită),
   „Probă până pe {date}”. „Plată eșuată” vine cu plățile (Lotul 3.5). */
export type CommercialSignal = {
  /** Cea mai mare parte dintr-o limită (%). */
  topPct?: number | null;
  /** Perioada de probă pe tot abonamentul (D3-5), dacă e în curs. */
  trialUntil?: string | null;
};

export function businessStatus(
  status: 'active' | 'suspended',
  t: (key: 'active' | 'suspended' | 'status.atLimit' | 'status.nearLimit') => string,
  signal: CommercialSignal = {},
  trialLabel?: (date: string) => string,
): BusinessStatus {
  if (status === 'suspended') return { tone: 'neutral', label: t('suspended'), icon: 'lock' };
  const pct = signal.topPct ?? 0;
  if (pct >= 100) return { tone: 'attention', label: t('status.atLimit'), icon: 'triangle-alert' };
  if (pct >= 80) return { tone: 'attention', label: t('status.nearLimit'), icon: 'triangle-alert' };
  if (signal.trialUntil && trialLabel) {
    return { tone: 'neutral', label: trialLabel(signal.trialUntil), icon: 'clock' };
  }
  return { tone: 'done', label: t('active'), icon: 'check' };
}

/** P16: întâi ce cere atenție, apoi alfabetic. */
export const STATUS_RANK = { danger: 0, attention: 1, neutral: 2, done: 3 } as const;
