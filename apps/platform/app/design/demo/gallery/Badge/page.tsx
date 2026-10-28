/* eslint-disable i18next/no-literal-string */
'use client';
import type React from 'react';
import { notFound } from 'next/navigation';
import { Badge } from '@ventora/ui';
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

export default function BadgeGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell>
      <div style={D}>
        <Row label="Număr">
          <Badge tone="attention" count={3} label="3 necitite" />
          <Badge tone="attention" count={128} />
          <Badge count={12} />
          <Badge tone="primary" count={5} />
        </Row>
        <Row label="Etichetă">
          <Badge>Nou</Badge>
          <Badge tone="primary">Pro</Badge>
          <Badge>Beta</Badge>
        </Row>
        <Row label="Punct">
          <Badge dot tone="attention" label="Necitit" />
          <Badge dot tone="neutral" />
        </Row>
        <Row label="DE">
          <Badge>Neu</Badge>
          <Badge tone="attention" count={1284} />
        </Row>
      </div>
    </GalleryShell>
  );
}
