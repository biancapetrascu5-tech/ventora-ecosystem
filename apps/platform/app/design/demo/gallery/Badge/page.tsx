/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { Badge } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

export default function BadgeGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="Badge">
      <GallerySection label="Număr">
        <Badge tone="attention" count={3} label="3 necitite" />
        <Badge tone="attention" count={128} />
        <Badge count={12} />
        <Badge tone="primary" count={5} />
      </GallerySection>
      <GallerySection label="Etichetă">
        <Badge>Nou</Badge>
        <Badge tone="primary">Pro</Badge>
        <Badge>Beta</Badge>
      </GallerySection>
      <GallerySection label="Punct">
        <Badge dot tone="attention" label="Necitit" />
        <Badge dot tone="neutral" />
      </GallerySection>
      <GallerySection label="DE">
        <Badge>Neu</Badge>
        <Badge tone="attention" count={1284} />
      </GallerySection>
    </GalleryShell>
  );
}
