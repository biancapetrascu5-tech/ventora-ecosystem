/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { Button, DatePicker, Dialog, FormField, Select, Textarea } from '@ventora/ui';
import { PvCell, PvFrames } from '../_shared/QPair';
import f from '../_shared/frames.module.css';

// preview.html → Frames({ Board }) → section.pv-frame Light → Board({ lang: "ro" })
const T = {
  l: [
    'Distructiv (danger · alertdialog)',
    'Implicit · formular scurt',
    'Atenție · „au nevoie de tine”',
    'Lat (wide) · fără închidere la Esc/scrim',
  ],
  t1: 'Anulezi programarea?',
  d1: 'Ana Popescu · joi, 29 octombrie, 14:30 · Tuns. Îi trimitem automat un SMS că programarea s-a anulat.',
  keep: 'Păstrează programarea',
  cancel: 'Anulează programarea',
  reason: 'Motiv (opțional)',
  reasonPh: 'Îl trimitem și clientului',
  t2: 'Muți programarea lui Ștefan?',
  d2: 'Tuns · aceeași oră, 14:30. Ștefan Țăranu primește o reamintire nouă.',
  who: 'Ioana Pavel',
  when: 'Data nouă',
  staff: 'Angajat',
  back: 'Renunță',
  move: 'Mută programarea',
  t3: 'Telefonul afacerii e deconectat',
  d3: '3 reamintiri așteaptă să plece. Deschide aplicația Ventora pe telefon ca să le trimiți.',
  later: 'Mai târziu',
  fix: 'Vezi telefonul',
  t4: 'Cere alt abonament',
  d4: 'Bianca Petrașcu (proprietar) primește cererea ta și alege abonamentul. Până atunci, totul rămâne cum e.',
  plan: 'Abonament dorit',
  note: 'Mesaj pentru proprietar',
  notePh: 'De ce ai nevoie de mai multe programări pe lună',
  send: 'Trimite cererea',
};
const CLOSE = 'Închide';

function Board() {
  const L = T.l;
  return (
    <div className={f.pvCell} style={{ gap: 'var(--space-5)' }}>
      <div className={f.pvGrid2}>
        <PvCell label={L[0]!}>
          <Dialog
            inline
            tone="danger"
            icon="triangle-alert"
            title={T.t1}
            description={T.d1}
            closeLabel={CLOSE}
            footer={
              <>
                <Button>{T.keep}</Button>
                <Button variant="danger">{T.cancel}</Button>
              </>
            }
          >
            <FormField label={T.reason}>
              <Textarea rows={2} placeholder={T.reasonPh} />
            </FormField>
          </Dialog>
        </PvCell>
        <PvCell label={L[1]!}>
          <Dialog
            inline
            icon="calendar"
            title={T.t2}
            description={T.d2}
            closeLabel={CLOSE}
            footer={
              <>
                <Button>{T.back}</Button>
                <Button variant="primary">{T.move}</Button>
              </>
            }
          >
            <FormField label={T.when}>
              <DatePicker today={new Date(2026, 9, 24)} defaultValue={new Date(2026, 9, 30)} />
            </FormField>
            <FormField label={T.staff}>
              <Select defaultValue="i" options={[{ value: 'i', label: T.who }]} />
            </FormField>
          </Dialog>
        </PvCell>
        <PvCell label={L[2]!}>
          <Dialog
            inline
            tone="attention"
            icon="smartphone"
            title={T.t3}
            description={T.d3}
            closeLabel={CLOSE}
            footer={
              <>
                <Button>{T.later}</Button>
                <Button variant="primary">{T.fix}</Button>
              </>
            }
          />
        </PvCell>
      </div>
      <PvCell label={L[3]!}>
        <Dialog
          inline
          size="wide"
          isDismissable={false}
          icon="credit-card"
          title={T.t4}
          description={T.d4}
          footer={
            <>
              <Button>{T.back}</Button>
              <Button variant="primary" icon="send">
                {T.send}
              </Button>
            </>
          }
        >
          <FormField label={T.plan}>
            <Select defaultValue="b" options={[{ value: 'b', label: 'Business' }]} />
          </FormField>
          <FormField label={T.note}>
            <Textarea rows={2} placeholder={T.notePh} />
          </FormField>
        </Dialog>
      </PvCell>
    </div>
  );
}

export default function DialogGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <PvFrames render={() => <Board />} />;
}
