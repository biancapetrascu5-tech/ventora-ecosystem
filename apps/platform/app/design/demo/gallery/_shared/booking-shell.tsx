'use client';

import type { ReactNode } from 'react';
import { AppShell, Spine, UsageMeter, type NavSection } from '@ventora/ui';
import { Bar, noop } from './shell';
import { SPINE_RO, USAGE_RO } from './labels';

/* The EasyBook shell of the S123/S124 Setări previews (BookingServices, BookingTeamSchedule) and of
   BookingStatuses (S116, „Programări”):
   the Spine with „Setări” active, the meter, the context bar. */

// preview.html BK_SECTIONS (ro)
const BK_SECTIONS: NavSection[] = [
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
];

export function BookingApp({
  children,
  active = 'setari',
  title = 'Setări',
  appName,
}: {
  children: ReactNode;
  /** BookingStatuses: the Spine shows „EasyBook”. */
  appName?: string;
  /** BookingStatuses: „Programări” active, title „Programări”. */
  active?: string;
  title?: string;
}) {
  return (
    <AppShell
      height="100%"
      spine={
        <Spine
          app="booking"
          appName={appName}
          labels={SPINE_RO}
          sections={BK_SECTIONS}
          activeId={active}
          onBackToHub={noop}
          bottomItems={['azi', 'calendar', 'programari', 'clienti']}
          footer={
            <UsageMeter
              {...USAGE_RO}
              compact
              label="Programări în noiembrie"
              used={312}
              limit={1000}
            />
          }
        />
      }
      contextBar={<Bar title={title} hub />}
    >
      {children}
    </AppShell>
  );
}
