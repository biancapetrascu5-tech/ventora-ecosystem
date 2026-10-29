/* eslint-disable i18next/no-literal-string */
'use client';
// Datele comune din preview-urile ContextBar și AppShell (SECTIONS, ORGS, NOTIFS, USER, Bar)
import {
  AccountMenu,
  ContextBar,
  NotificationsPanel,
  OrgSwitcher,
  type MenuEntry,
  type NavSection,
  type NotificationData,
} from '@ventora/ui';
import { ACCOUNT_RO, CONTEXTBAR_RO, NOTIF_RO, ORG_RO } from './labels';

export const SECTIONS: NavSection[] = [
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
      { id: 'angajati', label: 'Angajați', icon: 'contact' },
    ],
  },
  {
    label: 'Afacere',
    items: [
      { id: 'rapoarte', label: 'Rapoarte', icon: 'chart-column' },
      { id: 'setari', label: 'Setări', icon: 'settings' },
    ],
  },
];

export const ORGS = [
  { id: 'aurora', name: 'Salon Aurora', role: 'Proprietar' },
  { id: 'dentis', name: 'Clinica Dentis Sibiu', role: 'Recepție' },
  { id: 'nord', name: 'Agenția Nord Studio', role: 'Manager de proiect' },
];

export const NOTIFS: NotificationData[] = [
  {
    id: 1,
    title: 'Programare nouă de la Ana Popescu',
    body: 'Joi, 29 oct., 14:30 · Tuns',
    app: 'EasyBook',
    time: 'acum 5 min',
    person: 'Ana Popescu',
  },
  {
    id: 2,
    title: 'Factura #2026-114 e restantă de 3 zile',
    body: 'Clinica Dentis · 1.250 lei',
    app: 'MoneyDesk',
    time: 'acum 2 ore',
    icon: 'receipt',
  },
  {
    id: 3,
    title: 'Ioana a cerut concediu pe 2–6 noiembrie',
    app: 'TeamSpace',
    time: 'ieri',
    person: 'Ioana Pavel',
    read: true,
  },
  {
    id: 4,
    title: 'Exportul clienților e gata',
    app: 'ClientDesk',
    time: 'ieri',
    icon: 'download',
    read: true,
  },
];

export const USER = { name: 'Bianca Petrașcu', email: 'bianca@ventora-hub.com' };

export const CREATE: MenuEntry[] = [
  { id: 'appt', label: 'Programare', icon: 'calendar-check', shortcut: ['N'] },
  { id: 'client', label: 'Client', icon: 'user-plus' },
];

export const noop = () => {};

/* Bar din preview.html: titlu, afacerea, căutarea, „Creează”, notificările și contul */
export function Bar({
  title,
  leading,
  hub,
  countCategory,
}: {
  title?: string;
  leading?: React.ReactNode;
  hub?: boolean;
  /** Ce necitite numără clopoțelul (Hub: operational, decizia fondatoarei). */
  countCategory?: 'operational';
}) {
  return (
    <ContextBar
      title={title}
      leading={leading}
      org={<OrgSwitcher orgs={ORGS} currentId="aurora" onChange={noop} labels={ORG_RO} />}
      onSearch={noop}
      createItems={hub ? undefined : CREATE}
      notifications={
        <NotificationsPanel items={NOTIFS} labels={NOTIF_RO} countCategory={countCategory} />
      }
      account={
        <AccountMenu
          user={USER}
          orgs={ORGS}
          currentOrgId="aurora"
          onCatalog={noop}
          labels={ACCOUNT_RO}
        />
      }
      labels={CONTEXTBAR_RO}
    />
  );
}
