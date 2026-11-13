/* eslint-disable i18next/no-literal-string -- the example data and frame labels of preview.html */
'use client';

import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { type ScheduleColumn, type ScheduleEvent } from '@ventora/ui';
import {
  BookingCalendarView,
  useCalendarTexts,
  type CalendarView,
  type ScreenMode,
} from '@ventora/booking/ui';
import ro from '@ventora/i18n/messages/ro.json';
import de from '@ventora/i18n/messages/de.json';
import it from '@ventora/i18n/messages/it.json';
import bookingRo from '@ventora/booking/messages/ro.json';
import bookingDe from '@ventora/booking/messages/de.json';
import bookingIt from '@ventora/booking/messages/it.json';
import { noop } from '../_shared/shell';
import { LxApp, RoApp } from '../_shared/easybook-shell';
import f from '../_shared/frames.module.css';

/* BookingCalendar (B.6a) in the gallery: the frames of preview.html, in its order — the screens
   (Desktop 1280 · Tabletă 820 · Telefon 390; light: resources / day with the member picker / day,
   dark: week / resources / day), „Primul loc liber” (desktop light, phone dark) and the DE / IT label
   test (DE desktop light: resources, IT phone light: day, IT desktop dark: week, DE phone dark: day).
   The calendar is the component of the application (modules/booking/src/ui) with the texts of its
   keys; only the example data is fixed here (Salon Aurora, Friday 23 Oct 2026, 11:20). */

type Lang = 'ro' | 'de' | 'it';
const MESSAGES: Record<Lang, Record<string, unknown>> = {
  ro: { ...ro, booking: bookingRo },
  de: { ...de, booking: bookingDe },
  it: { ...it, booking: bookingIt },
};

const DAY = '2026-10-23';
const NOW = '11:20';

// preview.html BK_STAFF, BK_EVENTS
const STAFF = [
  { id: 'ioana', label: 'Ioana Pavel', sub: 'Coafor' },
  { id: 'mara', label: 'Mara Enache', sub: 'Manichiură' },
  { id: 'radu', label: 'Radu Matei', sub: 'Frizerie' },
];
const RES: Record<Lang, Record<string, string>> = {
  ro: { Coafor: 'Post coafor 1', Manichiură: 'Masă manichiură', Frizerie: 'Post frizerie' },
  de: { Coafor: 'Friseurplatz 1', Manichiură: 'Maniküretisch', Frizerie: 'Barbierplatz' },
  it: {
    Coafor: 'Postazione parrucchiere 1',
    Manichiură: 'Tavolo manicure',
    Frizerie: 'Postazione barbiere',
  },
};
const EVENTS: ScheduleEvent[] = [
  {
    id: 'e1',
    col: 'ioana',
    start: '09:00',
    end: '09:45',
    title: 'Ana Popescu',
    subtitle: 'Tuns',
    status: 'done',
  },
  {
    id: 'e2',
    col: 'ioana',
    start: '10:00',
    end: '11:00',
    title: 'Elena Georgescu',
    subtitle: 'Vopsit rădăcini',
    status: 'done',
  },
  {
    id: 'e3',
    col: 'ioana',
    start: '11:00',
    end: '12:00',
    title: 'Andrei Ionescu',
    subtitle: 'Vopsit',
    status: 'now',
  },
  {
    id: 'e4',
    col: 'ioana',
    start: '12:30',
    end: '13:15',
    title: 'Cristina Dobre',
    subtitle: 'Tratament facial',
    status: 'unconfirmed',
  },
  {
    id: 'e5',
    col: 'ioana',
    start: '14:30',
    end: '15:15',
    title: 'Dan Stoica',
    subtitle: 'Tuns',
    status: 'confirmed',
  },
  {
    id: 'e6',
    col: 'ioana',
    start: '16:00',
    end: '17:00',
    title: 'Bianca Marin',
    subtitle: 'Coafat eveniment',
    status: 'confirmed',
  },
  {
    id: 'm1',
    col: 'mara',
    start: '09:30',
    end: '10:20',
    title: 'Ioana Radu',
    subtitle: 'Manichiură',
    status: 'done',
  },
  {
    id: 'm2',
    col: 'mara',
    start: '10:45',
    end: '11:45',
    title: 'Sorina Vlad',
    subtitle: 'Pedichiură',
    status: 'now',
  },
  {
    id: 'm3',
    col: 'mara',
    start: '13:00',
    end: '14:00',
    title: 'Pauză de prânz',
    status: 'blocked',
  },
  {
    id: 'm4',
    col: 'mara',
    start: '14:00',
    end: '14:50',
    title: 'Alina Murariu',
    subtitle: 'Manichiură semipermanentă',
    status: 'confirmed',
  },
  {
    id: 'm5',
    col: 'mara',
    start: '15:00',
    end: '15:50',
    title: 'Oana Dinu',
    subtitle: 'Manichiură',
    status: 'unconfirmed',
  },
  {
    id: 'r1',
    col: 'radu',
    start: '09:00',
    end: '09:30',
    title: 'Mihai Tudose',
    subtitle: 'Tuns bărbați',
    status: 'done',
  },
  {
    id: 'r2',
    col: 'radu',
    start: '10:00',
    end: '10:30',
    title: 'Vlad Cristea',
    subtitle: 'Tuns bărbați',
    status: 'cancelled',
  },
  {
    id: 'r3',
    col: 'radu',
    start: '11:30',
    end: '12:00',
    title: 'Sergiu Pop',
    subtitle: 'Tuns + barbă',
    status: 'confirmed',
  },
  {
    id: 'r4',
    col: 'radu',
    start: '17:00',
    end: '17:30',
    title: 'Paul Stan',
    subtitle: 'Tuns bărbați',
    status: 'confirmed',
  },
];

