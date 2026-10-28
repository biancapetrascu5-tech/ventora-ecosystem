/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { StatusDot } from '@ventora/ui';
import { QPair } from '../_shared/QPair';
import f from '../_shared/frames.module.css';

// preview.html → Q_Extra → „Light / Dark” → Q_Dots(Q_RO)
const RO = ['Acum, în cabinetul 2', 'Confirmat', 'Eșuat', 'În pauză', 'Deconectată'];

function Dots({ t }: { t: string[] }) {
  return (
    <div className={f.r}>
      <StatusDot tone="attention" label={t[0]} />
      <StatusDot tone="done" label={t[1]} />
      <StatusDot tone="danger" label={t[2]} />
      <StatusDot tone="neutral" label={t[3]} />
      <StatusDot tone="offline" label={t[4]} />
    </div>
  );
}

export default function StatusDotGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <QPair>
      <Dots t={RO} />
    </QPair>
  );
}
