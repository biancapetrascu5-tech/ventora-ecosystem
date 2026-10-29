/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { Timeline, type TimelineRow } from '@ventora/ui';
import { QPair } from '../_shared/QPair';

// preview.html → Q_Extra → „Light / Dark” → Q_Pair({ cols: 1 }, Timeline(Q_P_RO, Q_ROWS(Q_TL_RO)))
const T = [
  'Brief și conținut',
  'Design',
  'Fotografii',
  'Dezvoltare',
  'Testare pe telefon și tabletă',
  'Lansare',
  'Gata',
  'Întârziată 2 zile',
  '9–20 nov.',
  'Toată echipa',
  'Vin, 20 nov.',
];
const PERIODS = [
  '5 oct.',
  '12 oct.',
  '19 oct.',
  '26 oct.',
  '2 nov.',
  '9 nov.',
  '16 nov.',
  '23 nov.',
].map((label, i) => ({ label, current: i === 2 }));
const ROWS: TimelineRow[] = [
  {
    id: 'p1',
    label: T[0]!,
    sub: 'Bianca Petrașcu',
    start: 0,
    end: 2,
    status: 'done',
    statusLabel: T[6],
  },
  {
    id: 'p2',
    label: T[1]!,
    sub: 'Bianca Petrașcu',
    start: 1,
    end: 3.3,
    status: 'active',
    progress: 85,
    statusLabel: '85%',
  },
  {
    id: 'p3',
    label: T[2]!,
    sub: 'Ioana Pavel',
    start: 2,
    end: 2.7,
    status: 'late',
    statusLabel: T[7],
  },
  {
    id: 'p4',
    label: T[3]!,
    sub: 'Radu Matei',
    start: 2.4,
    end: 5.6,
    status: 'active',
    progress: 35,
    statusLabel: '35%',
  },
  {
    id: 'p5',
    label: T[4]!,
    sub: 'Mara Enache',
    start: 5.4,
    end: 6.6,
    status: 'planned',
    statusLabel: T[8],
  },
  { id: 'p6', label: T[5]!, sub: T[9], milestone: 6.7, milestoneLabel: T[10] },
];

export default function TimelineGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <QPair cols={1}>
      <Timeline label="Etapă" periods={PERIODS} rows={ROWS} today={2.6} todayLabel="Azi" />
    </QPair>
  );
}
