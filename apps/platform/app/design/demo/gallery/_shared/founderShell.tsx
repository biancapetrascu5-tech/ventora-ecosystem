/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html */
'use client';
// FX_NAV + FX_App din preview-urile Founder (FounderBackupCodes, FounderSupportSession,
// FounderOwnerRecovery): Spine cu navigația Founder, ContextBar cu căutarea, notificările, contul.
// S111: „Cereri” după „Consum”; S113: „Aplicații” și „Reduceri” sub „Model comercial”.
import type { ReactNode } from 'react';
import {
  AccountMenu,
  AppShell,
  ContextBar,
  NotificationsPanel,
  Spine,
  type NavSection,
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
    ],
  },
  {
    label: 'Model comercial',
    items: [
      { id: 'planuri', label: 'Planuri', icon: 'boxes' },
      { id: 'pachete', label: 'Pachete în plus', short: 'Pachete', icon: 'package' },
      { id: 'aplicatii', label: 'Aplicații', icon: 'layout-grid' },
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
      { id: 'jurnal', label: 'Jurnal', icon: 'history' },
      { id: 'setari', label: 'Setări', icon: 'settings' },
    ],
  },
];

export function FounderShellDemo({
  active,
  title,
  children,
}: {
  active?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <AppShell
      height="100%"
      spine={
        <Spine
          hub
          appName="Founder"
          sections={FX_NAV}
          activeId={active}
          onBackToHub={noop}
          bottomItems={['afaceri', 'consum', 'campanii', 'control']}
          labels={SPINE_RO}
        />
      }
      contextBar={
        <ContextBar
          title={title}
          onSearch={noop}
          searchLabel="Caută o afacere, un plan sau o campanie"
          notifications={<NotificationsPanel items={FX_NOTIFS} labels={NOTIF_RO} />}
          account={<AccountMenu user={FX_USER} labels={ACCOUNT_RO} />}
          labels={CONTEXTBAR_RO}
        />
      }
    >
      {children}
    </AppShell>
  );
}
