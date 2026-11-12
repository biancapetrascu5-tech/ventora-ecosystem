'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { ScheduleStatusLabels } from '@ventora/ui';
import { dayDate, weekDays, weekdayOf } from './calendar-format';

/* BookingCalendar (B.6a): the texts, keys booking.calendar.*. The long names of the days and the
   months come from Intl in the page's language (the local days read as UTC noon); the short ones
   and the date patterns are keys, because the design writes them its own way („Vin, 23 oct.”,
   „Fr., 23. Okt.”, „ven 23 ott.”). */

const cap = (s: string, locale: string) => s.charAt(0).toLocaleUpperCase(locale) + s.slice(1);

export function useCalendarTexts() {
  const t = useTranslations('booking.calendar');
  const locale = useLocale();
  const fmt = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...o, timeZone: 'UTC' });
  const day = (iso: string) => dayDate(iso).getUTCDate();
  const month = (iso: string) => dayDate(iso).getUTCMonth() + 1;
  const monthLong = (iso: string) => fmt({ month: 'long' }).format(dayDate(iso));
  /** „Vineri”, „Freitag”, „Venerdì” */
  const weekdayLong = (iso: string) => cap(fmt({ weekday: 'long' }).format(dayDate(iso)), locale);
  /** „joi” inside a sentence (German keeps the capital: its days are nouns) */
  const weekdayInText = (iso: string) => {
    const w = fmt({ weekday: 'long' }).format(dayDate(iso));
    return locale === 'de' ? w : w.toLocaleLowerCase(locale);
  };

  return {
    t,
    locale,
    weekdayInText,
    /** „Vineri, 23 octombrie” */
    dateLong: (iso: string) =>
      t('date.long', { weekday: weekdayLong(iso), day: day(iso), month: monthLong(iso) }),
    /** „Vin, 23 oct.” */
    dateShort: (iso: string) =>
      t('date.short', {
        weekday: t(`dayShort.${weekdayOf(iso)}`),
        day: day(iso),
        month: t(`monthShort.${month(iso)}`),
      }),
    /** „19–25 octombrie”, or „27 oct. – 2 nov.” across two months */
    weekRange: (iso: string) => {
      const days = weekDays(iso);
      const first = days[0]!;
      const last = days[6]!;
      return month(first) === month(last)
        ? t('date.range', { from: day(first), to: day(last), month: monthLong(last) })
        : t('date.rangeMonths', {
            from: day(first),
            fromMonth: monthLong(first),
            to: day(last),
            month: monthLong(last),
          });
    },
    /** The week view's column: „Vin 23” */
    dayColumnLabel: (iso: string) =>
      t('date.col', { weekday: t(`dayCol.${weekdayOf(iso)}`), day: day(iso) }),
    /** „14 programări azi · 3 angajați · deschis 09:00–19:00” */
    summary: (o: {
      appointments: number;
      staff: number;
      isToday: boolean;
      open: { from: string; to: string } | null;
    }) =>
      [
        t(o.isToday ? 'summary.appointmentsToday' : 'summary.appointmentsDay', {
          count: o.appointments,
        }),
        t('summary.staff', { count: o.staff }),
        o.open ? t('summary.open', o.open) : t('summary.closed'),
      ].join(' · '),
    /** The day view's column: „Coafor · 6 programări” */
    daySub: (role: string, count: number) => t('daySub', { role, count }),
    statusLabels: (): ScheduleStatusLabels => ({
      done: t('status.done'),
      now: t('status.now'),
      confirmed: t('status.confirmed'),
      unconfirmed: t('status.unconfirmed'),
      cancelled: t('status.cancelled'),
      noshow: t('status.noshow'),
      blocked: t('status.blocked'),
    }),
    /** „Mara și Radu” */
    names: (list: string[]) =>
      new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(list),
  };
}

export type CalendarTexts = ReturnType<typeof useCalendarTexts>;
