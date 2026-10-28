/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import {
  Button,
  DataTable,
  Drawer,
  FormField,
  IconButton,
  Select,
  StatusPill,
  Textarea,
  type DataTableColumn,
  type StatusPillTone,
} from '@ventora/ui';
import { PvCell, PvFrames } from '../_shared/QPair';
import { DATATABLE_RO } from '../_shared/labels';
import f from '../_shared/frames.module.css';

// preview.html → Frames({ Board }) → section.pv-frame Light → Board({ lang: "ro" })
const T = {
  l: [
    'Panou lateral peste listă · rândul deschis marcat cu margine peach',
    'Ecran întreg sub 640px · săgeată înapoi',
  ],
  rows: [
    ['Ana Popescu', 'Tuns', 'Joi, 14:30', 'attention', 'Necesită confirmare'],
    ['Ștefan Țăranu', 'Vopsit', 'Joi, 16:00', 'neutral', 'Neconfirmată'],
    ['Elena Georgescu', 'Manichiură', 'Vineri, 10:00', 'neutral', 'Neconfirmată'],
  ] as const,
  cols: ['Client', 'Serviciu', 'Când', 'Stare'],
  cap: 'Programări',
  sub: 'Tuns · Joi, 29 oct., 14:30',
  edit: 'Editează',
  move: 'Mută',
  confirm: 'Confirmă',
  staff: 'Angajat',
  who: 'Ioana Pavel',
  notes: 'Note',
  noteV: 'Preferă o cameră liniștită; plătește cu cardul.',
};
// S.close, S.back
const CLOSE = 'Închide';
const BACK = 'Înapoi';
const noop = () => {};

type Row = {
  id: number;
  client: string;
  service: string;
  when: string;
  status: [StatusPillTone, string];
};
const ROWS: Row[] = T.rows.map((r, i) => ({
  id: i + 1,
  client: r[0],
  service: r[1],
  when: r[2],
  status: [r[3] as StatusPillTone, r[4]],
}));
const COLS: DataTableColumn<Row>[] = [
  { key: 'client', header: T.cols[0]!, primary: true },
  { key: 'service', header: T.cols[1]!, secondary: true },
  { key: 'when', header: T.cols[2]!, secondary: true },
  {
    key: 'status',
    header: T.cols[3]!,
    trailing: true,
    render: (r) => <StatusPill tone={r.status[0]}>{r.status[1]}</StatusPill>,
  },
];

function Detail({ layout }: { layout: 'side' | 'full' }) {
  const r = T.rows[0];
  return (
    <Drawer
      contained
      layout={layout}
      onClose={noop}
      closeLabel={CLOSE}
      backLabel={BACK}
      title={r[0]}
      subtitle={T.sub}
      actions={<IconButton icon="pencil" label={T.edit} />}
      footer={
        <>
          <Button>{T.move}</Button>
          <Button variant="primary" icon="check">
            {T.confirm}
          </Button>
        </>
      }
    >
      <div className={f.d0}>
        <div>
          <StatusPill tone={r[3]}>{r[4]}</StatusPill>
        </div>
        <FormField label={T.staff}>
          <Select defaultValue="i" options={[{ value: 'i', label: T.who }]} />
        </FormField>
        <FormField label={T.notes}>
          <Textarea rows={3} defaultValue={T.noteV} />
        </FormField>
      </div>
    </Drawer>
  );
}

function Board() {
  const L = T.l;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) 390px',
        gap: 'var(--space-5)',
        alignItems: 'start',
      }}
    >
      <PvCell label={L[0]!}>
        <div className={f.pvStage} style={{ height: 540, padding: 'var(--space-4)' }}>
          <DataTable
            caption={T.cap}
            columns={COLS}
            rows={ROWS}
            layout="table"
            activeRow={1}
            onRowClick={noop}
            labels={DATATABLE_RO}
          />
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              width: 'var(--drawer-width)',
              maxWidth: '75%',
            }}
          >
            <Detail layout="side" />
          </div>
        </div>
      </PvCell>
      <PvCell label={L[1]!}>
        <div className={f.pvStage} style={{ height: 540, borderRadius: 'var(--radius-xl)' }}>
          <Detail layout="full" />
        </div>
      </PvCell>
    </div>
  );
}

export default function DrawerGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <PvFrames render={() => <Board />} />;
}
