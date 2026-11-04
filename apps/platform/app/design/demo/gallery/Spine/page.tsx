/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { Spine, UsageMeter, type NavSection } from '@ventora/ui';
import { QPair } from '../_shared/QPair';
import { SPINE_RO, USAGE_RO } from '../_shared/labels';
import f from '../_shared/frames.module.css';

// preview.html (Spine 1.2.0, S118) → primul Q_Pair: Spine-ul Founder, desfășurat și restrâns,
// cu „Restrânge meniul” jos. Apoi „Light / Dark” → Q_SpPair(Q_SEC_RO, "programari", "Programări").
const FOUNDER: NavSection[] = [
  {
    items: [
      { id: 'azi', label: 'Prezentare', icon: 'house' },
      { id: 'afaceri', label: 'Afaceri', icon: 'building-2' },
      { id: 'cereri', label: 'Cereri', icon: 'inbox', badge: 2 },
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
const SECTIONS: NavSection[] = [
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
      { id: 'facturi', label: 'Facturi (în curând)', icon: 'receipt', isDisabled: true },
      { id: 'setari', label: 'Setări', icon: 'settings' },
    ],
  },
];
const noop = () => {};

function Box({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={f.frame}
      style={{ height: 620, display: 'flex', overflow: 'hidden', background: 'var(--canvas)' }}
    >
      {children}
    </div>
  );
}

function S118Pair() {
  return (
    <div className={f.r} style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
      <Box>
        <Spine
          hub
          appName="Founder"
          labels={SPINE_RO}
          sections={FOUNDER}
          activeId="azi"
          onBackToHub={noop}
        />
      </Box>
      <Box>
        <Spine
          hub
          appName="Founder"
          labels={SPINE_RO}
          sections={FOUNDER}
          activeId="azi"
          collapsed
          onBackToHub={noop}
        />
      </Box>
    </div>
  );
}

function SpPair() {
  return (
    <div className={f.r} style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
      <Box>
        <Spine
          app="booking"
          appName="EasyBook"
          labels={SPINE_RO}
          sections={SECTIONS}
          activeId="programari"
          onBackToHub={noop}
          footer={
            <UsageMeter
              {...USAGE_RO}
              compact
              label="Programări"
              used={862}
              limit={1000}
              onUpgrade={noop}
            />
          }
        />
      </Box>
      <Box>
        <Spine
          app="booking"
          appName="EasyBook"
          labels={SPINE_RO}
          sections={SECTIONS}
          activeId="programari"
          collapsed
          onBackToHub={noop}
        />
      </Box>
    </div>
  );
}

export default function SpineGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <>
      <QPair>
        <S118Pair />
      </QPair>
      <QPair>
        <SpPair />
      </QPair>
    </>
  );
}
