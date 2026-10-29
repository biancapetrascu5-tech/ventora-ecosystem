'use client';

import { useEffect, useState } from 'react';

/** Telefon (sub 768px): câmpurile mari (size lg), ca în cadrele de 390 din design. */
export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setPhone(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return phone;
}

export function emailProblem(email: string): 'empty' | 'format' | null {
  const v = email.trim();
  if (!v) return 'empty';
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? null : 'format';
}

/** Founder e doar în română (S57): fără schimbarea limbii. */
export function useLocaleSwitch(): { locale: string } {
  return { locale: 'ro' };
}
