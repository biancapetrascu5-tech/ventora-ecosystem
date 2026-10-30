'use client';

import { useSyncExternalStore } from 'react';
import { useFormatter, useTranslations } from 'next-intl';

/* Ora în Contul tău · Securitate (S110): „Activ acum”, „Azi, 14:32”, „Ieri, 21:40”, apoi
   „28 oct., 09:15” (anul doar dacă e alt an). Limba e a utilizatorului; fusul orar e al
   browserului lui (pe server, fusul configurat; după hidratare, cel al browserului). */

function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

const noSubscribe = () => () => {};

/** Ziua calendaristică (AAAA-LL-ZZ) a unei date în fusul dat. */
function dayKey(d: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function useWhen(): (date: Date, opts?: { now?: boolean }) => string {
  const t = useTranslations('account.security.when');
  const format = useFormatter();
  const timeZone = useSyncExternalStore(noSubscribe, browserTimeZone, () => undefined);

  return (date, opts) => {
    if (opts?.now) return t('now');
    const zone = timeZone ? { timeZone } : {};
    const time = format.dateTime(date, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      ...zone,
    });
    const now = new Date();
    const day = dayKey(date, timeZone);
    if (day === dayKey(now, timeZone)) return t('today', { time });
    if (day === dayKey(new Date(now.getTime() - 86_400_000), timeZone)) {
      return t('yesterday', { time });
    }
    const sameYear = day.slice(0, 4) === dayKey(now, timeZone).slice(0, 4);
    const label = format.dateTime(date, {
      day: 'numeric',
      month: 'short',
      ...(sameYear ? {} : { year: 'numeric' }),
      ...zone,
    });
    return t('date', { date: label, time });
  };
}
