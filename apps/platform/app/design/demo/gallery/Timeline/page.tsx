'use client';
import { notFound } from 'next/navigation';
import { Timeline } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

const PERIODS = [
  { label: 'Ian' },
  { label: 'Feb' },
  { label: 'Mar' },
  { label: 'Apr' },
  { label: 'Mai' },
  { label: 'Iun' },
  { label: 'Iul' },
  { label: 'Aug' },
  { label: 'Sep' },
  { label: 'Oct', current: true },
  { label: 'Nov' },
  { label: 'Dec' },
];

const ROWS = [
  {
    id: 'r1',
    label: 'Lansare Booking',
    sub: 'Modul principal',
    start: 0,
    end: 3,
    status: 'done' as const,
    statusLabel: 'Finalizat',
  },
  {
    id: 'r2',
    label: 'Design system',
    sub: 'Componente UI',
    start: 1,
    end: 5,
    status: 'active' as const,
    progress: 75,
    statusLabel: '75%',
  },
  {
    id: 'r3',
    label: 'Modul CRM',
    sub: 'Clienti si contacte',
    start: 4,
    end: 7,
    status: 'planned' as const,
    statusLabel: 'Planificat',
  },
  {
    id: 'r4',
    label: 'Portal public',
    sub: 'Rezervari online',
    start: 6,
    end: 9,
    status: 'planned' as const,
    statusLabel: 'Planificat',
  },
  {
    id: 'r5',
    label: 'Raportare avansata',
    sub: 'Analytics',
    start: 8,
    end: 11,
    status: 'planned' as const,
    statusLabel: 'Planificat',
    milestone: 10,
    milestoneLabel: 'Beta',
  },
];

export default function TimelineGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="Timeline">
      <GallerySection label="Roadmap anual" column>
        <Timeline label="Roadmap 2026" periods={PERIODS} rows={ROWS} today={9} />
      </GallerySection>
    </GalleryShell>
  );
}