// preview.html BK_DAYS, BK_WEEK
const WEEK_IDS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEK: ScheduleEvent[] = (() => {
  const base: [string, string, ScheduleEvent['status']][] = [
    ['09:00', '09:45', 'done'],
    ['10:00', '11:00', 'done'],
    ['11:30', '12:15', 'confirmed'],
    ['13:00', '14:00', 'confirmed'],
    ['14:30', '15:15', 'confirmed'],
    ['16:00', '17:00', 'unconfirmed'],
  ];
  const names = [
    'Ana P.',
    'Elena G.',
    'Andrei I.',
    'Cristina D.',
    'Dan S.',
    'Bianca M.',
    'Sorina V.',
    'Oana D.',
    'Paul S.',
    'Mihai T.',
  ];
  const services = ['Tuns', 'Vopsit', 'Manichiură', 'Tratament facial'];
  const out: ScheduleEvent[] = [];
  let k = 0;
  ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'].forEach((d, di) =>
    base.forEach(([s, e, st], i) => {
      if ((i + di) % 3 === 2 && d !== 'fri') return;
      out.push({
        id: d + i,
        col: d,
        start: s,
        end: e,
        title: names[k++ % names.length]!,
        subtitle: services[(i + di) % 4],
        status: d === 'fri' ? (i < 2 ? 'done' : i === 2 ? 'now' : st) : di < 4 ? 'done' : st,
      });
    }),
  );
  return out;
})();

