/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html */
'use client';
// FX_NAV + FX_App din preview-urile Founder (FounderBackupCodes, FounderSupportSession,
// FounderOwnerRecovery): Spine cu navigația Founder, ContextBar cu căutarea, notificările, contul.
// S111: „Cereri” după „Consum”; S117: „Model comercial” — Aplicații, Bundle-uri, Pachete în plus,
// Reduceri; căutarea „…un bundle…”. S120: „Suport” după „Cereri”, „Automatizări” primul în „Sistem”.
import type { ReactNode } from 'react';
import {
  AccountMenu,
  AppShell,
  ContextBar,
  NotificationsPanel,
  Spine,
  type NavSection,
  type NotificationData,
} from '@ventora/ui';
import { ACCOUNT_RO, CONTEXTBAR_RO, NOTIF_RO, SPINE_RO } from './labels';
import { FX_NOTIFS, FX_USER } from './founder-data';
import { noop } from './shell';

export const FX_NAV: NavSection[] = [
  {
    items: [
      { id: 'azi', label: 'Prezentare', short: 'Prezentare', icon: 'house' },
      { id: 'afaceri', label: 'Afaceri', icon: 'building-2', badge: 3 },
      { id: 'consum', label: 'Consum', icon: 'chart-column' },
      { id: 'cereri', label: 'Cereri', icon: 'inbox', badge: 2 },
      { id: 'suport', label: 'Suport', icon: 'life-buoy', badge: 3 },
    ],
  },
  {
    label: 'Model comercial',
    items: [
      { id: 'aplicatii', label: 'Aplicații', icon: 'layout-grid' },
      { id: 'bundles', label: 'Bundle-uri', icon: 'boxes' },
      { id: 'pachete', label: 'Pachete în plus', short: 'Pachete', icon: 'package' },
      { id: 'reduceri', label: 'Reduceri', icon: 'percent' },
    ],
  },
  {
    label: 'Growth',
    items: [
      { id: 'oferte', label: 'Oferte', icon: 'ticket' },
      { id: 'campanii', label: 'Campanii', icon: 'megaphone' },
      { id: 'audiente', label: 'Audiențe', icon: 'users' },
      { id: 'rezultate', label: 'Rezultate', icon: 'chart-line' },
      { id: 'control', label: 'Control', icon: 'sliders-horizontal' },
    ],
  },
  {
    label: 'Sistem',
    items: [
      { id: 'automatizari', label: 'Automatizări', icon: 'refresh-cw' },
      { id: 'jurnal', label: 'Jurnal', icon: 'history' },
      { id: 'setari', label: 'Setări', icon: 'settings' },
    ],
  },
];

export function FounderShellDemo({
  active,
  title,
  children,
  bottomItems = ['afaceri', 'consum', 'campanii', 'control'],
  searchLabel = 'Caută o afacere, un bundle sau o campanie',
  notifications = FX_NOTIFS,
  businessesBadge = true,
}: {
  active?: string;
  title?: string;
  children: ReactNode;
  /** S116 (FounderAutomations, FounderSupportInbox): alte intrări jos și altă căutare. */
  bottomItems?: string[];
  searchLabel?: string;
  notifications?: NotificationData[];
  /** S116: „Afaceri” fără badge în preview-urile noi. */
  businessesBadge?: boolean;
}) {
  const sections = businessesBadge
    ? FX_NAV
    : FX_NAV.map((sec) => ({
        ...sec,
        items: sec.items.map((i) => (i.id === 'afaceri' ? { ...i, badge: undefined } : i)),
      }));
  return (
    <AppShell
      height="100%"
      spine={
        <Spine
          hub
          appName="Founder"
          sections={sections}
          activeId={active}
          onBackToHub={noop}
          bottomItems={bottomItems}
          labels={SPINE_RO}
        />
      }
      contextBar={
        <ContextBar
          title={title}
          onSearch={noop}
          searchLabel={searchLabel}
          notifications={<NotificationsPanel items={notifications} labels={NOTIF_RO} />}
          account={<AccountMenu user={FX_USER} labels={ACCOUNT_RO} />}
          labels={CONTEXTBAR_RO}
        />
      }
    >
      {children}
    </AppShell>
  );
}
