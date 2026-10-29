/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { Skeleton, SkeletonText } from '@ventora/ui';
import { QPair } from '../_shared/QPair';
import f from '../_shared/frames.module.css';

// preview.html → Q_Extra → „Light / Dark” → Q_Sk (RO)
const T = {
  load: 'Se încarcă fișa clientului…',
  after: 'Apoi apare: Ana Popescu · 12 programări · ultima vizită pe 14 oct.',
};

function Sk() {
  return (
    <div className={f.d0}>
      <p className="caption" style={{ margin: 0 }}>
        {T.load}
      </p>
      <div className={`${f.frame} ${f.d0}`} style={{ padding: 'var(--space-4)' }}>
        <div className={f.r}>
          <Skeleton shape="circle" width={40} height={40} />
          <div style={{ flex: 1 }}>
            <SkeletonText lines={2} />
          </div>
        </div>
        <Skeleton shape="line" width="60%" />
        <Skeleton shape="block" height={64} />
      </div>
      <p className="body-small" style={{ margin: 0, color: 'var(--ink-secondary)' }}>
        {T.after}
      </p>
    </div>
  );
}

export default function SkeletonGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <QPair>
      <Sk />
    </QPair>
  );
}
