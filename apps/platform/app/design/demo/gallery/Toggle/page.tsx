/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { Toggle } from '@ventora/ui';
import { QPair } from '../_shared/QPair';
import f from '../_shared/frames.module.css';

// preview.html → Q_Extra → Q_Pair({ cols: 1 }) → Q_Tg({ t: Q_RO })
const T = [
  'Rezervări online',
  'Clienții te găsesc în Portal.',
  'Reamintiri prin SMS (oprit)',
  'Focus',
  'Mesaj de mulțumire după vizită',
  'Pleacă la 2 ore după programare.',
  'Se salvează',
  'Nu s-a salvat — încearcă din nou',
  'Dezactivat, pornit',
  'Dezactivat, oprit',
];

function Tg() {
  return (
    <div className={f.g2}>
      <div className={f.d0}>
        <Toggle description={T[1]} defaultSelected>
          {T[0]}
        </Toggle>
        <Toggle>{T[2]}</Toggle>
        <Toggle state="focus" defaultSelected>
          {T[3]}
        </Toggle>
        <Toggle labelPosition="start" description={T[5]} defaultSelected>
          {T[4]}
        </Toggle>
      </div>
      <div className={f.d0}>
        <Toggle isLoading defaultSelected>
          {T[6]}
        </Toggle>
        <Toggle isInvalid>{T[7]}</Toggle>
        <Toggle isDisabled defaultSelected>
          {T[8]}
        </Toggle>
        <Toggle isDisabled>{T[9]}</Toggle>
      </div>
    </div>
  );
}

export default function ToggleGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <QPair cols={1}>
      <Tg />
    </QPair>
  );
}
