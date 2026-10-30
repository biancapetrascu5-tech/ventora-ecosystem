'use client';
// HUB_SECTIONS + HubSettings din preview-urile ecranelor Hub (Contul tău, Administrare)
import type { ReactNode } from 'react';
import { AppShell, Spine, type NavSection } from '@ventora/ui';
import { Bar, noop } from './shell';
import { SPINE_RO } from './labels';

export const HUB_SECTIONS: NavSection[] = [
  {
    label: 'Contul tău',
    items: [
      { id: 'profil', label: 'Profil și preferințe', short: 'Profil', icon: 'circle-user' },
      { id: 'securitate', label: 'Securitate', icon: 'shield' },
    ],
  },
  {
    label: 'Afacerea',
    items: [
      { id: 'echipa', label: 'Echipă și invitații', short: 'Echipă', icon: 'users' },
      { id: 'roluri', label: 'Roluri și acces', icon: 'key' },
      { id: 'abonament', label: 'Abonament și consum', short: 'Abonament', icon: 'credit-card' },
    ],
  },
  { label: 'Ajutor', items: [{ id: 'suport', label: 'Suport', icon: 'life-buoy', badge: 1 }] },
];

export function HubSettings({
  active,
  title,
  children,
}: {
  active: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <AppShell
      height="100%"
      spine={
        <Spine
          labels={SPINE_RO}
          sections={HUB_SECTIONS}
          activeId={active}
          onBackToHub={noop}
          bottomItems={['profil', 'echipa', 'abonament', 'suport']}
        />
      }
      contextBar={<Bar title={title} hub />}
    >
      {children}
    </AppShell>
  );
}
