/* eslint-disable i18next/no-literal-string */
'use client';
import type React from 'react';
import { notFound } from 'next/navigation';
import { Skeleton, SkeletonText } from '@ventora/ui';
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

function SkeletonSet() {
  return (
    <>
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
        <Skeleton shape="circle" width={40} height={40} />
        <div style={{ flex: 1 }}>
          <SkeletonText lines={2} />
        </div>
      </div>
      <Skeleton shape="block" height={64} />
      <SkeletonText lines={4} />
    </>
  );
}

export default function SkeletonGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell>
      <div style={C3WRAP}>
        <div style={C3PAIR}>
          <div data-gallery-frame data-theme="light" style={C3F}>
            <p className="caption" style={C3LAB}>Light</p>
            <SkeletonSet />
          </div>
          <div data-gallery-frame data-theme="dark" style={C3F}>
            <p className="caption" style={C3LAB}>Dark</p>
            <SkeletonSet />
          </div>
        </div>
      </div>
    </GalleryShell>
  );
}
