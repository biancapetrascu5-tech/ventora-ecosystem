/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { StatusPill } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

export default function StatusPillGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="StatusPill">
      <GallerySection label="Tonuri">
        <StatusPill tone="attention">În desfășurare</StatusPill>
        <StatusPill tone="attention" icon="clock">
          Necesită confirmare
        </StatusPill>
        <StatusPill tone="done">Confirmată</StatusPill>
        <StatusPill tone="done" icon="check">
          Plătită
        </StatusPill>
        <StatusPill tone="danger">Restantă</StatusPill>
        <StatusPill tone="neutral">Ciornă</StatusPill>
        <StatusPill tone="neutral" icon={false}>
          Anulată de client
        </StatusPill>
      </GallerySection>
      <GallerySection label="Mic">
        <StatusPill size="sm" tone="done">
          Confirmată
        </StatusPill>
        <StatusPill size="sm" tone="attention">
          Acum
        </StatusPill>
      </GallerySection>
      <GallerySection label="DE">
        <StatusPill tone="attention">Wird gerade durchgeführt</StatusPill>
        <StatusPill tone="done">Bestätigt</StatusPill>
        <StatusPill tone="danger">Überfällig</StatusPill>
      </GallerySection>
    </GalleryShell>
  );
}
