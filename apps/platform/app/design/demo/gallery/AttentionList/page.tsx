/* eslint-disable i18next/no-literal-string */
'use client';
import type React from 'react';
import { notFound } from 'next/navigation';
import { AttentionList } from '@ventora/ui';
import { GalleryShell } from '../_shared/GalleryShell';

const DG2: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(var(--search-width), 1fr))',
  gap: 'var(--space-4) var(--space-6)',
  alignItems: 'start',
  padding: 'var(--space-4)',
  boxSizing: 'border-box',
};

const frame: React.CSSProperties = {
  border: 'var(--border-width) solid var(--line)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--sheet)',
  boxSizing: 'border-box',
};

const BK_ATTN = [
  {
    id: 1,
    icon: 'clock' as const,
    title: 'Cristina Dobre nu a confirmat',
    meta: 'Azi la 12:30 · Tratament facial · Ioana',
    time: 'peste 1 h',
    actions: [{ label: 'Confirmă', primary: true }, { label: 'Retrimite reamintirea' }],
  },
  {
    id: 2,
    icon: 'clock' as const,
    title: 'Oana Dinu nu a confirmat',
    meta: 'Azi la 15:00 · Manichiură · Mara',
    time: 'peste 4 h',
    actions: [{ label: 'Confirmă', primary: true }, { label: 'Sună' }],
  },
  {
    id: 3,
    icon: 'wallet' as const,
    tone: 'danger' as const,
    title: 'Dan Stoica mai are de plătit 120 lei',
    meta: 'De la vizita din 16 octombrie',
    actions: [{ label: 'Încasează' }, { label: 'Trimite link de plată', quiet: true }],
  },
  {
    id: 4,
    icon: 'calendar' as const,
    title: 'Elena Georgescu vrea să mute programarea',
    meta: 'De mâine, 10:00, pe sâmbătă, 11:00 · cerere online',
    actions: [{ label: 'Acceptă', primary: true }, { label: 'Propune altă oră' }],
  },
];

const IT_ATTN = [
  {
    id: 1,
    icon: 'clock' as const,
    title: 'Cristina Dobre non ha ancora confermato',
    meta: 'Oggi alle 12:30 · Trattamento viso · Ioana',
    time: 'tra 1 h',
    actions: [{ label: 'Conferma', primary: true }, { label: 'Invia promemoria' }],
  },
];

export default function AttentionListGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell>
      <div style={DG2}>
        <div style={frame}>
          <AttentionList items={BK_ATTN} />
        </div>
        <div style={frame}>
          <AttentionList items={IT_ATTN} />
        </div>
      </div>
    </GalleryShell>
  );
}
