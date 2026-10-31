'use client';

import { useSyncExternalStore } from 'react';
import { useLocale, useTranslations } from 'next-intl';

/* Ora și data în ecrane (S110, Lot 2.7 G2): „Activ acum”, „Azi, 14:32”, „Ieri, 21:40”, apoi
   „28 oct., 09:15” (anul doar dacă e alt an). Engleza folosește formatul britanic (en-GB:
   „28 Oct, 09:15”), nu american; celelalte limbi, formatul Intl al limbii („21:40” și în
   franceză). Fusul orar e al browserului (pe server, cel configurat; după hidratare, al
   browserului). */

/** Limba Intl pentru o limbă a ecosistemului: engleza e britanică. */
export function intlLocale(locale: string): string {
  return locale === 'en' ? 'en-GB' : locale;
}

function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

const noSubscribe = () => () => {};

/** Fusul orar al browserului, după hidratare; undefined pe server. */
export function useTimeZone(): string | undefined {
  return useSyncExternalStore(noSubscribe, browserTimeZone, () => undefined);
}

/** Ziua calendaristică (AAAA-LL-ZZ) a unei date în fusul dat. */
function dayKey(d: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export type DateFormats = {
  /** „09:15” */
  time: (d: Date) => string;
  /** „28 oct.” (anul doar dacă e alt an) */
  day: (d: Date) => string;
  /** „mar. 2025” */
  monthYear: (d: Date) => string;
};

/** Formatele de dată în limba ecranului (engleza britanică), în fusul browserului. */
export function useDates(): DateFormats {
  const locale = intlLocale(useLocale());
  const timeZone = useTimeZone();
  const zone = timeZone ? { timeZone } : {};
  return {
    time: (d) =>
      new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        ...zone,
      }).format(d),
    day: (d) => {
      const sameYear = dayKey(d, timeZone).slice(0, 4) === dayKey(new Date(), timeZone).slice(0, 4);
      return new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        ...(sameYear ? {} : { year: 'numeric' }),
        ...zone,
      }).format(d);
    },
    monthYear: (d) =>
      new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', ...zone }).format(d),
  };
}

export function useWhen(): (date: Date, opts?: { now?: boolean }) => string {
  const t = useTranslations('account.security.when');
  const dates = useDates();
  const timeZone = useTimeZone();

  return (date, opts) => {
    if (opts?.now) return t('now');
    const time = dates.time(date);
    const now = new Date();
    const day = dayKey(date, timeZone);
    if (day === dayKey(now, timeZone)) return t('today', { time });
    if (day === dayKey(new Date(now.getTime() - 86_400_000), timeZone)) {
      return t('yesterday', { time });
    }
    return t('date', { date: dates.day(date), time });
  };
}
