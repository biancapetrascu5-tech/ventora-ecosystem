/* eslint-disable i18next/no-literal-string */
'use client';
import type React from 'react';
import { notFound } from 'next/navigation';
import { Kbd } from '@ventora/ui';
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

export default function KbdGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell>
      <div style={D}>
        <Row label="Taste">
          <Kbd keys={['mod', 'K']} />
          <Kbd keys={['shift', 'N']} />
          <Kbd keys={['Esc']} />
          <Kbd keys={['up', 'down']} />
          <Kbd keys={['enter']} />
        </Row>
      </div>
    </GalleryShell>
  );
}
