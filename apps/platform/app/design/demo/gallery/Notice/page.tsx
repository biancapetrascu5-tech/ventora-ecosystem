/* eslint-disable i18next/no-literal-string */
'use client';
import type React from 'react';
import { notFound } from 'next/navigation';
import { Notice, Button } from '@ventora/ui';
import { GalleryShell } from '../_shared/GalleryShell';

const DG2: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(var(--search-width), 1fr))',
  gap: 'var(--space-4) var(--space-6)',
  alignItems: 'start',
  padding: 'var(--space-4)',
  boxSizing: 'border-box',
};

export default function NoticeGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell>
      <div style={DG2}>
        <Notice tone="danger" title="E-mailul sau parola nu sunt corecte">
          Verifică-le și încearcă din nou. După 5 încercări îți trimitem un link de resetare.
        </Notice>
        <Notice
          tone="attention"
          title="Invitația a expirat"
          actions={
            <Button size="sm" variant="secondary">
              Cere o invitație nouă
            </Button>
          }
        >
          Invitațiile sunt valabile 7 zile. Bianca Petrașcu îți poate trimite una nouă.
        </Notice>
        <Notice tone="done" title="Parola a fost schimbată">
          Te-am deconectat de pe celelalte dispozitive.
        </Notice>
        <Notice title="Planul se reînnoiește pe 1 noiembrie">
          Factura ajunge pe e-mail cu 3 zile înainte.
        </Notice>
        <Notice tone="attention" title="Die Einladung ist abgelaufen">
          Einladungen sind 7 Tage gültig. Bitten Sie um eine neue.
        </Notice>
      </div>
    </GalleryShell>
  );
}
