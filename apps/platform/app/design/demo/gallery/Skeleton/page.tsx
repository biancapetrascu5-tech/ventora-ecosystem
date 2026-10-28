/* eslint-disable i18next/no-literal-string */
'use client';
import type React from 'react';
import { notFound } from 'next/navigation';
import { Skeleton, SkeletonText } from '@ventora/ui';
import { GalleryShell } from '../_shared/GalleryShell';

const DG2: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(var(--search-width), 1fr))',
  gap: 'var(--space-4) var(--space-6)',
  alignItems: 'start',
  padding: 'var(--space-4)',
  boxSizing: 'border-box',
};

const frame: React.CSSProperties = {
  border: 'var(--border-width) solid var(--line)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--sheet)',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  minWidth: 0,
  padding: 'var(--space-4)',
};

export default function SkeletonGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell>
      <div style={DG2}>
        <div style={frame}>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
            <Skeleton shape="circle" width={40} height={40} />
            <div style={{ flex: 1 }}>
              <SkeletonText lines={2} />
            </div>
          </div>
          <Skeleton shape="block" height={64} />
        </div>
        <div style={frame}>
          <SkeletonText lines={4} />
        </div>
      </div>
    </GalleryShell>
  );
}
