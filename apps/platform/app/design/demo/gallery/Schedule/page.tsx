'use client';
import { notFound } from 'next/navigation';
import { Schedule } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

const STAFF_COLS = [
  { id: 'ioana', label: 'Ioana Pavel', sub: 'Coafor', person: 'Ioana Pavel', today: true },
  { id: 'mara', label: 'Mara Enache', sub: 'Manicura', person: 'Mara Enache', today: true },
  { id: 'radu', label: 'Radu Matei', sub: 'Frizerie', person: 'Radu Matei', today: true },
];

const EVENTS = [
  {
    id: 'e1',
    col: 'ioana',
    start: '09:00',
    end: '09:45',
    title: 'Ana Popescu',
    subtitle: 'Tuns',
    status: 'done' as const,
  },
  {
    id: 'e2',
    col: 'ioana',
    start: '10:00',
    end: '11:00',
    title: 'Elena Georgescu',
    subtitle: 'Vopsit radacini',
    status: 'done' as const,
  },
  {
    id: 'e3',
    col: 'ioana',
    start: '11:00',
    end: '12:00',
    title: 'Andrei Ionescu',
    subtitle: 'Vopsit',
    status: 'now' as const,
  },
  {
    id: 'e4',
    col: 'ioana',
    start: '12:30',
    end: '13:15',
    title: 'Cristina Dobre',
    subtitle: 'Tratament facial',
    status: 'unconfirmed' as const,
  },
  {
    id: 'e5',
    col: 'ioana',
    start: '14:30',
    end: '15:15',
    title: 'Dan Stoica',
    subtitle: 'Tuns',
    status: 'confirmed' as const,
  },
  {
    id: 'm1',
    col: 'mara',
    start: '09:30',
    end: '10:20',
    title: 'Ioana Radu',
    subtitle: 'Manicura',
    status: 'done' as const,
  },
  {
    id: 'm2',
    col: 'mara',
    start: '10:45',
    end: '11:45',
    title: 'Sorina Vlad',
    subtitle: 'Pedicura',
    status: 'now' as const,
  },
  {
    id: 'm3',
    col: 'mara',
    start: '13:00',
    end: '14:00',
    title: 'Pauza de pranz',
    status: 'blocked' as const,
  },
  {
    id: 'm4',
    col: 'mara',
    start: '14:00',
    end: '14:50',
    title: 'Alina Murariu',
    subtitle: 'Manicura semi',
    status: 'confirmed' as const,
  },
  {
    id: 'r1',
    col: 'radu',
    start: '09:00',
    end: '09:30',
    title: 'Mihai Tudose',
    subtitle: 'Tuns barbati',
    status: 'done' as const,
  },
  {
    id: 'r2',
    col: 'radu',
    start: '10:00',
    end: '10:30',
    title: 'Vlad Cristea',
    subtitle: 'Tuns barbati',
    status: 'cancelled' as const,
  },
  {
    id: 'r3',
    col: 'radu',
    start: '11:30',
    end: '12:00',
    title: 'Sergiu Pop',
    subtitle: 'Tuns + barba',
    status: 'confirmed' as const,
  },
];

export default function ScheduleGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="Schedule">
      <GallerySection label="Zi — vizualizare personal" column>
        <Schedule
          columns={STAFF_COLS}
          events={EVENTS}
          from={8}
          to={18}
          now="11:20"
          nowColumn="ioana"
          height={480}
        />
      </GallerySection>
    </GalleryShell>
  );
}
