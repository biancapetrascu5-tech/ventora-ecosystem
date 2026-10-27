/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { Notice, Button } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

export default function NoticeGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="Notice">
      <GallerySection label="RO" column>
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
      </GallerySection>
      <GallerySection label="DE" column>
        <Notice tone="attention" title="Die Einladung ist abgelaufen">
          Einladungen sind 7 Tage gültig. Bitten Sie um eine neue.
        </Notice>
      </GallerySection>
    </GalleryShell>
  );
}
