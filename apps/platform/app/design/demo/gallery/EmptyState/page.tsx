/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { EmptyState, Button, Icon } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

const frame = {
  border: 'var(--border-width) solid var(--line)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--sheet)',
  padding: 'var(--space-4)',
  width: '360px',
  maxWidth: '100%',
} as const;

export default function EmptyStateGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="EmptyState">
      <GallerySection label="RO" column>
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
      </GallerySection>
      <GallerySection label="DE" column>
        <div style={frame}>
          <EmptyState
            size="sm"
            icon="inbox"
            title="Noch keine Rechnungen vorhanden"
            description="Sobald Sie eine Rechnung erstellen, erscheint sie hier."
          />
        </div>
      </GallerySection>
    </GalleryShell>
  );
}