// preview.html LX_MAP (the DE / IT names of the example data)
const LX: Record<string, [string, string]> = {
  'Ana Popescu': ['Anna Schmidt', 'Anna Russo'],
  'Elena Georgescu': ['Elena Hoffmann', 'Elena Ricci'],
  'Andrei Ionescu': ['Andreas Wagner', 'Andrea Marino'],
  'Cristina Dobre': ['Christina Bauer', 'Cristina Greco'],
  'Dan Stoica': ['Daniel Koch', 'Daniele Gallo'],
  'Bianca Marin': ['Bianca Richter', 'Bianca Costa'],
  'Ioana Radu': ['Ines Lange', 'Irene Fontana'],
  'Sorina Vlad': ['Sophie Vogel', 'Sofia Moretti'],
  'Alina Murariu': ['Alina Meyer', 'Alina Barbieri'],
  'Oana Dinu': ['Olivia Braun', 'Olivia Lombardi'],
  'Mihai Tudose': ['Michael Hahn', 'Michele Rinaldi'],
  'Vlad Cristea': ['Felix Krüger', 'Filippo Caruso'],
  'Sergiu Pop': ['Sebastian Fuchs', 'Sergio Ferrara'],
  'Paul Stan': ['Paul Schulz', 'Paolo Mancini'],
  'Ana P.': ['Anna S.', 'Anna R.'],
  'Elena G.': ['Elena H.', 'Elena R.'],
  'Andrei I.': ['Andreas W.', 'Andrea M.'],
  'Cristina D.': ['Christina B.', 'Cristina G.'],
  'Dan S.': ['Daniel K.', 'Daniele G.'],
  'Bianca M.': ['Bianca R.', 'Bianca C.'],
  'Sorina V.': ['Sophie V.', 'Sofia M.'],
  'Oana D.': ['Olivia B.', 'Olivia L.'],
  'Paul S.': ['Paul S.', 'Paolo M.'],
  'Mihai T.': ['Michael H.', 'Michele R.'],
  'Ioana Pavel': ['Lena Wolf', 'Chiara Bruno'],
  'Mara Enache': ['Mara Klein', 'Sara Conti'],
  'Radu Matei': ['Jonas Weber', 'Luca Ferri'],
  Coafor: ['Friseurin', 'Parrucchiera'],
  Manichiură: ['Maniküre', 'Manicure'],
  Frizerie: ['Barbier', 'Barbiere'],
  Vopsit: ['Färben', 'Colore'],
  'Tratament facial': ['Gesichtsbehandlung', 'Trattamento viso'],
  Tuns: ['Haarschnitt', 'Taglio'],
  'Manichiură semipermanentă': ['Semipermanente Maniküre', 'Manicure semipermanente'],
  'Coafat eveniment': ['Event-Frisur', 'Acconciatura per eventi'],
  'Tuns bărbați': ['Herrenhaarschnitt', 'Taglio uomo'],
  'Vopsit rădăcini': ['Ansatzfärbung', 'Ritocco radici'],
  Pedichiură: ['Pediküre', 'Pedicure'],
  'Tuns + barbă': ['Haarschnitt + Bart', 'Taglio + barba'],
  'Pauză de prânz': ['Mittagspause', 'Pausa pranzo'],
};
const lx = (s: string | undefined, lang: Lang) =>
  s && lang !== 'ro' && LX[s] ? LX[s][lang === 'de' ? 0 : 1] : s;
const localize = (events: ScheduleEvent[], lang: Lang) =>
  events.map((e) => ({ ...e, title: lx(e.title, lang)!, subtitle: lx(e.subtitle, lang) }));

/* ── the calendar of one frame ──────────────────────────────────────────────────────────── */

function Calendar({ mode, view, lang }: { mode: ScreenMode; view: CalendarView; lang: Lang }) {
  const c = useCalendarTexts();
  const staff = STAFF.map((p) => ({ ...p, label: lx(p.label, lang)!, sub: lx(p.sub, lang)! }));
  const h = mode === 'desktop' ? 700 : mode === 'tablet' ? 980 : 1000;
  let columns: ScheduleColumn[];
  let events = localize(EVENTS, lang);
  let height = h;
  let minColumnWidth: number | undefined;
  if (view === 'week') {
    columns = WEEK_IDS.map((id, i) => ({
      id,
      label: c.dayColumnLabel(`2026-10-${19 + i}`),
      today: id === 'fri',
      closed: id === 'sun' ? c.t('closedDay') : undefined,
    }));
    events = localize(WEEK, lang);
    minColumnWidth = mode === 'desktop' ? 120 : 100;
  } else if (view === 'res') {
    columns = staff.map((p, i) => ({ id: p.id, label: RES[lang][STAFF[i]!.sub]!, sub: p.label }));
  } else {
    columns = [
      {
        id: 'ioana',
        label: staff[0]!.label,
        sub: c.daySub(staff[0]!.sub, 6),
        person: staff[0]!.label,
      },
    ];
    height = h - 60;
    minColumnWidth = 200;
  }
  return (
    <BookingCalendarView
      mode={mode}
      view={view}
      date={DAY}
      description={c.summary({
        appointments: 14,
        staff: 3,
        isToday: true,
        open: { from: '09:00', to: '19:00' },
      })}
      columns={columns}
      events={events}
      from={8}
      to={19}
      now={NOW}
      nowColumn={view === 'week' ? 'fri' : undefined}
      height={height}
      minColumnWidth={minColumnWidth}
      activeId={view === 'res' ? 'e4' : undefined}
      staffOptions={staff.map((p) => ({ value: p.id, label: p.label, description: p.sub }))}
      staffId="ioana"
      onFirstFree={noop}
      onEventClick={noop}
      onSlotClick={view === 'res' ? noop : undefined}
    />
  );
}

