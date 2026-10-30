import type { BusinessStatus } from '@ventora/screens';

/* Starea afacerii în Founder (Lot 2.8): „Activă” ca în design; „Suspendată” (D3-20 a) nu e
   desenată în listă (DE VALIDAT la Design). */
export function businessStatus(
  status: 'active' | 'suspended',
  t: (key: 'active' | 'suspended') => string,
): BusinessStatus {
  return status === 'suspended'
    ? { tone: 'neutral', label: t('suspended'), icon: 'lock' }
    : { tone: 'done', label: t('active'), icon: 'check' };
}
