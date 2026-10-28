/* eslint-disable i18next/no-literal-string */
'use client';
import type React from 'react';
import { notFound } from 'next/navigation';
import { AttentionList } from '@ventora/ui';
import type { AttentionItem } from '@ventora/ui';
import { GalleryShell } from '../_shared/GalleryShell';

const C3WRAP: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  padding: 'var(--space-4)',
  boxSizing: 'border-box',
};
const C3PAIR: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))',
  gap: 'var(--space-4)',
  alignItems: 'start',
};
const C3F: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  padding: 'var(--space-4)',
  border: 'var(--border-width) solid var(--line)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--canvas)',
  color: 'var(--ink)',
  minWidth: 0,
  boxSizing: 'border-box',
};
const C3LAB: React.CSSProperties = { color: 'var(--ink-muted)', margin: 0 };

const RO_ITEMS: AttentionItem[] = [
  {
    id: 1,
    icon: 'clock',
    title: 'Cristina Dobre nu a confirmat',
    meta: 'Azi la 12:30 · Tratament facial · Ioana',
    time: 'peste 1 h',
    actions: [{ label: 'Confirmă', primary: true }, { label: 'Retrimite reamintirea' }],
  },
  {
    id: 2,
    icon: 'clock',
    title: 'Oana Dinu nu a confirmat',
    meta: 'Azi la 15:00 · Manichiură · Mara',
    time: 'peste 4 h',
    actions: [{ label: 'Confirmă', primary: true }, { label: 'Sună' }],
  },
  {
    id: 3,
    icon: 'wallet',
    tone: 'danger',
    title: 'Dan Stoica mai are de plătit 120 lei',
    meta: 'De la vizita din 16 octombrie',
    actions: [{ label: 'Încasează' }, { label: 'Trimite link de plată', quiet: true }],
  },
  {
    id: 4,
    icon: 'calendar',
    tone: 'attention',
    title: 'Elena Georgescu vrea să mute programarea',
    meta: 'De mâine, 10:00, pe sâmbătă, 11:00 · cerere online',
    actions: [{ label: 'Acceptă', primary: true }, { label: 'Propune altă oră' }],
  },
];

const DE_ITEMS: AttentionItem[] = [
  {
    id: 1,
    icon: 'clock',
    title: 'Cristina Dobre hat nicht bestätigt',
    meta: 'Heute um 12:30 · Gesichtsbehandlung · Ioana',
    time: 'in 1 h',
    actions: [{ label: 'Bestätigen', primary: true }, { label: 'Erinnerung erneut senden' }],
  },
  {
    id: 2,
    icon: 'wallet',
    tone: 'danger',
    title: 'Dan Stoica schuldet noch 120 Lei',
    meta: 'Vom Besuch am 16. Oktober',
    actions: [{ label: 'Einziehen' }, { label: 'Zahlungslink senden', quiet: true }],
  },
];

const IT_ITEMS: AttentionItem[] = [
  {
    id: 1,
    icon: 'clock',
    title: 'Cristina Dobre non ha ancora confermato',
    meta: 'Oggi alle 12:30 · Trattamento viso · Ioana',
    time: 'tra 1 h',
    actions: [{ label: 'Conferma', primary: true }, { label: 'Invia promemoria' }],
  },
  {
    id: 2,
    icon: 'calendar',
    tone: 'attention',
    title: 'Elena Georgescu vuole spostare la prenotazione',
    meta: 'Da domani, 10:00, a sabato, 11:00 · richiesta online',
    actions: [{ label: 'Accetta', primary: true }, { label: 'Proponi altro orario' }],
  },
];

export default function AttentionListGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell>
      <div style={C3WRAP}>
        <div style={C3PAIR}>
          <div data-gallery-frame data-theme="light" style={C3F}>
            <p className="caption" style={C3LAB}>
              Light
            </p>
            <AttentionList items={RO_ITEMS} />
          </div>
          <div data-gallery-frame data-theme="dark" style={C3F}>
            <p className="caption" style={C3LAB}>
              Dark
            </p>
            <AttentionList items={RO_ITEMS} />
          </div>
        </div>
        <div style={C3PAIR}>
          <div data-theme="light" style={C3F}>
            <p className="caption" style={C3LAB}>
              Deutsch (de)
            </p>
            <AttentionList items={DE_ITEMS} />
          </div>
          <div data-theme="light" style={C3F}>
            <p className="caption" style={C3LAB}>
              Italiano (it)
            </p>
            <AttentionList items={IT_ITEMS} />
          </div>
        </div>
      </div>
    </GalleryShell>
  );
}