/* „Primul loc liber” found the next free time (README; preview.html CalFirstFree) */
const FF_EVENTS: ScheduleEvent[] = [
  {
    id: 'f1',
    col: 'ioana',
    start: '09:00',
    end: '10:00',
    title: 'Ana Popescu',
    subtitle: 'Vopsit',
    status: 'confirmed',
  },
  {
    id: 'f2',
    col: 'ioana',
    start: '10:30',
    end: '12:30',
    title: 'Bianca Marin',
    subtitle: 'Coafat eveniment',
    status: 'confirmed',
  },
  {
    id: 'f3',
    col: 'ioana',
    start: '12:30',
    end: '14:15',
    title: 'Ștefania Toma',
    subtitle: 'Balayage',
    status: 'unconfirmed',
  },
  {
    id: 'f7',
    col: 'ioana',
    start: '15:15',
    end: '16:30',
    title: 'Oana Dinu',
    subtitle: 'Tuns',
    status: 'confirmed',
  },
  {
    id: 'f4',
    col: 'mara',
    start: '09:00',
    end: '12:00',
    title: 'Alina Murariu',
    subtitle: 'Manichiură semipermanentă',
    status: 'confirmed',
  },
  { id: 'f5', col: 'mara', start: '12:00', end: '18:00', title: 'Concediu', status: 'blocked' },
  { id: 'f6', col: 'radu', start: '09:00', end: '18:00', title: 'Zi liberă', status: 'blocked' },
];

function FirstFree({ mode }: { mode: ScreenMode }) {
  const c = useCalendarTexts();
  const thursday = '2026-10-29';
  const weekday = c.weekdayInText(thursday);
  const mobile = mode === 'mobile';
  return (
    <BookingCalendarView
      mode={mode}
      view={mobile ? 'day' : 'res'}
      date={thursday}
      description={c.t('ff.desc', { service: 'Tratament facial' })}
      columns={
        mobile
          ? [{ id: 'ioana', label: 'Ioana Pavel', sub: 'Coafor', person: 'Ioana Pavel' }]
          : STAFF.map((p) => ({ id: p.id, label: RES.ro[p.sub]!, sub: p.label }))
      }
      events={FF_EVENTS}
      from={8}
      to={19}
      height={mobile ? 760 : 470}
      minColumnWidth={mobile ? 200 : undefined}
      firstFree={{
        title: c.t('ff.found', { weekday, time: '14:30', staff: 'Ioana' }),
        body: `${c.t('ff.for', { service: 'Tratament facial', minutes: 45 })} ${c.t(
          'ff.othersBusy',
          {
            names: c.names(['Mara', 'Radu']),
            weekday,
          },
        )}`,
        onBook: noop,
        onSearchMore: noop,
      }}
      onEventClick={noop}
      onSlotClick={noop}
    />
  );
}

/* ── the shells ─────────────────────────────────────────────────────────────────────────── */

/* ── the frames ─────────────────────────────────────────────────────────────────────────── */

type Theme = 'light' | 'dark';
const WIDTH: Record<ScreenMode, number> = { desktop: 1280, tablet: 820, mobile: 390 };
const SIZE_LABEL: Record<ScreenMode, string> = {
  desktop: 'Desktop · 1280',
  tablet: 'Tabletă portret · 820',
  mobile: 'Telefon · 390',
};

