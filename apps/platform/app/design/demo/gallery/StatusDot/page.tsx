/* eslint-disable i18next/no-literal-string */
'use client';
import type React from 'react';
import { notFound } from 'next/navigation';
import { StatusDot } from '@ventora/ui';
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
const C3LAB: React.CSSProperties = { color: 'var(--ink-muted)', margin: 0 };

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'center' }}>
    <span style={{ color: 'var(--ink-muted)', width: 'calc(var(--space-16) + var(--space-6))', flex: 'none', fontSize: 'var(--type-caption-size)' }}>
      {label}
    </span>
    {children}
  </div>
);

function DotSet({ lang }: { lang: 'ro' | 'de' }) {
  if (lang === 'de') {
    return (
      <Row label="Töne">
        <StatusDot tone="attention" label="Gerade in Behandlung" />
        <StatusDot tone="done" label="Bestätigt" />
        <StatusDot tone="danger" label="Fehlgeschlagen" />
        <StatusDot tone="neutral" label="In Pause" />
        <StatusDot tone="offline" label="Offline" />
      </Row>
    );
  }
  return (
    <Row label="Tonuri">
      <StatusDot tone="attention" label="Acum, în cabinetul 2" />
      <StatusDot tone="done" label="Confirmat" />
      <StatusDot tone="danger" label="Eșuat" />
      <StatusDot tone="neutral" label="În pauză" />
      <StatusDot tone="offline" label="Offline" />
    </Row>
  );
}

export default function StatusDotGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell>
      <div style={C3WRAP}>
        <div style={C3PAIR}>
          <div data-gallery-frame data-theme="light" style={C3F}>
            <p className="caption" style={C3LAB}>Light</p>
            <DotSet lang="ro" />
          </div>
          <div data-gallery-frame data-theme="dark" style={C3F}>
            <p className="caption" style={C3LAB}>Dark</p>
            <DotSet lang="ro" />
          </div>
        </div>
        <div style={C3PAIR}>
          <div data-theme="light" style={C3F}>
            <p className="caption" style={C3LAB}>Deutsch (de)</p>
            <DotSet lang="de" />
          </div>
          <div data-theme="dark" style={C3F}>
            <p className="caption" style={C3LAB}>Deutsch · Dark</p>
            <DotSet lang="de" />
          </div>
        </div>
      </div>
    </GalleryShell>
  );
}
