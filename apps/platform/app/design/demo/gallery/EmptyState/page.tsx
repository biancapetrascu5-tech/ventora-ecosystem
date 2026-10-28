/* eslint-disable i18next/no-literal-string */
'use client';
import type React from 'react';
import { notFound } from 'next/navigation';
import { EmptyState, Button, Icon } from '@ventora/ui';
import { GalleryShell } from '../_shared/GalleryShell';

const DG2: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(var(--search-width), 1fr))',
  gap: 'var(--space-4) var(--space-6)',
  alignItems: 'start',
  padding: 'var(--space-4)',
  boxSizing: 'border-box',
};

const frame: React.CSSProperties = {
  border: 'var(--border-width) solid var(--line)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--sheet)',
  boxSizing: 'border-box',
};

export default function EmptyStateGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell>
      <div style={DG2}>
        <div style={frame}>
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
        </div>
        <div style={frame}>
          <EmptyState
            icon="search"
            title={'Niciun rezultat pentru „Ionescu"'}
            description="Verifică ortografia sau șterge filtrele."
            actions={<Button>Șterge filtrele</Button>}
          />
        </div>
        <div style={frame}>
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
        <div style={frame}>
          <EmptyState
            size="sm"
            icon="inbox"
            title="Noch keine Rechnungen vorhanden"
            description="Sobald Sie eine Rechnung erstellen, erscheint sie hier."
          />
        </div>
      </div>
    </GalleryShell>
  );
}
