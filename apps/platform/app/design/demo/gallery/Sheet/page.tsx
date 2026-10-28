/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { Button, DatePicker, FormField, Sheet, SheetSection, Toggle } from '@ventora/ui';
import { QPair } from '../_shared/QPair';
import f from '../_shared/frames.module.css';

// preview.html → Q_Extra → „Light / Dark” → Q_Pair → Q_SheetDemo({ t: Q_RO })
const T = {
  s1: 'Program de lucru',
  s1d: 'Clienții pot rezerva doar în aceste intervale.',
  edit: 'Editează',
  open: 'Deschidere',
  close: 'Închidere',
  s2: 'Rezervări online',
  tg: 'Permite rezervări din Portal',
  tgd: 'Apari în căutările clienților din zona ta.',
};

function SheetDemo() {
  return (
    <Sheet>
      <SheetSection
        title={T.s1}
        description={T.s1d}
        actions={
          <Button size="sm" icon="pencil">
            {T.edit}
          </Button>
        }
      >
        <div className={f.g2}>
          <FormField label={T.open}>
            <DatePicker mode="time" defaultValue="09:00" />
          </FormField>
          <FormField label={T.close}>
            <DatePicker mode="time" defaultValue="18:00" />
          </FormField>
        </div>
      </SheetSection>
      <SheetSection title={T.s2}>
        <Toggle description={T.tgd} defaultSelected>
          {T.tg}
        </Toggle>
      </SheetSection>
    </Sheet>
  );
}

export default function SheetGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <QPair>
      <SheetDemo />
    </QPair>
  );
}
