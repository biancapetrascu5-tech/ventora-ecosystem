/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html */
'use client';
// FX_NAV + FX_App din preview-urile Founder (FounderBackupCodes, FounderSupportSession,
// FounderOwnerRecovery): Spine cu navigația Founder, ContextBar cu căutarea, notificările, contul.
// S111: „Cereri” după „Consum”; S117: „Model comercial” — Aplicații, Bundle-uri, Pachete în plus,
// Reduceri; căutarea „…un bundle…”.
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
      { id: 'jurnal', label: 'Jurnal', icon: 'history' },
      { id: 'setari', label: 'Setări', icon: 'settings' },
    ],
  },
];

/*
 * S116 (Lotul 4.6): în preview-urile noi (FounderSupportInbox, FounderOverview) Spine-ul are
 * „Suport” după „Cereri”; celelalte preview-uri Founder îl primesc la următorul import (CHANGELOG
 * S116). Până atunci FX_NAV rămâne ca ele, iar cadrele Suport folosesc FX_NAV_SUPPORT. Aplicația
 * Founder reală are „Suport” (FounderShell). Când vin preview-urile, „Suport” intră în FX_NAV.
 */
export const FX_NAV_SUPPORT: NavSection[] = FX_NAV.map((sec, i) =>
  i === 0
    ? {
        ...sec,
        items: [...sec.items, { id: 'suport', label: 'Suport', icon: 'life-buoy', badge: 3 }],
      }
    : sec,
);

export function FounderShellDemo({
  active,
  title,
  children,
  bottomItems = ['afaceri', 'consum', 'campanii', 'control'],
  sections = FX_NAV,
}: {
  active?: string;
  title?: string;
  children: ReactNode;
  /** Bara de jos pe telefon (S116 Suport: Afaceri, Cereri, Suport). */
  bottomItems?: string[];
  /** FX_NAV, sau FX_NAV_SUPPORT în cadrele Suport (S116). */
  sections?: NavSection[];
}) {
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
          searchLabel="Caută o afacere, un bundle sau o campanie"
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
