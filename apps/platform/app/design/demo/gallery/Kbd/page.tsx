/* eslint-disable i18next/no-literal-string */
'use client';
import { Fragment } from 'react';
import { notFound } from 'next/navigation';
import { Kbd } from '@ventora/ui';
import { C3Pair } from '../_shared/QPair';
import f from '../_shared/frames.module.css';

// preview.html → C3Themes → KSet(KBT.ro)
const RO = [
  'Caută oriunde în Hub',
  'Creează o programare',
  'Închide fereastra',
  'Mergi prin listă',
  'Confirmă alegerea',
];
const KEYS = [['mod', 'K'], ['shift', 'N'], ['Esc'], ['up', 'down'], ['enter']];

function KSet({ t }: { t: string[] }) {
  return (
    <div className={f.c3kv}>
      {KEYS.map((k, i) => (
        <Fragment key={i}>
          <span className="body-small">{t[i]}</span>
          <Kbd keys={k} />
        </Fragment>
      ))}
    </div>
  );
}

export default function KbdGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <C3Pair render={() => <KSet t={RO} />} />;
}
