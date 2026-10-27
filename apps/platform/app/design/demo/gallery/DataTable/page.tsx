'use client';
import { notFound } from 'next/navigation';
import { DataTable, StatusPill } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

const ROWS = [
  {
    id: 1,
    client: 'Andrei Ionescu',
    phone: '0741 123 451',
    service: 'Vopsit',
    staff: 'Ioana',
    when: 'Azi, 11:00',
    dur: '60 min',
    price: 350,
    status: 'now',
  },
  {
    id: 2,
    client: 'Cristina Dobre',
    phone: '0742 220 118',
    service: 'Tratament facial',
    staff: 'Ioana',
    when: 'Azi, 12:30',
    dur: '45 min',
    price: 220,
    status: 'unconfirmed',
  },
  {
    id: 3,
    client: 'Dan Stoica',
    phone: '0744 551 900',
    service: 'Tuns',
    staff: 'Ioana',
    when: 'Azi, 14:30',
    dur: '45 min',
    price: 120,
    status: 'confirmed',
  },
  {
    id: 4,
    client: 'Alina Murariu',
    phone: '0723 004 512',
    service: 'Manicura semi',
    staff: 'Mara',
    when: 'Azi, 14:00',
    dur: '50 min',
    price: 140,
    status: 'confirmed',
  },
  {
    id: 5,
    client: 'Oana Dinu',
    phone: '0755 300 721',
    service: 'Manicura',
    staff: 'Mara',
    when: 'Azi, 15:00',
    dur: '50 min',
    price: 110,
    status: 'unconfirmed',
  },
];

const STATUS_LABEL: Record<string, [string, string]> = {
  now: ['attention', 'In desfasurare'],
  unconfirmed: ['neutral', 'Neconfirmata'],
  confirmed: ['neutral', 'Confirmata'],
  done: ['done', 'Incheiata'],
  cancelled: ['neutral', 'Anulata'],
};

const COLUMNS = [
  {
    key: 'client',
    header: 'Client',
    sortable: true,
    primary: true,
    render: (r: (typeof ROWS)[0]) => (
      <span style={{ display: 'flex', flexDirection: 'column' }}>
        <span>{r.client}</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>{r.phone}</span>
      </span>
    ),
  },
  { key: 'service', header: 'Serviciu', secondary: true },
  { key: 'staff', header: 'Angajat', sortable: true },
  {
    key: 'when',
    header: 'Cand',
    sortable: true,
    secondary: true,
    render: (r: (typeof ROWS)[0]) => (
      <span>
        {r.when} <span style={{ color: 'var(--ink-muted)' }}>· {r.dur}</span>
      </span>
    ),
  },
  {
    key: 'price',
    header: 'Pret',
    align: 'end' as const,
    sortable: true,
    render: (r: (typeof ROWS)[0]) => r.price + ' lei',
  },
  {
    key: 'status',
    header: 'Stare',
    trailing: true,
    render: (r: (typeof ROWS)[0]) => {
      const [tone, label] = STATUS_LABEL[r.status] ?? ['neutral', r.status];
      return (
        <StatusPill tone={tone as 'attention' | 'done' | 'neutral' | 'danger'} size="sm">
          {label}
        </StatusPill>
      );
    },
  },
];

const ROW_ACTIONS = () => [
  { label: 'Deschide', icon: 'external-link' as const },
  { label: 'Confirma', icon: 'check' as const },
  { label: 'Muta programarea', icon: 'calendar' as const },
  { label: '', separator: true },
  { label: 'Anuleaza', icon: 'trash' as const, destructive: true },
];

export default function DataTableGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="DataTable">
      <GallerySection label="Tabel complet cu paginare si actiuni" column>
        <DataTable
          columns={COLUMNS}
          rows={ROWS}
          rowActions={ROW_ACTIONS}
          pagination={{ page: 1, pageSize: 20, total: 5, onPageChange: () => {} }}
          sort={{ key: 'when', dir: 'asc' }}
        />
      </GallerySection>
      <GallerySection label="Se incarca" column>
        <DataTable columns={COLUMNS} rows={[]} loading />
      </GallerySection>
    </GalleryShell>
  );
}
