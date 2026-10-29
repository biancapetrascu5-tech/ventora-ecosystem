/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { FormField, Select, type SelectOptionGroup } from '@ventora/ui';
import { ThPair } from '../_shared/QPair';
import f from '../_shared/frames.module.css';

// preview.html → Extra → Frames({ States }) → ThemeFrame light → SL(SL_RO)
const RO = {
  f: ['Serviciu', 'Angajat', 'Apăsat', 'Sală', 'Locație (dezactivat)', 'Se încarcă', 'Mic', 'Mare'],
  help: 'Durata se completează singură.',
  ph: 'Alege angajatul',
  ph2: 'Alege sala',
  err: 'Alege o sală.',
  person: 'Ștefania Mureșan',
  loc: 'Sibiu, Piața Mare',
  load: 'Se încarcă…',
};
const SVC: SelectOptionGroup[] = [
  {
    label: 'Coafor',
    options: [
      { value: 'tuns', label: 'Tuns', description: '45 min · 120 lei' },
      { value: 'vopsit', label: 'Vopsit rădăcini', description: '120 min · 350 lei' },
    ],
  },
  {
    label: 'Cosmetică',
    options: [
      { value: 'facial', label: 'Tratament facial', description: '60 min · 220 lei' },
      { value: 'man', label: 'Manichiură', description: '50 min · 110 lei', isDisabled: true },
    ],
  },
];
const PERSON = [{ value: 'a', label: RO.person }];

function SL() {
  return (
    <div className={f.g2f}>
      <FormField label={RO.f[0]} hint={RO.help}>
        <Select options={SVC} defaultValue="facial" />
      </FormField>
      <FormField label={RO.f[1]}>
        <Select placeholder={RO.ph} options={PERSON} />
      </FormField>
      <FormField label="Hover">
        <Select defaultValue="a" state="hover" options={PERSON} />
      </FormField>
      <FormField label="Focus">
        <Select defaultValue="a" state="focus" options={PERSON} />
      </FormField>
      <FormField label={RO.f[2]}>
        <Select defaultValue="a" state="pressed" options={PERSON} />
      </FormField>
      <FormField label={RO.f[3]} isRequired error={RO.err}>
        <Select isInvalid placeholder={RO.ph2} options={[{ value: '1', label: '1' }]} />
      </FormField>
      <FormField label={RO.f[4]}>
        {/* preview.html cere icon "map-pin", care nu e în registrul bundle.js: designul îl randează fără. */}
        <Select isDisabled defaultValue="s" options={[{ value: 's', label: RO.loc }]} />
      </FormField>
      <FormField label={RO.f[5]}>
        <Select isLoading placeholder={RO.load} options={[]} />
      </FormField>
      <FormField label={RO.f[6]}>
        <Select size="sm" defaultValue="a" options={PERSON} />
      </FormField>
      <FormField label={RO.f[7]}>
        <Select size="lg" defaultValue="a" options={PERSON} />
      </FormField>
    </div>
  );
}

export default function SelectGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <ThPair as="div" titleClass="heading" min={420} render={() => <SL />} />;
}
