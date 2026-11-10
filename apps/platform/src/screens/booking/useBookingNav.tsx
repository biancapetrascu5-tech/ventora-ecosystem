'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { UsageMeter, type NavSection } from '@ventora/ui';
import { readBookingShell, type BookingShellData } from '@/server/booking-services-actions';

/* Lot B.1-UI — the EasyBook Spine (preview.html BK_SECTIONS), inside the Hub shell under /booking.
   S123-1: „Servicii” opens the catalog page in Setări. S123-9: the entries without a screen yet
   open their routes, which answer 404 until their lots (B.6). S123-8: „Setări” only for
   booking:settings. The meter: appointments this month, when the plan has a limit. */

export const BOOKING_ROUTES: { id: string; href: string }[] = [
  { id: 'azi', href: '/booking/today' },
  { id: 'calendar', href: '/booking/calendar' },
  { id: 'programari', href: '/booking/appointments' },
  { id: 'clienti', href: '/booking/clients' },
  { id: 'servicii', href: '/booking/settings/services' },
  // B.2-UI (decision 2): „Echipa” opens Setări · „Programul echipei”
  { id: 'angajati', href: '/booking/settings/team' },
  { id: 'rapoarte', href: '/booking/reports' },
  { id: 'setari', href: '/booking/settings' },
];
export const BOOKING_BOTTOM = ['azi', 'calendar', 'programari', 'clienti'];

const hrefOf = (id: string) => BOOKING_ROUTES.find((r) => r.id === id)?.href;

/** Setări (and its tabs, „Servicii” included) is the active entry under /booking/settings. */
export function bookingActive(pathname: string): string | undefined {
  if (pathname === '/booking/settings' || pathname.startsWith('/booking/settings/'))
    return 'setari';
  return BOOKING_ROUTES.find((r) => pathname === r.href || pathname.startsWith(`${r.href}/`))?.id;
}

export function useBookingNav(enabled: boolean): {
  sections: NavSection[];
  footer?: React.ReactNode;
} {
  const t = useTranslations('booking.nav');
  const locale = useLocale();
  const [shell, setShell] = useState<BookingShellData | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void readBookingShell().then((s) => {
      if (live) setShell(s);
    });
    return () => {
      live = false;
    };
  }, [enabled]);

  const item = (id: string, label: string, icon: NavSection['items'][number]['icon']) => ({
    id,
    label,
    icon,
    href: hrefOf(id),
  });
  const sections: NavSection[] = [
    {
      items: [
        item('azi', t('today'), 'house'),
        item('calendar', t('calendar'), 'calendar'),
        item('programari', t('appointments'), 'list'),
      ],
    },
    {
      label: t('manage'),
      items: [
        item('clienti', t('clients'), 'users'),
        item('servicii', t('services'), 'boxes'),
        // decision 3: „Echipa” (Setări · „Programul echipei”) only for booking:settings
        ...(shell?.canSettings === false ? [] : [item('angajati', t('team'), 'contact')]),
      ],
    },
    {
      label: t('business'),
      items: [
        item('rapoarte', t('reports'), 'chart-column'),
        ...(shell?.canSettings === false ? [] : [item('setari', t('settings'), 'settings')]),
      ],
    },
  ];
  const month = new Intl.DateTimeFormat(locale, {
    month: 'long',
    timeZone: 'Europe/Bucharest',
  }).format(new Date());
  const footer = shell?.usage ? (
    <UsageMeter
      compact
      label={t('usage', { month })}
      used={shell.usage.used}
      limit={shell.usage.limit}
      locale={locale}
    />
  ) : undefined;
  return { sections, footer };
}
