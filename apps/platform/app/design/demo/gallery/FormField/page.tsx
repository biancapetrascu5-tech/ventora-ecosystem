/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { FormField, Input, Textarea } from '@ventora/ui';
import { C3Pair } from '../_shared/QPair';
import f from '../_shared/frames.module.css';

// preview.html → C3Themes → FFSet(FFT.ro); S.required / S.optional (ro)
const T = {
  l1: 'Nume afacere',
  h1: 'Apare pe facturi și în Portal.',
  v1: 'Salon Aurora',
  l2: 'Pagină de prezentare',
  p2: 'Ex.: https://salonaurora.ro',
  l3: 'Adresă de e-mail',
  e3: 'Adresa nu pare completă. Verifică după @.',
  v3: 'ana.popescu@',
  l4: 'Descriere scurtă',
  v4: 'Coafură, vopsit și tratamente în centrul Sibiului.',
  l5: 'Oraș (din abonament, nu se schimbă aici)',
  v5: 'Târgu Mureș',
};
const REQ = 'obligatoriu';
const OPT = 'opțional';

function FFSet() {
  return (
    <div className={f.c3stack}>
      <FormField label={T.l1} isRequired requiredLabel={REQ} hint={T.h1}>
        <Input defaultValue={T.v1} />
      </FormField>
      <FormField label={T.l2} isOptional optionalLabel={OPT}>
        <Input placeholder={T.p2} />
      </FormField>
      <FormField label={T.l3} isRequired requiredLabel={REQ} error={T.e3}>
        <Input type="email" defaultValue={T.v3} />
      </FormField>
      <FormField
        label={T.l4}
        counter={<span className={`caption v-num ${f.c3lab}`}>{`${T.v4.length} / 160`}</span>}
      >
        <Textarea defaultValue={T.v4} rows={2} />
      </FormField>
      <FormField label={T.l5}>
        <Input defaultValue={T.v5} disabled />
      </FormField>
    </div>
  );
}

export default function FormFieldGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <C3Pair render={() => <FFSet />} />;
}
