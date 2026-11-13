/* eslint-disable i18next/no-literal-string -- the example data and box labels of preview.html */
'use client';

import type { ReactNode } from 'react';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import { Button, FormField, Input, Notice, SlotPicker, StatusPill, Toast } from '@ventora/ui';
import {
  BulkCancelDialog,
  CalendarHint,
  CancelAppointmentDialog,
  EmptyDay,
  ListEmptyAll,
  ListEmptyFiltered,
  LoadError,
  NothingToDo,
  OtherDaysNotice,
  UnsavedDialog,
} from '@ventora/booking/ui';
import ro from '@ventora/i18n/messages/ro.json';
import de from '@ventora/i18n/messages/de.json';
import it from '@ventora/i18n/messages/it.json';
import bookingRo from '@ventora/booking/messages/ro.json';
import bookingDe from '@ventora/booking/messages/de.json';
import bookingIt from '@ventora/booking/messages/it.json';
import { noop } from '../_shared/shell';
import f from '../_shared/frames.module.css';
import x from './states.module.css';

/* BookingStates in the gallery: preview.html's board, in its order — light and dark (RO), then the
   DE (light) and IT (dark) label test. Each box is the state the screens draw (modules/booking/src/
   ui: states/, detail/, new/), with the texts of their keys; only the example data and the box
   labels (the preview's own captions) are fixed here. */

type Lang = 'ro' | 'de' | 'it';
const MESSAGES: Record<Lang, Record<string, unknown>> = {
  ro: { ...ro, booking: bookingRo },
  de: { ...de, booking: bookingDe },
  it: { ...it, booking: bookingIt },
};

// preview.html D__de / D__it: the box labels and the example values in the label test
const LABELS: Record<string, [string, string]> = {
  'Azi · zi goală': ['Heute · leerer Tag', 'Oggi · giornata vuota'],
  'Azi · „Au nevoie de tine”, goală': [
    'Heute · „Wartet auf Sie“, leer',
    'Oggi · «In attesa di Lei», vuota',
  ],
  'Azi · eroare la încărcare': ['Heute · Fehler beim Laden', 'Oggi · errore di caricamento'],
  'Azi · după „Marchează ca încheiată”': [
    'Heute · nach „Als erledigt markieren“',
    'Oggi · dopo «Segna come concluso»',
  ],
  'Calendar · indiciu la prima folosire': [
    'Kalender · Hinweis bei der ersten Nutzung',
    'Calendario · suggerimento al primo utilizzo',
  ],
  'Listă · goală, cu filtre': ['Liste · leer, mit Filtern', 'Elenco · vuoto, con filtri'],
  'Listă · goală de tot': ['Liste · ganz leer', 'Elenco · completamente vuoto'],
  'Listă · export': ['Liste · Export', 'Elenco · esportazione'],
  'Listă · anulare în bloc (notificarea pornită)': [
    'Liste · mehrere absagen (Benachrichtigung an)',
    'Elenco · annullamento multiplo (notifica attiva)',
  ],
  'Detaliu · anularea unei programări (notificarea oprită)': [
    'Detail · einen Termin absagen (Benachrichtigung aus)',
    'Dettaglio · annullare un appuntamento (notifica disattivata)',
  ],
  'Detaliu · „Nu a venit” și mutare reușită': [
    'Detail · „Nicht erschienen“ und erfolgreich verschoben',
    'Dettaglio · «Non presentato» e spostamento riuscito',
  ],
  'Programare nouă · validare': ['Neuer Termin · Prüfung', 'Nuovo appuntamento · convalida'],
  'Programare nouă · suprapunere': [
    'Neuer Termin · Überschneidung',
    'Nuovo appuntamento · sovrapposizione',
  ],
  'Programare nouă · salvată': ['Neuer Termin · gespeichert', 'Nuovo appuntamento · salvato'],
  'Setări · salvate': ['Einstellungen · gespeichert', 'Impostazioni · salvate'],
  'Setări · plecare fără salvare': [
    'Einstellungen · verlassen ohne Speichern',
    'Impostazioni · uscita senza salvare',
  ],
  'Limită · după „Anunță proprietarul”': [
    'Limit · nach „Inhaber benachrichtigen“',
    'Limite · dopo «Avvisa il titolare»',
  ],
  'Azi · după „Confirmă”': ['Heute · nach „Bestätigen“', 'Oggi · dopo «Conferma»'],
  'Azi · peste 5 lucruri': ['Heute · mehr als 5 Einträge', 'Oggi · più di 5 voci'],
  'Calendar · „Primul loc liber”': [
    'Kalender · „Erster freier Termin“',
    'Calendario · «Primo posto libero»',
  ],
  'Listă · rezultate în alte zile': [
    'Liste · Treffer an anderen Tagen',
    'Elenco · risultati in altri giorni',
  ],
  'Listă · export (cu filtrele active)': [
    'Liste · Export (mit aktiven Filtern)',
    'Elenco · esportazione (con filtri attivi)',
  ],
  'Detaliu · programare încheiată': [
    'Detail · Termin erledigt',
    'Dettaglio · appuntamento concluso',
  ],
};
const V: Record<string, [string, string, string]> = {
  exportDay: ['23 octombrie', '23. Oktober', '23 ottobre'],
  cancelDay: ['vineri, 23 octombrie', 'Freitag, 23. Oktober', 'venerdì 23 ottobre'],
  moveDay: ['sâmbătă', 'Samstag', 'sabato'],
  saved: [
    'Marți, 27 octombrie, 13:15',
    'Dienstag, 27. Oktober, 13:15',
    'Martedì 27 ottobre, 13:15',
  ],
  weekday: ['joi', 'Donnerstag', 'giovedì'],
  service: ['Tuns', 'Haarschnitt', 'Taglio'],
};
const I: Record<Lang, 0 | 1 | 2> = { ro: 0, de: 1, it: 2 };

