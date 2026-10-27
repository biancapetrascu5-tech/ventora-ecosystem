/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { StatusDot } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

export default function StatusDotGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="StatusDot">
      <GallerySection label="Tonuri" column>
        <StatusDot tone="attention" label="Acum, în cabinetul 2" />
        <StatusDot tone="done" label="Confirmat" />
        <StatusDot tone="danger" label="Eșuat" />
        <StatusDot tone="neutral" label="În pauză" />
        <StatusDot tone="offline" label="Offline" />
      </GallerySection>
      <GallerySection label="DE" column>
        <StatusDot tone="attention" label="Gerade in Behandlung" />
        <StatusDot tone="done" label="Bestätigt" />
      </GallerySection>
    </GalleryShell>
  );
}
