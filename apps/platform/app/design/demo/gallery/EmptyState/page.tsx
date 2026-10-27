/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { EmptyState, Button } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

export default function EmptyStateGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="EmptyState">
      <GallerySection label="RO" column>
        <EmptyState
          icon="calendar"
          title="Nicio programare azi"
          description="Când cineva rezervă, apare aici. Poți adăuga și tu una."
          actions={<Button variant="primary">Creează programare</Button>}
        />
        <EmptyState
          icon="search"
          title={'Niciun rezultat pentru „Ionescu”'}
          description="Verifică ortografia sau șterge filtrele."
          actions={<Button>Șterge filtrele</Button>}
        />
        <EmptyState
          icon="circle-alert"
          title="Nu am putut încărca lista"
          description="Încearcă din nou. Dacă se repetă, scrie-ne."
          actions={
            <>
              <Button>Încearcă din nou</Button>
              <Button variant="quiet">Scrie-ne</Button>
            </>
          }
        />
      </GallerySection>
      <GallerySection label="DE" column>
        <EmptyState
          size="sm"
          icon="inbox"
          title="Noch keine Rechnungen vorhanden"
          description="Sobald Sie eine Rechnung erstellen, erscheint sie hier."
        />
      </GallerySection>
    </GalleryShell>
  );
}
