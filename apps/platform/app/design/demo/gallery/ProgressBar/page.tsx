/* eslint-disable i18next/no-literal-string */
'use client';
import type React from 'react';
import { notFound } from 'next/navigation';
import { ProgressBar } from '@ventora/ui';
import { GalleryShell } from '../_shared/GalleryShell';

const D: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  padding: 'var(--space-4)',
  boxSizing: 'border-box',
  maxWidth: 'calc(var(--panel-width) * 1.2)',
};

export default function ProgressBarGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell>
      <div style={D}>
        <ProgressBar label="Import clienți" value={42} showValue />
        <ProgressBar label="Configurare afacere" value={100} showValue />
        <ProgressBar label="Se pregătește exportul" />
        <ProgressBar value={18} size="sm" label="Încărcare" />
        <ProgressBar label="Kundendaten werden importiert" value={73} showValue />
      </div>
    </GalleryShell>
  );
}
