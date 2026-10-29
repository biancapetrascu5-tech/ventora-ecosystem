/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { Schedule, type ScheduleColumn, type ScheduleEvent } from '@ventora/ui';
import { ThStack } from '../_shared/QPair';
import f from '../_shared/frames.module.css';

// preview.html → Extra({ stack: true }) → ThemeFrame light → States() → SC(SC_RO, "a4")
const C = [
  ['Ioana Pavel', 'Coafor'],
  ['Mara Enache', 'Manichiură'],
  ['Radu Matei', 'Frizerie'],
  ['Ștefan Țurcanu', 'Masaj', 'În concediu'],
];
const N = [
  'Ana Popescu',
  'Elena Georgescu',
  'Andrei Ionescu',
  'Cristina Dobre',
  'Ioana Rădulescu',
  'Sorina Vlad',
  'Alina Mureșan',
  'Mihai Tudose',
  'Vlad Cristea',
  'Sergiu Pop',
  'Paul Ștefănescu',
];
const S = [
  'Tuns',
  'Vopsit rădăcini',
  'Vopsit',
  'Tratament facial',
  'Manichiură',
  'Pedichiură',
  'Manichiură semipermanentă',
  'Pauză de prânz',
  'Tuns bărbați',
  'Tuns + barbă',
];
const COLS: ScheduleColumn[] = ['a', 'b', 'c', 'd'].map((id, i) => ({
  id,
  label: C[i]![0]!,
  sub: C[i]![1],
  person: C[i]![0],
  closed: C[i]![2],
}));
const EVENTS: ScheduleEvent[] = [
  {
    id: 'a1',
    col: 'a',
    start: '09:00',
    end: '09:45',
    title: N[0]!,
    subtitle: S[0],
    status: 'done',
  },
  {
    id: 'a2',
    col: 'a',
    start: '10:00',
    end: '11:00',
    title: N[1]!,
    subtitle: S[1],
    status: 'done',
  },
  { id: 'a3', col: 'a', start: '11:00', end: '12:00', title: N[2]!, subtitle: S[2], status: 'now' },
  {
    id: 'a4',
    col: 'a',
    start: '12:30',
    end: '13:15',
    title: N[3]!,
    subtitle: S[3],
    status: 'unconfirmed',
  },
  {
    id: 'b1',
    col: 'b',
    start: '09:30',
    end: '10:20',
    title: N[4]!,
    subtitle: S[4],
    status: 'noshow',
  },
  {
    id: 'b2',
    col: 'b',
    start: '11:00',
    end: '11:45',
    title: N[5]!,
    subtitle: S[5],
    status: 'confirmed',
  },
  {
    id: 'b3',
    col: 'b',
    start: '11:15',
    end: '12:15',
    title: N[6]!,
    subtitle: S[6],
    status: 'confirmed',
  },
  { id: 'b4', col: 'b', start: '13:00', end: '14:00', title: S[7]!, status: 'blocked' },
  {
    id: 'c1',
    col: 'c',
    start: '09:00',
    end: '09:30',
    title: N[7]!,
    subtitle: S[8],
    status: 'done',
  },
  {
    id: 'c2',
    col: 'c',
    start: '10:00',
    end: '10:30',
    title: N[8]!,
    subtitle: S[8],
    status: 'cancelled',
  },
  {
    id: 'c3',
    col: 'c',
    start: '11:30',
    end: '12:00',
    title: N[9]!,
    subtitle: S[9],
    status: 'confirmed',
  },
  {
    id: 'c4',
    col: 'c',
    start: '12:15',
    end: '13:00',
    title: N[10]!,
    subtitle: S[8],
    status: 'unconfirmed',
  },
];
const noop = () => {};

function States() {
  return (
    <div className={f.d0}>
      <p className={`caption ${f.muted}`}>
        Toate stările: încheiată (✓), în desfășurare (peach, singurul peach), confirmată,
        neconfirmată (contur punctat), neprezentare, anulată, pauză (hașurat) · suprapunere ·
        coloană închisă · programare selectată
      </p>
      <Schedule
        columns={COLS}
        events={EVENTS}
        from={9}
        to={14}
        now="11:20"
        height={400}
        activeId="a4"
        onEventClick={noop}
        onSlotClick={noop}
        minColumnWidth={140}
      />
    </div>
  );
}

export default function ScheduleGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <ThStack render={() => <States />} />;
}
