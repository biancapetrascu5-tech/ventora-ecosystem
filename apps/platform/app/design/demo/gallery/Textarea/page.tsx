/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { FormField, Textarea } from '@ventora/ui';
import { QPair } from '../_shared/QPair';
import f from '../_shared/frames.module.css';

// preview.html → Q_Extra → „Light / Dark” → Q_Pair({ cols: 1 }) → Q_TA({ t: Q_RO })
const RO = {
  l1: 'Note pentru echipă',
  h1: 'Le vede doar echipa, nu clientul.',
  p1: 'Ex.: preferă o cameră liniștită',
  l2: 'Mesaj pentru client',
  v2: 'Ne vedem joi la 14:30. Te rugăm să ajungi cu 5 minute mai devreme.',
  l3: 'Motivul anulării',
  e3: 'Scrie un motiv, îl trimitem clientului.',
  l4: 'Istoric',
  v4: 'Creat de Ana, 12.10.2026',
};
// S.characters (ro)
const chars = (n: number, max: number) => `${n} din ${max} caractere`;

function TA() {
  return (
    <div className={f.g2}>
      <FormField label={RO.l1} hint={RO.h1}>
        <Textarea placeholder={RO.p1} />
      </FormField>
      <FormField label={RO.l2}>
        <Textarea defaultValue={RO.v2} maxLength={160} showCount countLabel={chars} state="focus" />
      </FormField>
      <FormField label={RO.l3} isRequired error={RO.e3}>
        <Textarea rows={2} isInvalid />
      </FormField>
      <FormField label={RO.l4}>
        <Textarea rows={2} defaultValue={RO.v4} disabled />
      </FormField>
    </div>
  );
}

export default function TextareaGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <QPair cols={1}>
      <TA />
    </QPair>
  );
}
