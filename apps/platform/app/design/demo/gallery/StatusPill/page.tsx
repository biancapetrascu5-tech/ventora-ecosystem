/* eslint-disable i18next/no-literal-string */
'use client';
import type React from 'react';
import { notFound } from 'next/navigation';
import { StatusPill } from '@ventora/ui';
import { GalleryShell } from '../_shared/GalleryShell';

const D: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  padding: 'var(--space-4)',
  boxSizing: 'border-box',
};

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'center' }}>
    <span
      style={{
        color: 'var(--ink-muted)',
        width: 'calc(var(--space-16) + var(--space-6))',
        flex: 'none',
        fontSize: 'var(--type-caption-size)',
      }}
    >
      {label}
    </span>
    {children}
  </div>
);

export default function StatusPillGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell>
      <div style={D}>
        <Row label="Tonuri">
          <StatusPill tone="attention">În desfășurare</StatusPill>
          <StatusPill tone="attention" icon="clock">
            Necesită confirmare
          </StatusPill>
          <StatusPill tone="done">Confirmată</StatusPill>
          <StatusPill tone="done" icon="check">
            Plătită
          </StatusPill>
          <StatusPill tone="danger">Restantă</StatusPill>
          <StatusPill tone="neutral">Ciornă</StatusPill>
          <StatusPill tone="neutral" icon={false}>
            Anulată de client
          </StatusPill>
        </Row>
        <Row label="Mic">
          <StatusPill size="sm" tone="done">
            Confirmată
          </StatusPill>
          <StatusPill size="sm" tone="attention">
            Acum
          </StatusPill>
        </Row>
        <Row label="DE">
          <StatusPill tone="attention">Wird gerade durchgeführt</StatusPill>
          <StatusPill tone="done">Bestätigt</StatusPill>
          <StatusPill tone="danger">Überfällig</StatusPill>
        </Row>
      </div>
    </GalleryShell>
  );
}
