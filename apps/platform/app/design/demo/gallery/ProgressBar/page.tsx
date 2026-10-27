'use client';
import { notFound } from 'next/navigation';
import { ProgressBar } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

export default function ProgressBarGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="ProgressBar">
      <GallerySection label="Determinate — size md" column>
        <div style={{ width: 320 }}>
          <ProgressBar label="Upload fisier" value={25} showValue />
        </div>
        <div style={{ width: 320 }}>
          <ProgressBar label="Procesare date" value={60} showValue />
        </div>
        <div style={{ width: 320 }}>
          <ProgressBar label="Finalizat" value={100} showValue />
        </div>
        <div style={{ width: 320 }}>
          <ProgressBar label="Fara procent" value={45} />
        </div>
      </GallerySection>
      <GallerySection label="Size sm" column>
        <div style={{ width: 320 }}>
          <ProgressBar label="Progres mic" value={33} size="sm" />
        </div>
        <div style={{ width: 320 }}>
          <ProgressBar label="Aproape gata" value={80} size="sm" showValue />
        </div>
      </GallerySection>
      <GallerySection label="Indeterminate" column>
        <div style={{ width: 320 }}>
          <ProgressBar label="Se incarca..." />
        </div>
        <div style={{ width: 320 }}>
          <ProgressBar label="Se proceseaza..." size="sm" />
        </div>
      </GallerySection>
    </GalleryShell>
  );
}
