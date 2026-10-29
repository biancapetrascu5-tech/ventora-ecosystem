/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import {
  AppShell,
  DataTable,
  PageHeader,
  SegmentedControl,
  Spine,
  StatusPill,
  UsageMeter,
  type DataTableColumn,
  type StatusPillTone,
} from '@ventora/ui';
import { Bar, noop, SECTIONS } from '../_shared/shell';
import { DATATABLE_RO, SPINE_RO, USAGE_RO } from '../_shared/labels';
import f from '../_shared/frames.module.css';

// preview.html → Demo → Frame({ th: "light", label: "peste 1024px: Spine întins" }) → Box(100%) → Shell(SL.ro)
type Row = {
  id: number;
  client: string;
  service: string;
  when: string;
  status: [StatusPillTone, string];
};
const ROWS: Row[] = [
  { id: 1, client: 'Ana Popescu', service: 'Tuns', when: '09:30', status: ['done', 'Confirmată'] },
  {
    id: 2,
    client: 'Andrei Ionescu',
    service: 'Vopsit',
    when: '11:00',
    status: ['attention', 'În desfășurare'],
  },
  {
    id: 3,
    client: 'Cristina Dobre',
    service: 'Tratament facial',
    when: '13:15',
    status: ['neutral', 'Neconfirmată'],
  },
  { id: 4, client: 'Dan Stoica', service: 'Tuns', when: '15:00', status: ['done', 'Confirmată'] },
];
const COLS: DataTableColumn<Row>[] = [
  { key: 'client', header: 'Client', primary: true, sortable: true },
  { key: 'service', header: 'Serviciu', secondary: true },
  { key: 'when', header: 'Ora', secondary: true },
  {
    key: 'status',
    header: 'Stare',
    trailing: true,
    render: (r) => <StatusPill tone={r.status[0]}>{r.status[1]}</StatusPill>,
  },
];

function Shell() {
  return (
    <AppShell
      height={640}
      spine={
        <Spine
          app="booking"
          appName="EasyBook"
          labels={SPINE_RO}
          sections={SECTIONS}
          activeId="programari"
          bottomItems={['azi', 'calendar', 'programari', 'clienti']}
          onBackToHub={noop}
          footer={<UsageMeter {...USAGE_RO} compact label="Programări" used={312} limit={1000} />}
        />
      }
      contextBar={<Bar title="EasyBook" />}
    >
      <PageHeader
        title="Programări"
        description="Toate programările afacerii, de azi înainte."
        actions={
          <SegmentedControl
            aria-label="Vizualizare"
            size="md"
            defaultValue="list"
            options={[
              { value: 'list', label: 'Listă', icon: 'list' },
              { value: 'cal', label: 'Calendar', icon: 'calendar' },
            ]}
          />
        }
      />
      <DataTable
        columns={COLS}
        rows={ROWS}
        rowActions={() => [{ label: 'Deschide', icon: 'external-link' }]}
        pagination={{ page: 1, pageSize: 20, total: 4, onPageChange: noop }}
        labels={DATATABLE_RO}
        locale="ro"
      />
    </AppShell>
  );
}

const BOX: React.CSSProperties = {
  width: '100%',
  maxWidth: '100%',
  height: 640,
  overflow: 'hidden',
  border: 'var(--border-width) solid var(--line-strong)',
  borderRadius: 'var(--radius-lg)',
};

export default function AppShellGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <div className={f.base}>
      <div className={f.d}>
        {(['light', 'dark'] as const).map((th) => (
          <section key={th} className={f.thf} data-gallery-frame data-theme={th}>
            <p className={`caption ${f.thl}`}>
              {th === 'dark' ? 'Dark' : 'Light'} · peste 1024px: Spine întins
            </p>
            <div style={BOX}>
              <Shell />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
