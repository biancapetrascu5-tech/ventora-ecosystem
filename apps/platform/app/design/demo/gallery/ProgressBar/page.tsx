/* eslint-disable i18next/no-literal-string */
'use client';
import type React from 'react';
import { notFound } from 'next/navigation';
import { ProgressBar } from '@ventora/ui';
import { GalleryShell } from '../_shared/GalleryShell';

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

function ProgressSet({ lang }: { lang: 'ro' | 'de' }) {
  if (lang === 'de') {
    return (
      <div style={C3STACK}>
        <ProgressBar label="Kundendaten importieren" value={42} showValue />
        <ProgressBar label="Geschäft konfigurieren" value={100} showValue />
        <ProgressBar label="Export wird vorbereitet" />
        <ProgressBar value={18} size="sm" label="Laden" />
      </div>
    );
  }
  return (
    <div style={C3STACK}>
      <ProgressBar label="Import clienți" value={42} showValue />
      <ProgressBar label="Configurare afacere" value={100} showValue />
      <ProgressBar label="Se pregătește exportul" />
      <ProgressBar value={18} size="sm" label="Încărcare" />
    </div>
  );
}

export default function ProgressBarGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell>
      <div style={C3WRAP}>
        <div style={C3PAIR}>
          <div data-gallery-frame data-theme="light" style={C3F}>
            <p className="caption" style={C3LAB}>Light</p>
            <ProgressSet lang="ro" />
          </div>
          <div data-gallery-frame data-theme="dark" style={C3F}>
            <p className="caption" style={C3LAB}>Dark</p>
            <ProgressSet lang="ro" />
          </div>
        </div>
        <div style={C3PAIR}>
          <div data-theme="light" style={C3F}>
            <p className="caption" style={C3LAB}>Deutsch (de)</p>
            <ProgressSet lang="de" />
          </div>
          <div data-theme="dark" style={C3F}>
            <p className="caption" style={C3LAB}>Deutsch · Dark</p>
            <ProgressSet lang="de" />
          </div>
        </div>
      </div>
    </GalleryShell>
  );
}
