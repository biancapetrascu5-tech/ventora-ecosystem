/* eslint-disable i18next/no-literal-string */
'use client';
import { useState } from 'react';
import { notFound } from 'next/navigation';
import { Kanban, KanbanCard, type KanbanCardData, type KanbanColumn } from '@ventora/ui';
import { C3Pair } from '../_shared/QPair';
import { KANBAN_RO } from '../_shared/labels';
import f from '../_shared/frames.module.css';

// preview.html → C3Themes({ stack: true }) → c3stack(legenda, KB(KB_RO_COLS, KB_RO_CARDS, "Etape"))
const COLS: KanbanColumn[] = [
  { id: 'todo', label: 'De făcut' },
  { id: 'doing', label: 'În lucru' },
  { id: 'blocked', label: 'Blocate', empty: 'Nicio sarcină blocată acum.' },
  { id: 'done', label: 'Gata', tone: 'done' },
];
const CARDS: KanbanCardData[] = [
  {
    id: 'a1',
    col: 'todo',
    tag: 'Conținut',
    title: 'Texte pentru pagina de prețuri',
    people: ['Bianca Petrașcu'],
    due: { label: 'Vin, 30 oct.' },
  },
  {
    id: 'a2',
    col: 'doing',
    tag: 'Fotografii',
    title: 'Ședință foto în salon',
    people: ['Ioana Pavel', 'Mara Enache'],
    due: { label: 'Întârziată 2 zile', tone: 'attention', icon: 'clock' },
    progress: { done: 2, total: 5 },
    active: true,
  },
  {
    id: 'a3',
    col: 'done',
    tag: 'Design',
    title: 'Paleta și fonturile site-ului',
    people: ['Bianca Petrașcu'],
    meta: ['Gata pe 16 oct.'],
  },
];

function KB() {
  const [cs, setCs] = useState(CARDS);
  const move = (id: string, col: string) => setCs(cs.map((c) => (c.id === id ? { ...c, col } : c)));
  return (
    <Kanban
      label="Etape"
      columns={COLS}
      cards={cs}
      onMove={move}
      labels={KANBAN_RO}
      renderCard={(k, ctx) => (
        <KanbanCard
          {...k}
          columns={ctx.columns}
          onMove={move}
          onOpen={() => {}}
          labels={KANBAN_RO}
        />
      )}
    />
  );
}

export default function KanbanGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <C3Pair
      stack
      render={() => (
        <div className={f.c3stack}>
          <p className={`caption ${f.c3lab}`}>
            Card activ · termen depășit (peach + ceas) · coloană goală · coloană „Gata” cu bifa lime
          </p>
          <KB />
        </div>
      )}
    />
  );
}
