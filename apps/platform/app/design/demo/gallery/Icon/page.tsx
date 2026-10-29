/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { Icon, type IconName } from '@ventora/ui';
import { C3Pair } from '../_shared/QPair';
import f from '../_shared/frames.module.css';

// preview.html → C3Themes → c3stack(ICReq(ICT.ro), ICSizes("Blocat"))
const REQ: IconName[] = ['wrench', 'lock', 'globe', 'store', 'grid', 'arrow-right'];
const RO = [
  'Întreținere',
  'Siguranță',
  'Limbă',
  'Magazin în Portal',
  'Toate aplicațiile',
  'Mergi mai departe',
];

function Req() {
  return (
    <div className={f.icons}>
      {REQ.map((n, i) => (
        <span key={n} className={f.ic} title={n}>
          <Icon icon={n} size={20} />
          <span className="body-small">{RO[i]}</span>
        </span>
      ))}
    </div>
  );
}

function Sizes({ t }: { t: string }) {
  return (
    <div className={f.r}>
      {[16, 20, 24].map((s) => (
        <span key={s} className={f.c3ib}>
          <Icon icon="store" size={s} />
          <span className={`caption ${f.c3lab}`}>{s} px</span>
        </span>
      ))}
      <span className={f.c3ib}>
        <Icon icon="lock" size={24} strokeWidth={2} />
        <span className={`caption ${f.c3lab}`}>stroke 2</span>
      </span>
      <span className={f.c3ib}>
        <Icon icon="lock" size={16} label={t} />
        <span className={`caption ${f.c3lab}`}>{`label: „${t}”`}</span>
      </span>
    </div>
  );
}

export default function IconGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <C3Pair
      render={() => (
        <div className={f.c3stack}>
          <Req />
          <Sizes t="Blocat" />
        </div>
      )}
    />
  );
}