function Frame({
  lang,
  mode,
  theme,
  height,
  label,
  children,
}: {
  lang: Lang;
  mode: ScreenMode;
  theme: Theme;
  height: number;
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className={`caption ${f.scrLab}`}>
        {label}
        {SIZE_LABEL[mode]} · {theme === 'light' ? 'Light' : 'Dark'}
      </p>
      <NextIntlClientProvider locale={lang} messages={MESSAGES[lang]} timeZone="Europe/Bucharest">
        <div
          className={`${f.scr} ${f.scrD}`}
          data-gallery-frame
          data-theme={theme}
          lang={lang}
          style={{
            width: WIDTH[mode],
            height,
            position: 'relative',
            overflow: 'hidden',
            ...(mode === 'desktop' ? {} : { borderRadius: 'var(--radius-xl)' }),
          }}
        >
          {children}
        </div>
      </NextIntlClientProvider>
    </div>
  );
}

// preview.html Screens: desktop light resources / dark week, tablet light day / dark resources, phone day
const viewOf = (mode: ScreenMode, theme: Theme): CalendarView =>
  mode === 'desktop'
    ? theme === 'light'
      ? 'res'
      : 'week'
    : mode === 'tablet'
      ? theme === 'light'
        ? 'day'
        : 'res'
      : 'day';
const SCREEN_H: Record<ScreenMode, number> = { desktop: 960, tablet: 1240, mobile: 1240 };

function Board() {
  return (
    <div className={f.scrWrap}>
      <p className="heading">EasyBook — Calendar: zi, săptămână, resurse</p>
      {(['light', 'dark'] as const).map((th) => (
        <div className={f.scrRow} key={th}>
          {(['desktop', 'tablet', 'mobile'] as const).map((m) => (
            <Frame key={m} lang="ro" mode={m} theme={th} height={SCREEN_H[m]} label="">
              <RoApp active="calendar" title="Calendar">
                <Calendar mode={m} view={viewOf(m, th)} lang="ro" />
              </RoApp>
            </Frame>
          ))}
        </div>
      ))}

      <p className="heading">Stare: „Primul loc liber” a găsit următoarea oră liberă</p>
      <div className={f.scrRow}>
        <Frame lang="ro" mode="desktop" theme="light" height={860} label="Română · ">
          <RoApp active="calendar" title="Calendar">
            <FirstFree mode="desktop" />
          </RoApp>
        </Frame>
        <Frame lang="ro" mode="mobile" theme="dark" height={1180} label="Română · ">
          <RoApp active="calendar" title="Calendar">
            <FirstFree mode="mobile" />
          </RoApp>
        </Frame>
      </div>

      <p className="heading">DE / IT — test de lungime a textelor: calendarul</p>
      {(
        [
          [
            ['de', 'desktop', 'light'],
            ['it', 'mobile', 'light'],
          ],
          [
            ['it', 'desktop', 'dark'],
            ['de', 'mobile', 'dark'],
          ],
        ] as const
      ).map((row, ri) => (
        <div className={f.scrRow} key={ri}>
          {row.map(([lang, m, th]) => (
            <Frame
              key={lang + m}
              lang={lang}
              mode={m}
              theme={th}
              height={m === 'desktop' ? 960 : 1240}
              label={`${lang === 'de' ? 'Deutsch' : 'Italiano'} · `}
            >
              <LxCalendar lang={lang} mode={m} theme={th} />
            </Frame>
          ))}
        </div>
      ))}
    </div>
  );
}

function LxCalendar({ lang, mode, theme }: { lang: 'de' | 'it'; mode: ScreenMode; theme: Theme }) {
  const c = useCalendarTexts();
  return (
    <LxApp lang={lang} active="calendar" title={c.t('title')}>
      <LxView
        lang={lang}
        mode={mode}
        view={mode === 'desktop' ? (theme === 'light' ? 'res' : 'week') : 'day'}
      />
    </LxApp>
  );
}

/* Cal_L: the same calendar, with the label test's heights (desktop 700, phone 1000) */
function LxView({ lang, mode, view }: { lang: Lang; mode: ScreenMode; view: CalendarView }) {
  return <Calendar mode={mode} view={view} lang={lang} />;
}

export function BookingCalendarGallery() {
  return (
    <div className={f.base}>
      <Board />
    </div>
  );
}
