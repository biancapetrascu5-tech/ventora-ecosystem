/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { FormField, Input } from '@ventora/ui';
import { C3Pair } from '../_shared/QPair';
import f from '../_shared/frames.module.css';

// preview.html → C3Themes → INSet("ro")
const T = [
  'Nume client',
  'Ex.: Ana Popescu',
  'Ștefan Țăranu',
  'Adresă de e-mail',
  'Adresa nu pare completă. Verifică după @.',
  'ana.popescu@',
  'Cod client (dezactivat)',
  'Număr factură (doar citire)',
  'Caută client',
  'Popescu',
  'Telefon',
  'Preț serviciu',
  'lei',
  'Parolă',
  'Mic',
  'Mare',
  'Caută în programări',
];

function InputSet() {
  return (
    <div className={f.c3stack}>
      <FormField label={T[0]}>
        <Input placeholder={T[1]} />
      </FormField>
      <FormField label="Hover">
        <Input defaultValue={T[2]} state="hover" />
      </FormField>
      <FormField label="Focus">
        <Input defaultValue={T[2]} state="focus" />
      </FormField>
      <FormField label={T[3]} isRequired error={T[4]}>
        <Input type="email" icon="mail" defaultValue={T[5]} />
      </FormField>
      <FormField label={T[6]}>
        <Input defaultValue="VNT-0042" disabled />
      </FormField>
      <FormField label={T[7]}>
        <Input defaultValue="VNT-2026-114" readOnly />
      </FormField>
      <FormField label={T[8]}>
        <Input icon="search" defaultValue={T[9]} isLoading clearable />
      </FormField>
      <FormField label={T[10]}>
        <Input type="tel" prefix="+40" defaultValue="722 123 456" />
      </FormField>
      <FormField label={T[11]}>
        <Input defaultValue="180" suffix={T[12]} inputMode="decimal" />
      </FormField>
      <FormField label={T[13]}>
        <Input type="password" defaultValue="ventora2026" />
      </FormField>
      <FormField label={`${T[14]} · sm`}>
        <Input size="sm" icon="search" placeholder={T[16]} />
      </FormField>
      <FormField label={`${T[15]} · lg`}>
        <Input size="lg" icon="search" placeholder={T[16]} />
      </FormField>
    </div>
  );
}

export default function InputGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <C3Pair render={() => <InputSet />} />;
}
