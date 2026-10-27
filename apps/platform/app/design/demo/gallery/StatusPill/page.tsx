'use client';
import { notFound } from 'next/navigation';
import { StatusPill } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

export default function StatusPillGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="StatusPill">
      <GallerySection label="Tones">
        <StatusPill tone="attention">In desfasurare</StatusPill>
        <StatusPill tone="done">Finalizat</StatusPill>
        <StatusPill tone="danger">Blocat</StatusPill>
        <StatusPill tone="neutral">Planificat</StatusPill>
      </GallerySection>
      <GallerySection label="Size sm">
        <StatusPill tone="attention" size="sm">
          In desfasurare
        </StatusPill>
        <StatusPill tone="done" size="sm">
          Finalizat
        </StatusPill>
        <StatusPill tone="danger" size="sm">
          Blocat
        </StatusPill>
        <StatusPill tone="neutral" size="sm">
          Planificat
        </StatusPill>
      </GallerySection>
      <GallerySection label="Cu iconita">
        <StatusPill tone="attention" icon="clock">
          Neconfirmata
        </StatusPill>
        <StatusPill tone="done" icon="check">
          Confirmata
        </StatusPill>
        <StatusPill tone="danger" icon="x">
          Anulata
        </StatusPill>
        <StatusPill tone="neutral" icon="circle">
          Neutru
        </StatusPill>
      </GallerySection>
      <GallerySection label="Fara iconita (icon=false)">
        <StatusPill tone="attention" icon={false}>
          In asteptare
        </StatusPill>
        <StatusPill tone="done" icon={false}>
          Rezolvat
        </StatusPill>
      </GallerySection>
    </GalleryShell>
  );
}
