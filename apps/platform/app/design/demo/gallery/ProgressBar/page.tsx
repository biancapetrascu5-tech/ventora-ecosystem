/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { ProgressBar } from '@ventora/ui';
import { ThPair } from '../_shared/QPair';
import f from '../_shared/frames.module.css';

// preview.html → Extra → Frames(States) → ThemeFrame (div.thf, titlu .heading, grila thg 420px)
const T = [
  'Importul începe în curând',
  'Import clienți din fișierul „Clienți Sibiu.xlsx”',
  'Configurarea afacerii e gata',
  'Se pregătește exportul…',
  'Încărcare fișier',
  'Sincronizare programări',
];

function States() {
  return (
    <div className={f.d0}>
      <p className={`caption ${f.muted}`}>
        0% · în lucru · gata (lime) · fără procent (nedeterminat) · mic · mare
      </p>
      <div className={f.d0}>
        <ProgressBar label={T[0]} value={0} showValue />
        <ProgressBar label={T[1]} value={42} showValue />
        <ProgressBar label={T[2]} value={100} showValue />
        <ProgressBar label={T[3]} />
        <ProgressBar label={T[4]} value={18} size="sm" />
        <ProgressBar label={T[5]} value={66} size="lg" showValue />
      </div>
    </div>
  );
}

export default function ProgressBarGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <ThPair as="div" titleClass="heading" min={420} render={() => <States />} />;
}
