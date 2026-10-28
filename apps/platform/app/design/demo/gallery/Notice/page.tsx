/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { Button, Notice } from '@ventora/ui';
import { C3Pair } from '../_shared/QPair';
import f from '../_shared/frames.module.css';

// preview.html → C3Themes → NSet(NT.ro)
const T = {
  d: [
    'E-mailul sau parola nu sunt corecte',
    'Verifică-le și încearcă din nou. După 5 încercări îți trimitem un link de resetare.',
  ],
  a: [
    'Invitația a expirat',
    'Invitațiile sunt valabile 7 zile. Bianca Petrașcu îți poate trimite una nouă.',
    'Cere o invitație nouă',
  ],
  ok: ['Parola a fost schimbată', 'Te-am deconectat de pe celelalte dispozitive.'],
  n: ['Abonamentul se reînnoiește pe 1 noiembrie', 'Factura ajunge pe e-mail cu 3 zile înainte.'],
  i: [
    'Mentenanță programată în noaptea de sâmbătă',
    'Între 02:00 și 03:00 programările online sunt oprite câteva minute.',
  ],
};

function NSet() {
  return (
    <div className={f.c3stack}>
      <Notice tone="danger" title={T.d[0]}>
        {T.d[1]}
      </Notice>
      <Notice
        tone="attention"
        title={T.a[0]}
        actions={
          <Button size="sm" variant="secondary">
            {T.a[2]}
          </Button>
        }
      >
        {T.a[1]}
      </Notice>
      <Notice tone="done" title={T.ok[0]}>
        {T.ok[1]}
      </Notice>
      <Notice title={T.n[0]}>{T.n[1]}</Notice>
      <Notice icon="wrench" title={T.i[0]}>
        {T.i[1]}
      </Notice>
    </div>
  );
}

export default function NoticeGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <C3Pair render={() => <NSet />} />;
}
