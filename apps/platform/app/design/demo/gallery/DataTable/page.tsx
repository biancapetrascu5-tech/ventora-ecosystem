/* eslint-disable i18next/no-literal-string */
'use client';
import { useState } from 'react';
import { notFound } from 'next/navigation';
import {
  Button,
  DataTable,
  EmptyState,
  Input,
  StatusPill,
  type DataTableAction,
  type DataTableColumn,
  type DataTableKey,
  type DataTableSort,
  type StatusPillTone,
} from '@ventora/ui';
import { PvCell, PvFrames } from '../_shared/QPair';
import { DATATABLE_RO } from '../_shared/labels';
import f from '../_shared/frames.module.css';

// preview.html → Frames({ Board }) → primul cadru (light, ro): DT_T.ro
const T = {
  l: [
    'Selecție (bara de acțiuni în masă), sortare, rând deschis în Drawer (margine peach), meniu pe rând, paginare',
    'Dens · 36px',
    'Listă (sub 640px sau layout „list”)',
    'Se încarcă',
    'Prima utilizare',
    'Niciun rezultat',
    'Eroare',
  ],
  cols: ['Client', 'Serviciu', 'Angajat', 'Când', 'Preț', 'Stare'],
  cap: 'Programări',
  search: 'Caută client sau serviciu',
  filters: 'Filtre',
  pill: 'Angajat: Ioana',
  rows: [
    ['Ana Popescu', 'Tuns', 'Ioana', 'Azi, 09:30', 120, 'done', 'Confirmată'],
    ['Andrei Ionescu', 'Vopsit', 'Mara', 'Azi, 11:00', 350, 'attention', 'În desfășurare'],
    ['Cristina Dobre', 'Tratament facial', 'Ioana', 'Azi, 13:15', 220, 'neutral', 'Neconfirmată'],
    ['Ștefan Țăranu', 'Tuns', 'Radu', 'Mâine, 10:00', 120, 'danger', 'Neachitată'],
    ['Elena Georgescu', 'Manichiură', 'Mara', 'Joi, 16:45', 110, 'done', 'Confirmată'],
  ] as const,
  acts: ['Deschide', 'Trimite reamintire', 'Mută programarea', 'Anulează programarea'],
  bulk: ['Trimite reamintire', 'Exportă', 'Anulează programările'],
  e1: [
    'Nicio programare azi',
    'Când cineva rezervă, apare aici. Poți adăuga și tu una.',
    'Creează programare',
  ],
  e2: [
    'Niciun rezultat pentru „Ionescu”',
    'Verifică ortografia sau șterge filtrele.',
    'Șterge filtrele',
  ],
  e3: [
    'Nu am putut încărca lista',
    'Încearcă din nou. Dacă se repetă, scrie-ne.',
    'Încearcă din nou',
    'Scrie-ne',
  ],
};

type Row = {
  id: number;
  client: string;
  service: string;
  staff: string;
  when: string;
  price: number;
  status: [StatusPillTone, string];
};

const noop = () => {};
const ROWS: Row[] = T.rows.map((r, i) => ({
  id: i + 1,
  client: r[0],
  service: r[1],
  staff: r[2],
  when: r[3],
  price: r[4],
  status: [r[5], r[6]],
}));
const C = T.cols;
const COLS: DataTableColumn<Row>[] = [
  { key: 'client', header: C[0]!, sortable: true, primary: true },
  { key: 'service', header: C[1]!, secondary: true },
  { key: 'staff', header: C[2]!, sortable: true },
  { key: 'when', header: C[3]!, sortable: true, secondary: true },
  { key: 'price', header: C[4]!, align: 'end', sortable: true, render: (r) => `${r.price} lei` },
  {
    key: 'status',
    header: C[5]!,
    trailing: true,
    render: (r) => <StatusPill tone={r.status[0]}>{r.status[1]}</StatusPill>,
  },
];
const SHORT = COLS.slice(0, 4);
const acts = (): DataTableAction[] => [
  { label: T.acts[0], icon: 'external-link' },
  { label: T.acts[1], icon: 'send' },
  { label: T.acts[2], icon: 'calendar' },
  { separator: true },
  { label: T.acts[3], icon: 'trash-2', destructive: true },
];
const common = { labels: DATATABLE_RO, locale: 'ro' };

