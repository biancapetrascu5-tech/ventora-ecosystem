'use client';
import { notFound } from 'next/navigation';
import { StatusDot } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

export default function StatusDotGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="StatusDot">
      <GallerySection label="Tones — fara eticheta">
        <StatusDot tone="attention" />
        <StatusDot tone="done" />
        <StatusDot tone="danger" />
        <StatusDot tone="neutral" />
        <StatusDot tone="offline" />
      </GallerySection>
      <GallerySection label="Cu eticheta" column>
        <StatusDot tone="attention" label="Atentie necesara" />
        <StatusDot tone="done" label="Activ" />
        <StatusDot tone="danger" label="Eroare" />
        <StatusDot tone="neutral" label="In asteptare" />
        <StatusDot tone="offline" label="Deconectat" />
      </GallerySection>
    </GalleryShell>
  );
}
