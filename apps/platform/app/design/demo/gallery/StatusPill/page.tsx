/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { StatusPill } from '@ventora/ui';
import { QPair } from '../_shared/QPair';
import f from '../_shared/frames.module.css';

// preview.html → Q_Extra → „Light / Dark · mare și mic” → Q_Pills(Q_RO)
const RO = [
  'În desfășurare',
  'Necesită confirmare',
  'Confirmată',
  'Plătită',
  'Restantă',
  'Ciornă',
  'Anulată de client',
  'Acum',
];

function Pills({ t }: { t: string[] }) {
  return (
    <div className={f.d0}>
      <div className={f.r}>
        <StatusPill tone="attention">{t[0]}</StatusPill>
        <StatusPill tone="attention" icon="clock">
          {t[1]}
        </StatusPill>
        <StatusPill tone="done">{t[2]}</StatusPill>
        <StatusPill tone="done" icon="check">
          {t[3]}
        </StatusPill>
        <StatusPill tone="danger">{t[4]}</StatusPill>
        <StatusPill tone="neutral">{t[5]}</StatusPill>
        <StatusPill tone="neutral" icon={false}>
          {t[6]}
        </StatusPill>
      </div>
      <div className={f.r}>
        <StatusPill size="sm" tone="done">
          {t[2]}
        </StatusPill>
        <StatusPill size="sm" tone="attention">
          {t[7]}
        </StatusPill>
        <StatusPill size="sm" tone="danger">
          {t[4]}
        </StatusPill>
        <StatusPill size="sm" tone="neutral">
          {t[5]}
        </StatusPill>
      </div>
    </div>
  );
}

export default function StatusPillGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <QPair>
      <Pills t={RO} />
    </QPair>
  );
}
