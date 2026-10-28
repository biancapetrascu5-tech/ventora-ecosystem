/* eslint-disable i18next/no-literal-string */
'use client';
import { useState } from 'react';
import { notFound } from 'next/navigation';
import { FormField, SlotPicker } from '@ventora/ui';
import { QPair } from '../_shared/QPair';

// preview.html → Q_Extra → „Light / Dark” → Q_Pair → Q_Slot({ t: Q_RO, init: "13:15" })
const SLOTS = [
  '09:00',
  '09:15',
  '09:30',
  '09:45',
  '10:00',
  '10:15',
  '13:15',
  '13:30',
  '15:15',
  '15:30',
  '17:00',
  '17:15',
].map((time, i) => ({ time, available: ![1, 2, 7].includes(i) }));
const T = {
  label: 'Ora de început',
  help: 'Orele tăiate sunt ocupate. Durata serviciului: 45 min.',
};

function Slot() {
  const [v, setV] = useState<string | undefined>('13:15');
  return (
    <FormField label={T.label} hint={T.help}>
      <div>
        <SlotPicker label={T.label} slots={SLOTS} value={v} onChange={setV} />
      </div>
    </FormField>
  );
}

export default function SlotPickerGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <QPair>
      <Slot />
    </QPair>
  );
}
