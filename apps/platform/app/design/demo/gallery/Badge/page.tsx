/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { Badge } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

export default function BadgeGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="Badge">
      <GallerySection label="Tones">
        <Badge tone="attention">Atentie</Badge>
        <Badge tone="primary">Primar</Badge>
        <Badge tone="neutral">Neutru</Badge>
        <Badge>Implicit</Badge>
      </GallerySection>
      <GallerySection label="Cu numar">
        <Badge count={3}>Mesaje</Badge>
        <Badge count={12}>Notificari</Badge>
        <Badge count={99}>Multime</Badge>
        <Badge count={0}>Zero</Badge>
      </GallerySection>
      <GallerySection label="Cu punct">
        <Badge dot>Noutati</Badge>
        <Badge dot tone="attention">
          Atentie
        </Badge>
        <Badge dot tone="primary">
          Actualizare
        </Badge>
      </GallerySection>
      <GallerySection label="Doar eticheta">
        <Badge label="Beta" />
        <Badge label="Nou" tone="attention" />
        <Badge label="Pro" tone="primary" />
      </GallerySection>
    </GalleryShell>
  );
}
