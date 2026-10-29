/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { UpgradeDialog, type UpgradeOption } from '@ventora/ui';
import { QPair } from '../_shared/QPair';
import { UPGRADE_RO, USAGE_RO } from '../_shared/labels';

// preview.html → Q_Extra → Q_Sec „Light / Dark · opțiuni (proprietar)” → Q_Fr light / dark
const UP_LIMIT: UpgradeOption[] = [
  {
    id: 'pack',
    kind: 'pack',
    title: 'Pachet de 200 de programări',
    price: '39 lei · doar pentru octombrie · fără cost de implementare',
    includes: [
      'Intră imediat, poți adăuga programarea acum',
      'Din noiembrie revii la limita abonamentului',
    ],
  },
  {
    id: 'plan',
    kind: 'plan',
    title: 'Abonamentul Business Plus',
    price: '449 lei pe lună în loc de 349 · fără cost de implementare',
    includes: ['Programări nelimitate', '3.000 SMS pe lună', 'DataView inclus'],
  },
];
const LIM = { label: 'Programări în octombrie', used: 1000, limit: 1000 };
const noop = () => {};

function Owner() {
  return (
    <UpgradeDialog
      title="Ai atins limita de programări din octombrie"
      description="Ca să adaugi programarea de azi, alege una dintre variante."
      usage={LIM}
      options={UP_LIMIT}
      onContinue={noop}
      labels={UPGRADE_RO}
      usageLabels={USAGE_RO}
    />
  );
}

export default function UpgradeDialogGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <QPair>{<Owner />}</QPair>;
}