function Board() {
  const [sel, setSel] = useState<DataTableKey[]>([2, 3]);
  const [sort, setSort] = useState<DataTableSort | null>({ key: 'when', dir: 'asc' });
  const [page, setPage] = useState(1);
  const L = T.l;
  const toolbar = (
    <>
      <div style={{ flex: '1 1 var(--search-width)', maxWidth: 'var(--search-width)' }}>
        <Input iconStart="search" placeholder={T.search} size="sm" aria-label={T.search} />
      </div>
      <Button size="sm" icon="list-filter">
        {T.filters}
      </Button>
      <StatusPill tone="neutral" icon="x">
        {T.pill}
      </StatusPill>
    </>
  );
  return (
    <div className={f.pvCell} style={{ gap: 'var(--space-5)' }}>
      <PvCell label={L[0]!}>
        <DataTable
          caption={T.cap}
          columns={COLS}
          rows={ROWS}
          selectable
          selected={sel}
          onSelectedChange={setSel}
          sort={sort}
          onSortChange={setSort}
          rowActions={acts}
          toolbar={toolbar}
          activeRow={2}
          onRowClick={noop}
          bulkActions={[
            { label: T.bulk[0], icon: 'send' },
            { label: T.bulk[1], icon: 'download' },
            { label: T.bulk[2], icon: 'trash-2', destructive: true },
          ]}
          pagination={{
            page,
            pageSize: 20,
            total: 248,
            onPageChange: setPage,
            onPageSizeChange: noop,
          }}
          {...common}
        />
      </PvCell>
      <PvCell label={L[1]!}>
        <DataTable
          caption={T.cap}
          columns={COLS}
          rows={ROWS.slice(0, 4)}
          density="dense"
          rowActions={acts}
          selectable
          selected={[]}
          onSelectedChange={noop}
          {...common}
        />
      </PvCell>
      <div className={f.pvGrid2}>
        <PvCell label={L[2]!}>
          <DataTable
            caption={T.cap}
            columns={COLS}
            rows={ROWS.slice(0, 3)}
            layout="list"
            rowActions={acts}
            pagination={{ page: 1, pageSize: 20, total: 3, onPageChange: noop }}
            {...common}
          />
        </PvCell>
        <PvCell label={L[3]!}>
          <DataTable columns={SHORT} rows={[]} loading loadingRows={3} {...common} />
        </PvCell>
      </div>
      <div className={f.pvGrid3}>
        <PvCell label={L[4]!}>
          <DataTable
            columns={SHORT}
            rows={[]}
            empty={
              <EmptyState
                size="sm"
                icon="calendar"
                title={T.e1[0]}
                description={T.e1[1]}
                actions={
                  <Button size="sm" variant="primary" icon="plus">
                    {T.e1[2]}
                  </Button>
                }
              />
            }
            {...common}
          />
        </PvCell>
        <PvCell label={L[5]!}>
          <DataTable
            columns={SHORT}
            rows={[]}
            empty={
              <EmptyState
                size="sm"
                icon="search"
                title={T.e2[0]}
                description={T.e2[1]}
                actions={<Button size="sm">{T.e2[2]}</Button>}
              />
            }
            {...common}
          />
        </PvCell>
        <PvCell label={L[6]!}>
          <DataTable
            columns={SHORT}
            rows={[]}
            empty={
              <EmptyState
                size="sm"
                icon="circle-alert"
                title={T.e3[0]}
                description={T.e3[1]}
                actions={
                  <>
                    <Button size="sm" icon="rotate-ccw">
                      {T.e3[2]}
                    </Button>
                    <Button size="sm" variant="quiet">
                      {T.e3[3]}
                    </Button>
                  </>
                }
              />
            }
            {...common}
          />
        </PvCell>
      </div>
    </div>
  );
}

export default function DataTableGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <PvFrames render={() => <Board />} />;
}
