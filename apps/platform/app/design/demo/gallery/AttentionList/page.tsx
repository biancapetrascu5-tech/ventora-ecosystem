'use client';
import { notFound } from 'next/navigation';
import { AttentionList } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

const ITEMS_MIXED = [
  {
    id: 1,
    icon: 'clock' as const,
    title: 'Cristina Dobre nu a confirmat',
    meta: 'Azi la 12:30 - Tratament facial - Ioana',
    time: 'peste 1 h',
    actions: [{ label: 'Confirma', primary: true }, { label: 'Retrimite reamintirea' }],
  },
  {
    id: 2,
    icon: 'clock' as const,
    title: 'Oana Dinu nu a confirmat',
    meta: 'Azi la 15:00 - Manicura - Mara',
    time: 'peste 4 h',
    actions: [{ label: 'Confirma', primary: true }, { label: 'Suna' }],
  },
  {
    id: 3,
    icon: 'error' as const,
    tone: 'danger' as const,
    title: 'Dan Stoica mai are de platit 120 lei',
    meta: 'De la vizita din 16 octombrie',
    actions: [{ label: 'Incaseaza' }, { label: 'Trimite link de plata', quiet: true }],
  },
  {
    id: 4,
    icon: 'calendar' as const,
    title: 'Elena Georgescu vrea sa mute programarea',
    meta: 'De maine, 10:00, pe sambata, 11:00 - cerere online',
    actions: [{ label: 'Accepta', primary: true }, { label: 'Propune alta ora' }],
  },
];

const ITEMS_NEUTRAL = [
  {
    id: 1,
    title: 'Raportul lunar este gata',
    meta: 'Octombrie 2026 - 47 de pagini',
    actions: [{ label: 'Descarca' }],
  },
  { id: 2, title: 'Sincronizare finalizata', meta: '1.240 de contacte actualizate' },
];

export default function AttentionListGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="AttentionList">
      <GallerySection label="Lista mixta — atentie + pericol" column>
        <div style={{ maxWidth: 600 }}>
          <AttentionList items={ITEMS_MIXED} />
        </div>
      </GallerySection>
      <GallerySection label="Neutru — fara actiuni" column>
        <div style={{ maxWidth: 600 }}>
          <AttentionList items={ITEMS_NEUTRAL} />
        </div>
      </GallerySection>
    </GalleryShell>
  );
}
