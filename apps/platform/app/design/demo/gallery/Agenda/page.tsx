'use client';
import { notFound } from 'next/navigation';
import { Agenda } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

const ITEMS_IOANA = [
  {
    id: 'e1',
    col: 'ioana',
    start: '09:00',
    end: '09:45',
    title: 'Ana Popescu',
    subtitle: 'Tuns',
    status: 'done' as const,
    staff: 'Ioana',
  },
  {
    id: 'e2',
    col: 'ioana',
    start: '10:00',
    end: '11:00',
    title: 'Elena Georgescu',
    subtitle: 'Vopsit radacini',
    status: 'done' as const,
    staff: 'Ioana',
  },
  {
    id: 'e3',
    col: 'ioana',
    start: '11:00',
    end: '12:00',
    title: 'Andrei Ionescu',
    subtitle: 'Vopsit',
    status: 'confirmed' as const,
    staff: 'Ioana',
  },
  {
    id: 'e4',
    col: 'ioana',
    start: '12:30',
    end: '13:15',
    title: 'Cristina Dobre',
    subtitle: 'Tratament facial',
    status: 'unconfirmed' as const,
    staff: 'Ioana',
  },
  {
    id: 'e5',
    col: 'ioana',
    start: '14:30',
    end: '15:15',
    title: 'Dan Stoica',
    subtitle: 'Tuns',
    status: 'confirmed' as const,
    staff: 'Ioana',
  },
  {
    id: 'e6',
    col: 'ioana',
    start: '16:00',
    end: '17:00',
    title: 'Bianca Marin',
    subtitle: 'Coafat eveniment',
    status: 'confirmed' as const,
    staff: 'Ioana',
  },
];

const ITEMS_MARA = [
  {
    id: 'm1',
    col: 'mara',
    start: '09:30',
    end: '10:20',
    title: 'Ioana Radu',
    subtitle: 'Manicura',
    status: 'done' as const,
    staff: 'Mara',
  },
  {
    id: 'm2',
    col: 'mara',
    start: '10:45',
    end: '11:45',
    title: 'Sorina Vlad',
    subtitle: 'Pedicura',
    status: 'confirmed' as const,
    staff: 'Mara',
  },
  {
    id: 'm4',
    col: 'mara',
    start: '14:00',
    end: '14:50',
    title: 'Alina Murariu',
    subtitle: 'Manicura semipermanenta',
    status: 'confirmed' as const,
    staff: 'Mara',
  },
  {
    id: 'm5',
    col: 'mara',
    start: '15:00',
    end: '15:50',
    title: 'Oana Dinu',
    subtitle: 'Manicura',
    status: 'unconfirmed' as const,
    staff: 'Mara',
  },
];

export default function AgendaGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="Agenda">
      <GallerySection label="Zi Ioana — now la 11:20" column>
        <div style={{ maxWidth: 480 }}>
          <Agenda items={ITEMS_IOANA} now="11:20" onSelect={() => {}} />
        </div>
      </GallerySection>
      <GallerySection label="Zi Mara — now la 11:20 (intre programari)" column>
        <div style={{ maxWidth: 480 }}>
          <Agenda items={ITEMS_MARA} now="11:20" onSelect={() => {}} />
        </div>
      </GallerySection>
      <GallerySection label="Fara now" column>
        <div style={{ maxWidth: 480 }}>
          <Agenda items={ITEMS_IOANA} />
        </div>
      </GallerySection>
    </GalleryShell>
  );
}
