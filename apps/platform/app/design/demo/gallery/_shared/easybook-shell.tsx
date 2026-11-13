/* eslint-disable i18next/no-literal-string -- the example data of the EasyBook previews */
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
import { Bar, SECTIONS, noop } from './shell';
import { SPINE_RO, USAGE_RO } from './labels';

/* The EasyBook shell of the screen previews (BookingCalendar, BookingToday): the Romanian one, and
   the DE / IT label test with the strings of the components from the platform catalogs (ui.*,
   usageMeter.*) in that language, as HubShell passes them. */

export function RoApp({
  active,
  title,
  meter = true,
  children,
}: {
  active: string;
  title: string;
  /** false: no usage meter in the Spine (BookingLimit: `footer: false`). */
  meter?: boolean;
  children: ReactNode;
}) {
  return (
    <AppShell
      height="100%"
      spine={
        <Spine
          app="booking"
          appName="EasyBook"
          labels={SPINE_RO}
          sections={SECTIONS}
          activeId={active}
          onBackToHub={noop}
          bottomItems={['azi', 'calendar', 'programari', 'clienti']}
          footer={
            meter && (
              <UsageMeter
                {...USAGE_RO}
                compact
                label="Programări în octombrie"
                used={862}
                limit={1000}
              />
            )
          }
        />
      }
      contextBar={<Bar title={title} />}
    >
      {children}
    </AppShell>
  );
}

// preview.html LX.de / LX.it: the shell of the label test
export const LX_SHELL = {
  de: {
    sections: [
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
          { id: 'angajati', label: 'Mitarbeiter', icon: 'contact' },
        ],
      },
      {
        label: 'Unternehmen',
        items: [
          { id: 'rapoarte', label: 'Berichte', icon: 'chart-column' },
          { id: 'setari', label: 'Einstellungen', icon: 'settings' },
        ],
      },
    ] as NavSection[],
    orgs: [
      { id: 'aurora', name: 'Salon Aurora', role: 'Inhaber' },
      { id: 'praxis', name: 'Zahnarztpraxis Dr. Müller', role: 'Empfang' },
    ],
    user: { name: 'Julia Becker', email: 'julia@salon-aurora.de' },
    notifs: [
      {
        id: 1,
        title: 'Neuer Termin von Anna Schmidt',
        body: 'Do., 29. Okt., 14:30 · Haarschnitt',
        app: 'EasyBook',
        time: 'vor 5 Min.',
        person: 'Anna Schmidt',
      },
      {
        id: 2,
        title: 'Rechnung 2026-114 ist seit 3 Tagen überfällig',
        app: 'MoneyDesk',
        time: 'vor 2 Std.',
        icon: 'receipt',
      },
    ] as NotificationData[],
    create: ['Termin', 'Kunde'],
    usage: 'Termine im Oktober',
  },
  it: {
    sections: [
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
          { id: 'angajati', label: 'Dipendenti', icon: 'contact' },
        ],
      },
      {
        label: 'Attività',
        items: [
          { id: 'rapoarte', label: 'Report', icon: 'chart-column' },
          { id: 'setari', label: 'Impostazioni', icon: 'settings' },
        ],
      },
    ] as NavSection[],
    orgs: [
      { id: 'aurora', name: 'Salon Aurora', role: 'Titolare' },
      { id: 'studio', name: 'Studio Dentistico Rossi', role: 'Reception' },
    ],
    user: { name: 'Giulia Romano', email: 'giulia@salon-aurora.it' },
    notifs: [
      {
        id: 1,
        title: 'Nuovo appuntamento da Anna Russo',
        body: 'gio 29 ott., 14:30 · Taglio',
        app: 'EasyBook',
        time: '5 min fa',
        person: 'Anna Russo',
      },
      {
        id: 2,
        title: 'La fattura 2026-114 è scaduta da 3 giorni',
        app: 'MoneyDesk',
        time: '2 ore fa',
        icon: 'receipt',
      },
    ] as NotificationData[],
    create: ['Appuntamento', 'Cliente'],
    usage: 'Appuntamenti a ottobre',
  },
};

/* The label test's shell: the strings of the components from the platform catalogs (ui.*,
   usageMeter.*) in that language, as HubShell passes them. */
export function LxApp({
  lang,
  active,
  title,
  user,
  meter = true,
  children,
}: {
  lang: 'de' | 'it';
  meter?: boolean;
  active: string;
  title: string;
  /** The person in the AccountMenu, when the preview has another one (BookingToday: Bianca). */
  user?: { name: string; email: string };
  children: ReactNode;
}) {
  const ui = useTranslations('ui');
  const um = useTranslations('usageMeter');
  const x = LX_SHELL[lang];
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
          sections={x.sections}
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
            meter && (
              <UsageMeter
                compact
                label={x.usage}
                used={862}
                limit={1000}
                locale={lang}
                usedOfLabel={(a) => um('usedOf', a)}
                leftLabel={(a) => um('left', a)}
                nearLimitLabel={um('nearLimit')}
                atLimitLabel={um('atLimit')}
              />
            )
          }
        />
      }
      contextBar={
        <ContextBar
          title={title}
          org={<OrgSwitcher orgs={x.orgs} currentId="aurora" onChange={noop} labels={orgLabels} />}
          onSearch={noop}
          createItems={[
            { id: 'appt', label: x.create[0]!, icon: 'calendar-check', shortcut: ['N'] },
            { id: 'client', label: x.create[1]!, icon: 'user-plus' },
          ]}
          notifications={
            <NotificationsPanel
              items={x.notifs}
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
              user={user ?? x.user}
              orgs={x.orgs}
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
