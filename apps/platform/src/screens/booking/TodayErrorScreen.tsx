'use client';

import { useRouter } from 'next/navigation';
import { LoadError } from '@ventora/booking/ui';
import s from './today-error.module.css';

/* BookingStates „Azi · eroare la încărcare”: the day could not be read; „Încearcă din nou” reads
   the page again. */
export function TodayErrorScreen() {
  const router = useRouter();
  return (
    <div className={s.wrap}>
      <LoadError onRetry={() => router.refresh()} />
    </div>
  );
}