function Sb({
  lang,
  label,
  w,
  children,
}: {
  lang: Lang;
  label: string;
  w?: number;
  children: ReactNode;
}) {
  const text = lang === 'ro' ? label : LABELS[label]![lang === 'de' ? 0 : 1];
  return (
    <div className={x.stc} style={w ? { gridColumn: `span ${w}` } : undefined}>
      <p className={`caption ${x.muted}`}>{text}</p>
      <div className={x.box}>{children}</div>
    </div>
  );
}

function Grid({ lang }: { lang: Lang }) {
  const t = useTranslations('booking');
  const v = (k: string) => V[k]![I[lang]];
  return (
    <div className={x.grid}>
      <Sb lang={lang} label="Azi · zi goală" w={2}>
        <EmptyDay onAdd={noop} onCalendar={noop} />
      </Sb>
      <Sb lang={lang} label="Azi · „Au nevoie de tine”, goală">
        <NothingToDo />
      </Sb>
      <Sb lang={lang} label="Azi · eroare la încărcare">
        <LoadError onRetry={noop} />
      </Sb>
      <Sb lang={lang} label="Azi · după „Marchează ca încheiată”">
        <Toast
          className={x.full}
          tone="done"
          title={t('states.completed', { client: 'Andrei Ionescu' })}
          onUndo={noop}
          undoLabel={t('today.toast.undo')}
          onDismiss={noop}
        />
      </Sb>
      <Sb lang={lang} label="Calendar · indiciu la prima folosire">
        <CalendarHint onDismiss={noop} />
      </Sb>
      <Sb lang={lang} label="Listă · goală, cu filtre">
        <ListEmptyFiltered onClear={noop} />
      </Sb>
      <Sb lang={lang} label="Listă · goală de tot">
        <ListEmptyAll onAdd={noop} />
      </Sb>
      <Sb lang={lang} label="Listă · export">
        <Toast
          className={x.full}
          tone="done"
          title={t('states.export.title', { n: 14, day: v('exportDay') })}
          description={t('states.export.file')}
          onDismiss={noop}
        />
      </Sb>
      <Sb lang={lang} label="Listă · anulare în bloc (notificarea pornită)" w={2}>
        <div className={x.dlg}>
          <BulkCancelDialog
            mode="desktop"
            framed
            count={2}
            notifies
            onClose={noop}
            onConfirm={noop}
          />
        </div>
      </Sb>
      <Sb lang={lang} label="Detaliu · anularea unei programări (notificarea oprită)" w={2}>
        <div className={x.dlg}>
          <CancelAppointmentDialog
            mode="desktop"
            framed
            client="Cristina Dobre"
            day={v('cancelDay')}
            time="12:30"
            onClose={noop}
            onConfirm={noop}
          />
        </div>
      </Sb>
      <Sb lang={lang} label="Detaliu · „Nu a venit” și mutare reușită">
        <div className={x.d0}>
          <Button icon="circle-x">{t('action.noShow')}</Button>
          <Toast
            className={x.full}
            tone="done"
            title={t('states.moved', { day: v('moveDay'), time: '11:00' })}
            onUndo={noop}
            undoLabel={t('today.toast.undo')}
            onDismiss={noop}
          />
        </div>
      </Sb>
      <Sb lang={lang} label="Programare nouă · validare">
        <div className={x.d0}>
          <FormField label={t('new.client.label')} required error={t('new.err.client')}>
            <Input isInvalid placeholder={t('new.client.placeholder')} />
          </FormField>
          <FormField label={t('new.start.label')} required error={t('new.err.time')}>
            <SlotPicker
              label={t('new.start.label')}
              slots={[
                { time: '12:30', available: false },
                { time: '13:15', available: true },
                { time: '14:00', available: true },
              ]}
            />
          </FormField>
        </div>
      </Sb>
      <Sb lang={lang} label="Programare nouă · suprapunere">
        <Notice tone="attention" title={t('new.overlap.title', { name: 'Ioana', time: '13:15' })}>
          {t('new.overlap.body')}
        </Notice>
      </Sb>
      <Sb lang={lang} label="Programare nouă · salvată">
        <Toast
          className={x.full}
          tone="done"
          title={t('new.saved.title')}
          description={v('saved')}
          action={{ label: t('new.saved.view'), onClick: noop }}
          onDismiss={noop}
        />
      </Sb>
      <Sb lang={lang} label="Setări · salvate">
        <Toast className={x.full} tone="done" title={t('states.settingsSaved')} onDismiss={noop} />
      </Sb>
      <Sb lang={lang} label="Setări · plecare fără salvare" w={2}>
        <div className={x.dlg}>
          <UnsavedDialog mode="desktop" framed onLeave={noop} onSave={noop} onClose={noop} />
        </div>
      </Sb>
      <Sb lang={lang} label="Limită · după „Anunță proprietarul”">
        <Toast
          className={x.full}
          tone="done"
          title={t('states.limitSent', { name: 'Bianca Petrașcu' })}
          onDismiss={noop}
        />
      </Sb>
      <Sb lang={lang} label="Azi · după „Confirmă”">
        <Toast
          className={x.full}
          tone="done"
          title={t('states.confirmed', { client: 'Cristina Dobre' })}
          onUndo={noop}
          undoLabel={t('today.toast.undo')}
          onDismiss={noop}
        />
      </Sb>
      <Sb lang={lang} label="Azi · peste 5 lucruri">
        <button type="button" className="v-link body-small">
          {t('today.attn.more', { n: 7 })}
        </button>
      </Sb>
      <Sb lang={lang} label="Calendar · „Primul loc liber”">
        <Toast
          className={x.full}
          tone="neutral"
          title={t('states.firstFree', { weekday: v('weekday'), time: '14:30', staff: 'Ioana' })}
          action={{ label: t('states.book'), onClick: noop }}
          onDismiss={noop}
        />
      </Sb>
      <Sb lang={lang} label="Listă · rezultate în alte zile">
        <OtherDaysNotice query="Popescu" count={3} onShow={noop} />
      </Sb>
      <Sb lang={lang} label="Listă · export (cu filtrele active)">
        <Toast
          className={x.full}
          tone="done"
          title={t('states.export.title', { n: 14, day: v('exportDay') })}
          description={t('states.export.file')}
          onDismiss={noop}
        />
      </Sb>
      <Sb lang={lang} label="Detaliu · programare încheiată" w={2}>
        <div className={x.d0}>
          <div className={x.r}>
            <StatusPill tone="done" icon="check">
              {t('status.done')}
            </StatusPill>
            <span className={`body-small ${x.muted}`}>
              {t('states.doneLine', {
                client: 'Ana Popescu',
                service: v('service'),
                time: '09:00',
              })}
            </span>
          </div>
          <div className={x.r}>
            <Button icon="wallet">{t('states.collect')}</Button>
            <Button variant="primary" icon="calendar-check">
              {t('action.rebook')}
            </Button>
          </div>
        </div>
      </Sb>
    </div>
  );
}

function Board({ lang, theme }: { lang: Lang; theme: 'light' | 'dark' }) {
  return (
    <NextIntlClientProvider locale={lang} messages={MESSAGES[lang]} timeZone="Europe/Bucharest">
      <div className={x.stth} data-gallery-frame data-theme={theme} lang={lang}>
        <Grid lang={lang} />
      </div>
    </NextIntlClientProvider>
  );
}

export function BookingStatesGallery() {
  return (
    <div className={`${f.base} ${x.d}`}>
      <p className="heading">EasyBook — stările care lipseau, cu textele aprobate</p>
      <Board lang="ro" theme="light" />
      <Board lang="ro" theme="dark" />
      <p className="heading">Test de lungime — germană și italiană</p>
      <p className={`caption ${x.muted}`}>
        Textele stărilor traduse (germana cu „Sie”, italiana cu „Lei”), ca să verificăm că
        etichetele mai lungi încap
      </p>
      <p className={`caption ${x.muted}`}>Deutsch · Light</p>
      <Board lang="de" theme="light" />
      <p className={`caption ${x.muted}`}>Italiano · Dark</p>
      <Board lang="it" theme="dark" />
    </div>
  );
}
