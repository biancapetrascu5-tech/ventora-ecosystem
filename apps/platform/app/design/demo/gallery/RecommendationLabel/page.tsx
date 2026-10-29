/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { RecommendationLabel } from '@ventora/ui';
import { ThPair } from '../_shared/QPair';
import f from '../_shared/frames.module.css';

// preview.html → Extra → Frames({ States }) → ThemeFrame light → RL(titlu, rând)
const L = 'Recomandare';

function States() {
  return (
    <div className={f.d0}>
      <div className={f.r}>
        <RecommendationLabel label={L} />
      </div>
      <div
        className={f.sheetlike}
        style={{
          padding: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          alignItems: 'flex-start',
        }}
      >
        <RecommendationLabel label={L} />
        <p className="body-strong">Ține istoricul clienților în ClientDesk</p>
        <p className={`body-small ${f.muted}`}>
          Clienții tăi din programări pot avea istoric, note și follow-up.
        </p>
      </div>
    </div>
  );
}

export default function RecommendationLabelGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <ThPair as="div" titleClass="heading" min={420} render={() => <States />} />;
}
