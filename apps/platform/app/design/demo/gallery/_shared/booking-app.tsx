/* eslint-disable i18next/no-literal-string -- the example data of the S116 / S127 previews */
'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  AccountMenu,
  AppShell,
  ContextBar,
  NotificationsPanel,
  OrgSwitcher,
  Spine,
  UsageMeter,
  type NavSection,
  type NotificationData,
} from '@ventora/ui';
import { noop } from './shell';
import type { Lang } from './booking-rows';

/* The EasyBook shell of the S116 / S127 previews (BookingClientCard, BookingMoney,
   BookingPayments: the same BookingApp, BK_SECTIONS, BK_USAGE, ORGS, NOTIFS and USER in each
   preview.html), with the strings of the components from the platform catalogs. */

// preview.html BK_SECTIONS / BK_USAGE / ORGS / NOTIFS / USER of this preview
const SECTIONS: Record<Lang, NavSection[]> = {
  ro: [
    {
      items: [
        { id: 'azi', label: 'Azi', icon: 'house' },
        { id: 'calendar', label: 'Calendar', icon: 'calendar' },
        { id: 'programari', label: 'Programări', icon: 'list', badge: 3 },
      ],
    },
    {
      label: 'Gestionare',
      items: [
        { id: 'clienti', label: 'Clienți', icon: 'users' },
        { id: 'servicii', label: 'Servicii', icon: 'boxes' },
        { id: 'angajati', label: 'Echipa', icon: 'contact' },
      ],
    },
    {
      label: 'Afacere',
      items: [
        { id: 'rapoarte', label: 'Rapoarte', icon: 'chart-column' },
        { id: 'setari', label: 'Setări', icon: 'settings' },
      ],
    },
  ],
  de: [
    {
      items: [
        { id: 'azi', label: 'Heute', icon: 'house' },
        { id: 'calendar', label: 'Kalender', icon: 'calendar' },
        { id: 'programari', label: 'Termine', icon: 'list', badge: 3 },
      ],
    },
    {
      label: 'Verwaltung',
      items: [
        { id: 'clienti', label: 'Kunden', icon: 'users' },
        { id: 'servicii', label: 'Leistungen', icon: 'boxes' },
        { id: 'angajati', label: 'Team', icon: 'contact' },
      ],
    },
    {
      label: 'Unternehmen',
      items: [
        { id: 'rapoarte', label: 'Berichte', icon: 'chart-column' },
        { id: 'setari', label: 'Einstellungen', icon: 'settings' },
      ],
    },
  ],
  it: [
    {
      items: [
        { id: 'azi', label: 'Oggi', icon: 'house' },
        { id: 'calendar', label: 'Calendario', icon: 'calendar' },
        { id: 'programari', label: 'Appuntamenti', icon: 'list', badge: 3 },
      ],
    },
    {
      label: 'Gestione',
      items: [
        { id: 'clienti', label: 'Clienti', icon: 'users' },
        { id: 'servicii', label: 'Servizi', icon: 'boxes' },
        { id: 'angajati', label: 'Team', icon: 'contact' },
      ],
    },
    {
      label: 'Attività',
      items: [
        { id: 'rapoarte', label: 'Report', icon: 'chart-column' },
        { id: 'setari', label: 'Impostazioni', icon: 'settings' },
      ],
    },
  ],
};
const USAGE: Record<Lang, string> = {
  ro: 'Programări în noiembrie',
  de: 'Termine im November',
  it: 'Appuntamenti a novembre',
};
const ORGS: Record<Lang, { id: string; name: string; role: string }[]> = {
  ro: [
    { id: 'aurora', name: 'Salon Aurora', role: 'Proprietar' },
    { id: 'dentis', name: 'Clinica Dentis Sibiu', role: 'Recepție' },
    { id: 'nord', name: 'Agenția Nord Studio', role: 'Manager de proiect' },
  ],
  de: [
    { id: 'aurora', name: 'Salon Aurora', role: 'Inhaber' },
    { id: 'dentis', name: 'Clinica Dentis Sibiu', role: 'Empfang' },
  ],
  it: [
    { id: 'aurora', name: 'Salon Aurora', role: 'Titolare' },
    { id: 'dentis', name: 'Clinica Dentis Sibiu', role: 'Reception' },
  ],
};
const NOTIFS: Record<Lang, NotificationData[]> = {
  ro: [
    {
      id: 1,
      title: 'Programare nouă de la Ana Popescu',
      body: 'Joi, 5 nov., 14:30 · Tuns',
      app: 'EasyBook',
      time: 'acum 5 min',
      person: 'Ana Popescu',
    },
    {
      id: 2,
      title: 'Avans primit: 50 lei',
      body: 'Cristina Dobre · Vopsit · vineri, 6 nov.',
      app: 'EasyBook',
      time: 'acum 1 oră',
      icon: 'wallet',
    },
    {
      id: 3,
      title: 'Dan Stoica are acum „Risc ridicat”',
      body: 'A doua programare la care nu a venit, în ultimele 6 luni',
      app: 'EasyBook',
      time: 'ieri',
      icon: 'triangle-alert',
      read: true,
    },
  ],
  de: [
    {
      id: 1,
      title: 'Neuer Termin von Anna Schmidt',
      body: 'Do., 5. Nov., 14:30 · Haarschnitt',
      app: 'EasyBook',
      time: 'vor 5 Min.',
      person: 'Anna Schmidt',
    },
  ],
  it: [
    {
      id: 1,
      title: 'Nuovo appuntamento di Anna Russo',
      body: 'gio 5 nov., 14:30 · Taglio',
      app: 'EasyBook',
      time: '5 min fa',
      person: 'Anna Russo',
    },
  ],
};
const USER = { name: 'Bianca Petrașcu', email: 'bianca@salonaurora.ro' };

