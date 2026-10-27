/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { EmptyState, Button } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

export default function EmptyStateGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="EmptyState">
      <GallerySection label="Size md — cu iconita si actiuni" column>
        <EmptyState
          icon="calendar"
          title="Nicio programare pentru azi"
          description="Adauga prima programare sau activeaza rezervarile online."
          size="md"
          actions={[
            <Button key="add">Adauga programare</Button>,
            <Button key="online" variant="quiet">
              Activeaza online
            </Button>,
          ]}
        />
      </GallerySection>
      <GallerySection label="Size sm" column>
        <EmptyState
          icon="users"
          title="Niciun client gasit"
          description="Incearca un alt termen de cautare."
          size="sm"
        />
      </GallerySection>
      <GallerySection label="Fara iconita" column>
        <EmptyState
          title="Nu exista date"
          description="Datele vor aparea dupa prima sincronizare."
          size="md"
        />
      </GallerySection>
    </GalleryShell>
  );
}
