/* eslint-disable i18next/no-literal-string */
'use client';
import type React from 'react';
import { notFound } from 'next/navigation';
import { StatusPill } from '@ventora/ui';
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
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'center' }}>
    <span style={{ color: 'var(--ink-muted)', width: 'calc(var(--space-16) + var(--space-6))', flex: 'none', fontSize: 'var(--type-caption-size)' }}>
      {label}
    </span>
    {children}
  </div>
);

function PillSet({ lang }: { lang: 'ro' | 'de' }) {
  if (lang === 'de') {
    return (
      <>
        <Row label="Töne">
          <StatusPill tone="attention">Wird gerade durchgeführt</StatusPill>
          <StatusPill tone="attention" icon="clock">Bestätigung ausstehend</StatusPill>
          <StatusPill tone="done">Bestätigt</StatusPill>
          <StatusPill tone="done" icon="check">Bezahlt</StatusPill>
          <StatusPill tone="danger">Überfällig</StatusPill>
          <StatusPill tone="neutral">Entwurf</StatusPill>
          <StatusPill tone="neutral" icon={false}>Vom Kunden storniert</StatusPill>
        </Row>
        <Row label="Klein">
          <StatusPill size="sm" tone="done">Bestätigt</StatusPill>
          <StatusPill size="sm" tone="attention">Jetzt</StatusPill>
        </Row>
      </>
    );
  }
  return (
    <>
      <Row label="Tonuri">
        <StatusPill tone="attention">În desfășurare</StatusPill>
        <StatusPill tone="attention" icon="clock">Necesită confirmare</StatusPill>
        <StatusPill tone="done">Confirmată</StatusPill>
        <StatusPill tone="done" icon="check">Plătită</StatusPill>
        <StatusPill tone="danger">Restantă</StatusPill>
        <StatusPill tone="neutral">Ciornă</StatusPill>
        <StatusPill tone="neutral" icon={false}>Anulată de client</StatusPill>
      </Row>
      <Row label="Mic">
        <StatusPill size="sm" tone="done">Confirmată</StatusPill>
        <StatusPill size="sm" tone="attention">Acum</StatusPill>
      </Row>
    </>
  );
}

export default function StatusPillGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell>
      <div style={C3WRAP}>
        <div style={C3PAIR}>
          <div data-gallery-frame data-theme="light" style={C3F}>
            <p className="caption" style={C3LAB}>Light</p>
            <PillSet lang="ro" />
          </div>
          <div data-gallery-frame data-theme="dark" style={C3F}>
            <p className="caption" style={C3LAB}>Dark</p>
            <PillSet lang="ro" />
          </div>
        </div>
        <div style={C3PAIR}>
          <div data-theme="light" style={C3F}>
            <p className="caption" style={C3LAB}>Deutsch (de)</p>
            <PillSet lang="de" />
          </div>
          <div data-theme="dark" style={C3F}>
            <p className="caption" style={C3LAB}>Deutsch · Dark</p>
            <PillSet lang="de" />
          </div>
        </div>
      </div>
    </GalleryShell>
  );
}