export function BookingApp({
  lang,
  active,
  title,
  children,
}: {
  lang: Lang;
  active: string;
  title: string;
  children: ReactNode;
}) {
  const ui = useTranslations('ui');
  const um = useTranslations('usageMeter');
  const orgLabels = {
    switchBusiness: ui('switchBusiness'),
    yourBusinesses: ui('yourBusinesses'),
    findBusiness: ui('findBusiness'),
    noResultsFor: (q: string) => ui('noResultsFor', { q }),
    accessStopped: ui('accessStopped'),
  };
  return (
    <AppShell
      height="100%"
      spine={
        <Spine
          app="booking"
          appName="EasyBook"
          sections={SECTIONS[lang]}
          activeId={active}
          onBackToHub={noop}
          bottomItems={['azi', 'calendar', 'programari', 'clienti']}
          labels={{
            backToHub: ui('backToHub'),
            expandMenu: ui('expandMenu'),
            collapseMenu: ui('collapseMenu'),
            more: ui('more'),
            close: ui('close'),
            back: ui('back'),
          }}
          footer={
            <UsageMeter
              compact
              label={USAGE[lang]}
              used={312}
              limit={1000}
              locale={lang}
              usedOfLabel={(a) => um('usedOf', a)}
              leftLabel={(a) => um('left', a)}
              nearLimitLabel={um('nearLimit')}
              atLimitLabel={um('atLimit')}
            />
          }
        />
      }
      contextBar={
        <ContextBar
          title={title}
          org={
            <OrgSwitcher orgs={ORGS[lang]} currentId="aurora" onChange={noop} labels={orgLabels} />
          }
          onSearch={noop}
          notifications={
            <NotificationsPanel
              items={NOTIFS[lang]}
              labels={{
                notifications: ui('notifications'),
                unreadN: (n) => ui('unreadN', { n }),
                markAllRead: ui('markAllRead'),
                notificationSettings: ui('notificationSettings'),
                all: ui('all'),
                unread: ui('unread'),
                noNotifications: ui('noNotifications'),
                noNotificationsHint: ui('noNotificationsHint'),
                operational: ui('operational'),
                activity: ui('activity'),
                recommendations: ui('recommendations'),
                recommendation: ui('recommendation'),
                fromTeam: ui('fromTeam'),
                seeApp: ui('seeApp'),
                reject: ui('reject'),
                seeDetails: ui('seeDetails'),
                notInterested: ui('notInterested'),
              }}
            />
          }
          account={
            <AccountMenu
              user={USER}
              orgs={ORGS.ro}
              currentOrgId="aurora"
              onCatalog={noop}
              labels={{
                account: ui('account'),
                yourBusinesses: ui('yourBusinesses'),
                theme: ui('theme'),
                language: ui('language'),
                allApps: ui('allApps'),
                support: ui('support'),
                signOut: ui('signOut'),
                themeSwitcher: {
                  theme: ui('theme'),
                  light: ui('themeLight'),
                  dark: ui('themeDark'),
                  system: ui('themeSystem'),
                },
                orgSwitcher: orgLabels,
              }}
            />
          }
          labels={{
            search: ui('search'),
            searchPlaceholder: ui('searchPlaceholder'),
            create: ui('create'),
          }}
        />
      }
    >
      {children}
    </AppShell>
  );
}
