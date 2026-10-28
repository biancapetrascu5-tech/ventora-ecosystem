/* eslint-disable i18next/no-literal-string */
'use client';
import type React from 'react';
import { notFound } from 'next/navigation';
import { EmptyState, Button, Icon } from '@ventora/ui';
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
const C3STACK: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  minWidth: 0,
};
const C3LAB: React.CSSProperties = { color: 'var(--ink-muted)', margin: 0 };

function EmptySet({ lang }: { lang: 'ro' | 'de' }) {
  if (lang === 'de') {
    return (
      <div style={C3STACK}>
        <EmptyState
          icon="calendar"
          title="Heute keine Termine"
          description="Sobald jemand bucht, erscheint es hier. Sie können auch selbst einen hinzufügen."
          actions={
            <Button variant="primary">
              <Icon icon="plus" size={16} aria-hidden />
              Termin erstellen
            </Button>
          }
        />
        <EmptyState
          icon="search"
          title={'Keine Ergebnisse für „Müller"'}
          description="Überprüfen Sie die Schreibweise oder entfernen Sie Filter."
          actions={<Button>Filter entfernen</Button>}
        />
        <EmptyState
          size="sm"
          icon="inbox"
          title="Noch keine Rechnungen vorhanden"
          description="Sobald Sie eine Rechnung erstellen, erscheint sie hier."
        />
      </div>
    );
  }
  return (
    <div style={C3STACK}>
      <EmptyState
        icon="calendar"
        title="Nicio programare azi"
        description="Când cineva rezervă, apare aici. Poți adăuga și tu una."
        actions={
          <Button variant="primary">
            <Icon icon="plus" size={16} aria-hidden />
            Creează programare
          </Button>
        }
      />
      <EmptyState
        icon="search"
        title={'Niciun rezultat pentru „Ionescu"'}
        description="Verifică ortografia sau șterge filtrele."
        actions={<Button>Șterge filtrele</Button>}
      />
      <EmptyState
        icon="circle-alert"
        title="Nu am putut încărca lista"
        description="Încearcă din nou. Dacă se repetă, scrie-ne."
        actions={
          <>
            <Button>
              <Icon icon="rotate-ccw" size={16} aria-hidden />
              Încearcă din nou
            </Button>
            <Button variant="quiet">Scrie-ne</Button>
          </>
        }
      />
    </div>
  );
}

export default function EmptyStateGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell>
      <div style={C3WRAP}>
        <div style={C3PAIR}>
          <div data-gallery-frame data-theme="light" style={C3F}>
            <p className="caption" style={C3LAB}>
              Light
            </p>
            <EmptySet lang="ro" />
          </div>
          <div data-gallery-frame data-theme="dark" style={C3F}>
            <p className="caption" style={C3LAB}>
              Dark
            </p>
            <EmptySet lang="ro" />
          </div>
        </div>
        <div style={C3PAIR}>
          <div data-theme="light" style={C3F}>
            <p className="caption" style={C3LAB}>
              Deutsch (de)
            </p>
            <EmptySet lang="de" />
          </div>
          <div data-theme="dark" style={C3F}>
            <p className="caption" style={C3LAB}>
              Deutsch · Dark
            </p>
            <EmptySet lang="de" />
          </div>
        </div>
      </div>
    </GalleryShell>
  );
}
