/* eslint-disable i18next/no-literal-string */
'use client';
import type React from 'react';
import { notFound } from 'next/navigation';
import { Avatar, AvatarGroup } from '@ventora/ui';
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

const PEOPLE = [
  'Ana Popescu',
  'Andrei Ionescu',
  'Bianca Marin',
  'Cristina Dobre',
  'Dan Stoica',
  'Elena Georgescu',
  'Ioana Pavel',
].map((name) => ({ name }));

export default function AvatarGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell>
      <div style={D}>
        <Row label="Mărimi">
          {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((s) => (
            <Avatar key={s} size={s} name="Bianca Petrașcu" />
          ))}
        </Row>
        <Row label="Stare">
          <Avatar name="Ioana Pavel" status="done" />
          <Avatar name="Mara Enache" status="attention" />
          <Avatar name="Radu Matei" status="offline" />
          <Avatar name="Salon Aurora" shape="square" />
        </Row>
        <Row label="Grup">
          <AvatarGroup people={PEOPLE} max={4} />
          <AvatarGroup people={PEOPLE.slice(0, 3)} size="md" />
        </Row>
      </div>
    </GalleryShell>
  );
}
