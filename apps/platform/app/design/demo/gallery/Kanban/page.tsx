'use client';
import { notFound } from 'next/navigation';
import { Kanban } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

const COLUMNS = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'De facut', tone: 'active' as const },
  { id: 'progress', label: 'In lucru', tone: 'active' as const, limit: 3 },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Finalizat', tone: 'done' as const },
];

const CARDS = [
  {
    id: 'c1',
    col: 'todo',
    tag: 'Design',
    title: 'Redesign panou control',
    sub: 'Actualizeaza layout-ul principal',
    priority: 'high' as const,
    people: ['Ana P.'],
    due: { label: '30 oct', overdue: false },
  },
  {
    id: 'c2',
    col: 'progress',
    tag: 'Dev',
    title: 'API rezervari v2',
    sub: 'Migrare la noul endpoint',
    priority: 'high' as const,
    people: ['Radu M.', 'Ioana P.'],
    count: 3,
  },
  {
    id: 'c3',
    col: 'progress',
    tag: 'Dev',
    title: 'Notificari SMS',
    sub: 'Integrare Twilio',
    priority: 'medium' as const,
    people: ['Mara E.'],
  },
  {
    id: 'c4',
    col: 'review',
    tag: 'QA',
    title: 'Testare flux programare',
    sub: 'Scenarii end-to-end',
    priority: 'medium' as const,
    people: ['Dan S.'],
    due: { label: '28 oct', overdue: true },
  },
  {
    id: 'c5',
    col: 'done',
    tag: 'Design',
    title: 'Componente Lot 4',
    priority: 'low' as const,
    people: ['Ana P.'],
  },
  {
    id: 'c6',
    col: 'backlog',
    tag: 'Feature',
    title: 'Export PDF rapoarte',
    sub: 'Generare documente',
    priority: 'low' as const,
  },
  {
    id: 'c7',
    col: 'backlog',
    tag: 'Bug',
    title: 'Fix filtru data',
    sub: 'Timezone incorect in Safari',
    priority: 'high' as const,
    due: { label: '25 oct', overdue: true },
  },
];

export default function KanbanGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="Kanban">
      <GallerySection label="Board complet" column>
        <Kanban label="Board proiect" columns={COLUMNS} cards={CARDS} />
      </GallerySection>
    </GalleryShell>
  );
}
