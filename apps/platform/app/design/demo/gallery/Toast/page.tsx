/* eslint-disable i18next/no-literal-string */
'use client';
import type React from 'react';
import { notFound } from 'next/navigation';
import { Toast } from '@ventora/ui';
import { GalleryShell } from '../_shared/GalleryShell';
import ro from '@ventora/i18n/messages/ro.json';
import de from '@ventora/i18n/messages/de.json';

const D: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  padding: 'var(--space-4)',
  boxSizing: 'border-box',
  maxWidth: 'var(--panel-width)',
};

export default function ToastGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell>
      <div style={D}>
        <Toast
          tone="neutral"
          title="Am mutat programarea pe joi, 14:30."
          onUndo={() => {}}
          undoLabel={ro.toast.undo}
          onDismiss={() => {}}
          dismissLabel={ro.toast.close}
        />
        <Toast
          tone="done"
          title="Am trimis reamintirea."
          description="SMS-ul a ajuns la Ana Popescu la 09:12."
          onDismiss={() => {}}
          dismissLabel={ro.toast.close}
        />
        <Toast
          tone="attention"
          title="Te apropii de limita de SMS-uri"
          action={{ label: 'Vezi consumul' }}
          onDismiss={() => {}}
          dismissLabel={ro.toast.close}
        />
        <Toast
          tone="danger"
          title="Nu am putut salva"
          description="Verifică internetul și încearcă din nou."
          action={{ label: 'Încearcă din nou' }}
          onDismiss={() => {}}
          dismissLabel={ro.toast.close}
        />
        <Toast loading title="Exportăm 248 de programări…" />
        <Toast
          tone="neutral"
          title="Drei Termine wurden in den Papierkorb verschoben"
          onUndo={() => {}}
          undoLabel={de.toast.undo}
          onDismiss={() => {}}
          dismissLabel={de.toast.close}
        />
      </div>
    </GalleryShell>
  );
}
