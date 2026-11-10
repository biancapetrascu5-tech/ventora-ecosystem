'use client';

import { useLocale, useTranslations } from 'next-intl';
import {
  businessText,
  dateOf,
  pluralOf,
  type BusinessDayData,
  type IntervalData,
  intervalText,
} from './team-format';

/* BookingTeamSchedule (S124): the texts. The keys are booking.team.*; the full names of the days
   and the dates come from Intl in the page's language (the local dates are read as UTC noon). */

export type StaffNextData =
  | { kind: 'leave'; from: string; to: string }
  | { kind: 'off'; date: string }
  | { kind: 'other'; date: string; intervals: IntervalData[] }
  | null;

const cap = (s: string, locale: string) => s.charAt(0).toLocaleUpperCase(locale) + s.slice(1);

export function useTeamTexts() {
  const t = useTranslations('booking.team');
  const roles = useTranslations('roles');
  const locale = useLocale();
  const fmt = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...o, timeZone: 'UTC' });
  // 2026-11-16 is a Monday: weekday w → 2026-11-(15 + w)
  const weekdayDate = (w: number) => new Date(Date.UTC(2026, 10, 15 + w, 12));
  const dayShort = (w: number) => t(`day.${w}`);
  const dayLong = (w: number) => fmt({ weekday: 'long' }).format(weekdayDate(w));
  const sameMonth = (a: string, b: string) => a.slice(0, 7) === b.slice(0, 7);

  return {
    t,
    locale,
    dayShort,
    /** „joi” (inside a sentence) */
    dayLong,
    /** „Luni” (a label) */
    dayLabel: (w: number) => cap(dayLong(w), locale),
    role: (role: string) =>
      role === 'owner' || role === 'admin' || role === 'member' ? roles(role) : role,
    business: (b: readonly BusinessDayData[]) =>
      businessText(b, dayShort, (days) => t('businessClosedDay', { day: days })),
    /** „Sâmbătă, 14 noiembrie” */
    dateLong: (d: string) =>
      cap(fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(dateOf(d)), locale),
    /** „sâm., 14 nov.” */
    dateShort: (d: string) =>
      fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(dateOf(d)),
    /** „3 nov.” */
    dayMonth: (d: string) => fmt({ day: 'numeric', month: 'short' }).format(dateOf(d)),
    /** „16–20 noiembrie” */
    rangeLong: (a: string, b: string) =>
      fmt({ day: 'numeric', month: 'long' }).formatRange(dateOf(a), dateOf(b)),
    leaveDays: (n: number) => t(`leave.days.${pluralOf(n)}`, { n }),
    pastCount: (n: number) => t(`inactive.past.${pluralOf(n)}`, { n }),
    next: (n: StaffNextData) => {
      if (!n) return t('next.none');
      if (n.kind === 'leave') {
        // „Concediu 16–20 nov.”: the first day without the month when both are in the same month
        const to = fmt({ day: 'numeric', month: 'short' }).format(dateOf(n.to));
        const from = sameMonth(n.from, n.to)
          ? fmt({ day: 'numeric' }).format(dateOf(n.from))
          : fmt({ day: 'numeric', month: 'short' }).format(dateOf(n.from));
        return t('next.leave', { from, to });
      }
      const date = fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(dateOf(n.date));
      if (n.kind === 'off') return t('next.off', { date });
      return t('next.other', { date, time: n.intervals.map(intervalText).join(', ') });
    },
  };
}

export type TeamTexts = ReturnType<typeof useTeamTexts>;
