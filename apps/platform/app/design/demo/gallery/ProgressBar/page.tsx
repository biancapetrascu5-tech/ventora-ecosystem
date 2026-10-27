/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { ProgressBar } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

export default function ProgressBarGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="ProgressBar">
      <GallerySection label="RO" column>
        <ProgressBar label="Import clienți" value={42} showValue />
        <ProgressBar label="Configurare afacere" value={100} showValue />
        <ProgressBar label="Se pregătește exportul" />
        <ProgressBar value={18} size="sm" label="Încărcare" />
      </GallerySection>
      <GallerySection label="DE" column>
        <ProgressBar label="Kundendaten werden importiert" value={73} showValue />
      </GallerySection>
    </GalleryShell>
  );
}
