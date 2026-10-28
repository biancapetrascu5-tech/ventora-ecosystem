/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { Calendar, DatePicker, FormField } from '@ventora/ui';
import { PvCell, PvFrames } from '../_shared/QPair';
import { DATEPICKER_RO } from '../_shared/labels';
import f from '../_shared/frames.module.css';

// preview.html → Frames({ Board }) → section.pv-frame Light → Board({ lang: "ro", first: true })
const T = {
  l: [
    'Deschis (popover) · azi cu inel peach, ziua aleasă, duminicile indisponibile',
    'Calendar · dată (azi, aleasă, zile tăiate)',
    'Calendar · interval',
    'Dată aleasă',
    'Interval',
    'Oră',
    'Gol (text de ajutor)',
    'Eroare',
    'Dezactivat',
  ],
  date: 'Data programării',
  helper: 'Săptămâna începe luni. Duminica salonul e închis.',
  range: 'Interval raport',
  time: 'Ora',
  empty: 'Data următoarei vizite',
  birth: 'Data nașterii',
  err: 'Alege o dată din trecut.',
  dis: 'Data facturii (blocată)',
  popNote:
    'Calendarul deschis stă deasupra paginii, așa că apare doar în acest cadru; în celelalte e arătat direct, mai jos.',
};
const TODAY = new Date(2026, 9, 24);
const sun = (d: Date) => d.getDay() === 0;
const noop = () => {};
const LB = DATEPICKER_RO;

function Board({ first }: { first: boolean }) {
  const L = first ? T.l : [null, ...T.l];
  return (
    <div className={f.pvCell} style={{ gap: 'var(--space-5)' }}>
      {first && (
        <div
          style={{
            minHeight: 440,
            display: 'flex',
            gap: 'var(--space-8)',
            alignItems: 'flex-start',
          }}
        >
          <PvCell label={L[0]!} style={{ width: 360, flex: 'none' }}>
            <FormField label={T.date} hint={T.helper}>
              <DatePicker
                labels={LB}
                today={TODAY}
                defaultValue={new Date(2026, 9, 29)}
                defaultOpen
                min={new Date(2026, 9, 20)}
                isDisabled={sun}
                onChange={noop}
              />
            </FormField>
          </PvCell>
          <p
            className={`caption ${f.pvNote}`}
            style={{ marginTop: 'var(--space-10)', maxWidth: 360 }}
          >
            {T.popNote}
          </p>
        </div>
      )}
      <div className={f.pvGrid2}>
        <PvCell label={L[1]!}>
          <div className={f.pvBox} style={{ maxWidth: 360 }}>
            <Calendar
              labels={LB}
              today={TODAY}
              value={new Date(2026, 9, 29)}
              min={new Date(2026, 9, 20)}
              isDisabled={sun}
              onChange={noop}
            />
          </div>
        </PvCell>
        <PvCell label={L[2]!}>
          <div className={f.pvBox} style={{ maxWidth: 360 }}>
            <Calendar
              labels={LB}
              mode="range"
              today={TODAY}
              value={[new Date(2026, 9, 1), new Date(2026, 9, 24)]}
              onChange={noop}
            />
          </div>
        </PvCell>
      </div>
      <div className={f.pvGrid}>
        <PvCell label={L[3]!}>
          <FormField label={T.date}>
            <DatePicker
              labels={LB}
              today={TODAY}
              defaultValue={new Date(2026, 9, 29)}
              onChange={noop}
            />
          </FormField>
        </PvCell>
        <PvCell label={L[4]!}>
          <FormField label={T.range}>
            <DatePicker
              labels={LB}
              mode="range"
              today={TODAY}
              defaultValue={[new Date(2026, 9, 1), new Date(2026, 9, 24)]}
            />
          </FormField>
        </PvCell>
        <PvCell label={L[5]!}>
          <FormField label={T.time}>
            <DatePicker
              labels={LB}
              mode="time"
              defaultValue="14:30"
              step={15}
              timeFrom="08:00"
              timeTo="20:00"
            />
          </FormField>
        </PvCell>
        <PvCell label={L[6]!}>
          <FormField label={T.empty} hint={T.helper}>
            <DatePicker labels={LB} today={TODAY} />
          </FormField>
        </PvCell>
        <PvCell label={L[7]!}>
          <FormField label={T.birth} isRequired error={T.err}>
            <DatePicker labels={LB} today={TODAY} invalid />
          </FormField>
        </PvCell>
        <PvCell label={L[8]!}>
          <FormField label={T.dis}>
            <DatePicker labels={LB} disabled defaultValue={TODAY} />
          </FormField>
        </PvCell>
      </div>
    </div>
  );
}

export default function DatePickerGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <>
      <PvFrames render={(th) => <Board first={th === 'light'} />} />
      {/* În preview.html după Dark urmează cadrele DE și IT, deci cadrul Dark se poate derula
          până sus; calendarul deschis din Light (fixed, ținut în fereastră) cade astfel în același
          loc peste cadrul Dark ca în design. Spațiul ține locul acelor cadre. */}
      <div aria-hidden="true" style={{ height: '100vh' }} />
    </>
  );
}
