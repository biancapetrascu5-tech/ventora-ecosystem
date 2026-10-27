/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { Toast } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

export default function ToastGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="Toast">
      <GallerySection label="RO" column>
        <Toast
          tone="neutral"
          title="Am mutat programarea pe joi, 14:30."
          onUndo={() => {}}
          onDismiss={() => {}}
        />
        <Toast
          tone="done"
          title="Am trimis reamintirea."
          description="SMS-ul a ajuns la Ana Popescu la 09:12."
          onDismiss={() => {}}
        />
        <Toast
          tone="attention"
          title="Te apropii de limita de SMS-uri"
          action={{ label: 'Vezi consumul' }}
          onDismiss={() => {}}
        />
        <Toast
          tone="danger"
          title="Nu am putut salva"
          description="Verifică internetul și încearcă din nou."
          action={{ label: 'Încearcă din nou' }}
          onDismiss={() => {}}
        />
        <Toast loading title="Exportăm 248 de programări…" />
      </GallerySection>
      <GallerySection label="DE" column>
        <Toast
          tone="neutral"
          title="Drei Termine wurden in den Papierkorb verschoben"
          onUndo={() => {}}
          onDismiss={() => {}}
        />
      </GallerySection>
    </GalleryShell>
  );
}
