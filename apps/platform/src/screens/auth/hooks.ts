'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { rememberLocale } from '@/i18n/locale';

/** Limba paginii și schimbarea ei din LanguageSwitcher (cookie, apoi textele noi din server). */
export function useLocaleSwitch(): { locale: string; onLocaleChange: (code: string) => void } {
  const router = useRouter();
  const locale = useLocale();
  return {
    locale,
    onLocaleChange: (code) => {
      rememberLocale(code);
      router.refresh();
    },
  };
}

/** Telefon (sub 768px): câmpurile și butoanele mari (size lg), ca în cadrele de 390 din design. */
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

/** Validarea adresei din „Ai uitat parola?”: lipsă / incompletă (după @). */
export function emailProblem(email: string): 'empty' | 'format' | null {
  const v = email.trim();
  if (!v) return 'empty';
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? null : 'format';
}
