/* eslint-disable i18next/no-literal-string */
'use client';
import type React from 'react';
import { notFound } from 'next/navigation';
import { Toast } from '@ventora/ui';
import { GalleryShell } from '../_shared/GalleryShell';
import ro from '@ventora/i18n/messages/ro.json';
import de from '@ventora/i18n/messages/de.json';

const C3WRAP: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: 'var(--space-4)', boxSizing: 'border-box',
};
const C3PAIR: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))', gap: 'var(--space-4)', alignItems: 'start',
};
const C3F: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-4)',
  border: 'var(--border-width) solid var(--line)', borderRadius: 'var(--radius-md)',
  background: 'var(--canvas)', color: 'var(--ink)', minWidth: 0, boxSizing: 'border-box',
};
const C3STACK: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', minWidth: 0 };
const C3LAB: React.CSSProperties = { color: 'var(--ink-muted)', margin: 0 };

function ToastSet({ t }: { t: typeof ro }) {
  return (
    <div style={C3STACK}>
      <Toast
        tone="neutral"
        title="Am mutat programarea pe joi, 14:30."
        onUndo={() => {}}
        undoLabel={t.toast.undo}
        onDismiss={() => {}}
        dismissLabel={t.toast.close}
      />
      <Toast
        tone="done"
        title="Am trimis reamintirea."
        description="SMS-ul a ajuns la Ana Popescu la 09:12."
        onDismiss={() => {}}
        dismissLabel={t.toast.close}
      />
      <Toast
        tone="attention"
        title="Te apropii de limita de SMS-uri"
        action={{ label: 'Vezi consumul' }}
        onDismiss={() => {}}
        dismissLabel={t.toast.close}
      />
      <Toast
        tone="danger"
        title="Nu am putut salva"
        description="Verifică internetul și încearcă din nou."
        action={{ label: 'Încearcă din nou' }}
        onDismiss={() => {}}
        dismissLabel={t.toast.close}
      />
      <Toast loading title="Exportăm 248 de programări…" />
    </div>
  );
}

export default function ToastGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell>
      <div style={C3WRAP}>
        <div style={C3PAIR}>
          <div data-gallery-frame data-theme="light" style={C3F}>
            <p className="caption" style={C3LAB}>Light</p>
            <ToastSet t={ro} />
          </div>
          <div data-gallery-frame data-theme="dark" style={C3F}>
            <p className="caption" style={C3LAB}>Dark</p>
            <ToastSet t={ro} />
          </div>
        </div>
        <div style={C3PAIR}>
          <div data-theme="light" style={C3F}>
            <p className="caption" style={C3LAB}>Deutsch (de)</p>
            <div style={C3STACK}>
              <Toast
                tone="neutral"
                title="Drei Termine wurden in den Papierkorb verschoben"
                onUndo={() => {}}
                undoLabel={de.toast.undo}
                onDismiss={() => {}}
                dismissLabel={de.toast.close}
              />
              <Toast
                tone="done"
                title="Die Erinnerung wurde gesendet."
                description="SMS an Ana Popescu um 09:12 zugestellt."
                onDismiss={() => {}}
                dismissLabel={de.toast.close}
              />
            </div>
          </div>
          <div data-theme="dark" style={C3F}>
            <p className="caption" style={C3LAB}>Deutsch · Dark</p>
            <div style={C3STACK}>
              <Toast
                tone="attention"
                title="Sie nähern sich Ihrem SMS-Limit"
                action={{ label: 'Nutzung ansehen' }}
                onDismiss={() => {}}
                dismissLabel={de.toast.close}
              />
              <Toast
                tone="danger"
                title="Speichern fehlgeschlagen"
                description="Überprüfen Sie Ihre Verbindung und versuchen Sie es erneut."
                action={{ label: 'Erneut versuchen' }}
                onDismiss={() => {}}
                dismissLabel={de.toast.close}
              />
            </div>
          </div>
        </div>
      </div>
    </GalleryShell>
  );
}
