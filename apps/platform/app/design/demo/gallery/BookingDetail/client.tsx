/* eslint-disable i18next/no-literal-string -- the example data and frame labels of preview.html */
'use client';

import { useState, type ReactNode } from 'react';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import type { DataTableAction } from '@ventora/ui';
import {
  BookingDetailDrawer,
  BookingListView,
  type DetailStatus,
  type ListRow,
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

/* BookingDetail (B.6a) in the gallery: the frames of preview.html, in its order — the drawer over
   the list (Desktop 1280 · Tabletă 820 · Telefon 390, light and dark), „butonul principal urmează
   starea” (în desfășurare: desktop light, phone dark; încheiată: phone light) and the DE / IT label
   test (DE desktop light, IT phone light, IT desktop dark, DE phone dark). The drawer and the list
   are the components of the application (modules/booking/src/ui) with the texts of their keys; the
   pills are the 7 states of BookingStatuses (S116: the screens take these 7). Only the example data
   is fixed here (Salon Aurora, Friday 23 Oct 2026). */

type Lang = 'ro' | 'de' | 'it';
type Theme = 'light' | 'dark';
const MESSAGES: Record<Lang, Record<string, unknown>> = {
  ro: { ...ro, booking: bookingRo },
  de: { ...de, booking: bookingDe },
  it: { ...it, booking: bookingIt },
};

// preview.html LX_MAP / LX_EUR
const LX: Record<string, [string, string]> = {
  'Ana Popescu': ['Anna Schmidt', 'Anna Russo'],
  'Elena Georgescu': ['Elena Hoffmann', 'Elena Ricci'],
  'Andrei Ionescu': ['Andreas Wagner', 'Andrea Marino'],
  'Cristina Dobre': ['Christina Bauer', 'Cristina Greco'],
  'Dan Stoica': ['Daniel Koch', 'Daniele Gallo'],
  'Bianca Marin': ['Bianca Richter', 'Bianca Costa'],
  'Alina Murariu': ['Alina Meyer', 'Alina Barbieri'],
  'Oana Dinu': ['Olivia Braun', 'Olivia Lombardi'],
  'Vlad Cristea': ['Felix Krüger', 'Filippo Caruso'],
  'Ioana Pavel': ['Lena Wolf', 'Chiara Bruno'],
  'Mara Enache': ['Mara Klein', 'Sara Conti'],
  'Radu Matei': ['Jonas Weber', 'Luca Ferri'],
  Ioana: ['Lena', 'Chiara'],
  Mara: ['Mara', 'Sara'],
  Radu: ['Jonas', 'Luca'],
  Vopsit: ['Färben', 'Colore'],
  'Tratament facial': ['Gesichtsbehandlung', 'Trattamento viso'],
  Tuns: ['Haarschnitt', 'Taglio'],
  'Manichiură semipermanentă': ['Semipermanente Maniküre', 'Manicure semipermanente'],
  Manichiură: ['Maniküre', 'Manicure'],
  'Coafat eveniment': ['Event-Frisur', 'Acconciatura per eventi'],
  'Tuns bărbați': ['Herrenhaarschnitt', 'Taglio uomo'],
  'Vopsit rădăcini': ['Ansatzfärbung', 'Ritocco radici'],
};
const lx = (s: string, lang: Lang) => (lang !== 'ro' && LX[s] ? LX[s][lang === 'de' ? 0 : 1] : s);
const EUR: Record<number, number> = {
  350: 70,
  220: 45,
  120: 25,
  140: 30,
  110: 22,
  260: 55,
  70: 15,
  280: 58,
};
const TODAY: Record<Lang, string> = { ro: 'Azi', de: 'Heute', it: 'Oggi' };
const MIN: Record<Lang, string> = { ro: 'min', de: 'Min.', it: 'min' };
const phone = (p: string, lang: Lang) =>
  lang === 'de' ? `0151 ${p.slice(5)}` : lang === 'it' ? `347 ${p.slice(5)}` : p;

// preview.html BK_ROWS (the 5 earlier states become the 7 of BookingStatuses)
type Row = [string, string, string, string, string, string, number, number, DetailStatus];
const ROWS: Row[] = [
  ['1', 'Andrei Ionescu', '0741 123 451', 'Vopsit', 'Ioana', '11:00', 60, 350, 'in_progress'],
  [
    '2',
    'Cristina Dobre',
    '0742 220 118',
    'Tratament facial',
    'Ioana',
    '12:30',
    45,
    220,
    'unconfirmed',
  ],
  ['3', 'Dan Stoica', '0744 551 900', 'Tuns', 'Ioana', '14:30', 45, 120, 'confirmed'],
  [
    '4',
    'Alina Murariu',
    '0723 004 512',
    'Manichiură semipermanentă',
    'Mara',
    '14:00',
    50,
    140,
    'confirmed',
  ],
  ['5', 'Oana Dinu', '0755 300 721', 'Manichiură', 'Mara', '15:00', 50, 110, 'unconfirmed'],
  ['6', 'Bianca Marin', '0740 777 213', 'Coafat eveniment', 'Ioana', '16:00', 60, 260, 'confirmed'],
  ['7', 'Vlad Cristea', '0733 120 004', 'Tuns bărbați', 'Radu', '10:00', 30, 70, 'cancelled'],
  [
    '8',
    'Elena Georgescu',
    '0746 412 980',
    'Vopsit rădăcini',
    'Ioana',
    '10:00',
    60,
    280,
    'completed',
  ],
];
const rowsOf = (lang: Lang): ListRow[] =>
  ROWS.map(([id, client, p, service, staff, time, dur, price, status]) => ({
    id,
    client: lx(client, lang),
    phone: phone(p, lang),
    service: lx(service, lang),
    staff: lx(staff, lang),
    when: `${TODAY[lang]}, ${time}`,
    duration: `${dur} ${MIN[lang]}`,
    price: lang === 'ro' ? `${price} lei` : `${EUR[price]} €`,
    status,
  }));
const STAFF = [
  { id: 'ioana', name: 'Ioana Pavel' },
  { id: 'mara', name: 'Mara Enache' },
  { id: 'radu', name: 'Radu Matei' },
];

function List({ mode, lang, active }: { mode: ScreenMode; lang: Lang; active: string }) {
  const t = useTranslations('booking');
  const actions = (r: ListRow): DataTableAction[] => [
    { label: t('list.actions.open'), icon: 'external-link' },
    r.status === 'unconfirmed'
      ? { label: t('action.confirm'), icon: 'check' }
      : { label: t('list.actions.remind'), icon: 'send' },
    { label: t('action.move'), icon: 'calendar' },
    { label: t('action.noShow'), icon: 'circle-x' },
    { separator: true },
    { label: t('action.cancel'), icon: 'trash-2', destructive: true },
  ];
  return (
    <BookingListView
      mode={mode}
      rows={rowsOf(lang)}
      activeRow={active}
      onRowClick={noop}
      rowActions={actions}
      query=""
      period="today"
      staff={STAFF.map((m) => ({ id: m.id, name: lx(m.name, lang) }))}
      staffFilter="all"
      state="active"
      filterCount={2}
    />
  );
}

// preview.html BookingDetailBody / Detail_L / BD_STATES: the drawer's example content
type Example = {
  title: string;
  sub: string;
  status: DetailStatus;
  badge?: boolean;
  kv: [string, string, string, string];
  notice?: { title: string; body: string; tone: 'attention' | 'neutral' };
  buttons?: boolean;
  note: string;
  history: [string, string][];
};
const EX: Record<'main' | 'now' | 'done', Record<Lang, Example>> = {
  main: {
    ro: {
      title: 'Cristina Dobre',
      sub: 'Tratament facial · Vin, 23 oct., 12:30',
      status: 'unconfirmed',
      badge: true,
      kv: [
        'Vineri, 23 octombrie · 12:30–13:15',
        'Tratament facial · 45 min · 220 lei',
        'Ioana Pavel',
        'Cristina Dobre · 0742 220 118 · a 6-a vizită',
      ],
      notice: { title: '', body: 'ieri la 12:30', tone: 'attention' },
      buttons: true,
      note: 'Ten sensibil — fără produse cu parfum.',
      history: [
        ['22 oct., 12:30', 'Reamintire trimisă prin SMS'],
        ['16 oct., 09:12', 'Ioana Pavel a mutat-o de la 11:00 la 12:30'],
        ['15 oct., 18:04', 'Rezervată din pagina de rezervări'],
      ],
    },
    de: {
      title: 'Christina Bauer',
      sub: 'Gesichtsbehandlung · Fr., 23. Okt., 12:30',
      status: 'unconfirmed',
      badge: true,
      kv: [
        'Freitag, 23. Oktober · 12:30–13:15',
        'Gesichtsbehandlung · 45 Min. · 45 €',
        'Lena Wolf',
        'Christina Bauer · 0151 220 118 · 6. Besuch',
      ],
      notice: { title: '', body: 'gestern um 12:30', tone: 'attention' },
      buttons: true,
      note: 'Empfindliche Haut – keine parfümierten Produkte.',
      history: [
        ['22. Okt., 12:30', 'Erinnerung per SMS gesendet'],
        ['16. Okt., 09:12', 'Lena Wolf hat den Termin von 11:00 auf 12:30 verschoben'],
        ['15. Okt., 18:04', 'Über die Buchungsseite gebucht'],
      ],
    },
    it: {
      title: 'Cristina Greco',
      sub: 'Trattamento viso · ven 23 ott., 12:30',
      status: 'unconfirmed',
      badge: true,
      kv: [
        'Venerdì 23 ottobre · 12:30–13:15',
        'Trattamento viso · 45 min · 45 €',
        'Chiara Bruno',
        'Cristina Greco · 347 220 118 · 6ª visita',
      ],
      notice: { title: '', body: 'ieri alle 12:30', tone: 'attention' },
      buttons: true,
      note: 'Pelle sensibile: niente prodotti profumati.',
      history: [
        ['22 ott., 12:30', 'Promemoria inviato via SMS'],
        ['16 ott., 09:12', 'Chiara Bruno l’ha spostato dalle 11:00 alle 12:30'],
        ['15 ott., 18:04', 'Prenotato dalla pagina di prenotazione'],
      ],
    },
  },
  now: {
    ro: {
      title: 'Andrei Ionescu',
      sub: 'Vopsit · Azi, 11:00',
      status: 'in_progress',
      kv: [
        'Vineri, 23 octombrie · 11:00–12:00',
        'Vopsit · 60 min · 350 lei',
        'Ioana Pavel',
        'Andrei Ionescu · 0741 123 451 · a 3-a vizită',
      ],
      note: 'Preferă nuanța 7.1, ca data trecută.',
      history: [
        ['Azi, 10:58', 'Ioana Pavel a început programarea'],
        ['22 oct., 11:00', 'Clientul a confirmat prin SMS'],
        ['21 oct., 11:00', 'Reamintire trimisă prin SMS'],
      ],
    },
    de: {} as Example,
    it: {} as Example,
  },
  done: {
    ro: {
      title: 'Elena Georgescu',
      sub: 'Vopsit rădăcini · Azi, 10:00',
      status: 'completed',
      kv: [
        'Vineri, 23 octombrie · 10:00–11:00',
        'Vopsit rădăcini · 60 min · 280 lei',
        'Ioana Pavel',
        'Elena Georgescu · 0746 412 980 · a 12-a vizită',
      ],
      notice: { title: 'rebook', body: '', tone: 'neutral' },
      note: 'Revine de obicei după șase săptămâni.',
      history: [
        ['Azi, 11:04', 'Încasat 280 lei, cu cardul'],
        ['Azi, 10:02', 'Ioana Pavel a început programarea'],
        ['22 oct., 10:00', 'Reamintire trimisă prin SMS'],
      ],
    },
    de: {} as Example,
    it: {} as Example,
  },
};

function Detail({
  mode,
  lang,
  state,
}: {
  mode: ScreenMode;
  lang: Lang;
  state: 'main' | 'now' | 'done';
}) {
  const t = useTranslations('booking');
  const d = EX[state][lang];
  const [note, setNote] = useState(d.note);
  const footer =
    state === 'main'
      ? [
          { id: 'move', label: t('action.move'), icon: 'calendar' as const, onPress: noop },
          {
            id: 'confirm',
            label: t('action.confirm'),
            icon: 'check' as const,
            primary: true,
            onPress: noop,
          },
        ]
      : state === 'now'
        ? [
            { id: 'move', label: t('action.move'), icon: 'calendar' as const, onPress: noop },
            {
              id: 'collect',
              label: t('action.collect', { amount: '350 lei' }),
              icon: 'wallet' as const,
              primary: true,
              onPress: noop,
            },
          ]
        : [
            { id: 'move', label: t('action.move'), icon: 'calendar' as const, onPress: noop },
            {
              id: 'rebook',
              label: t('action.rebook'),
              icon: 'calendar-check' as const,
              primary: true,
              onPress: noop,
            },
          ];
  return (
    <BookingDetailDrawer
      mode={mode}
      title={d.title}
      subtitle={d.sub}
      status={d.status}
      badge={d.badge ? t('detail.online') : null}
      rows={[
        [t('detail.kv.when'), d.kv[0]],
        [t('detail.kv.service'), d.kv[1]],
        [t('detail.kv.staff'), d.kv[2]],
        [t('detail.kv.client'), d.kv[3]],
      ]}
      notice={
        d.notice
          ? d.notice.title === 'rebook'
            ? { tone: 'neutral', title: t('detail.rebook.title'), body: t('detail.rebook.body') }
            : {
                tone: 'attention',
                title: t('detail.unconfirmed.title'),
                body: t('detail.unconfirmed.reminded', { when: d.notice.body }),
              }
          : null
      }
      noticeButtons={
        d.buttons
          ? [
              {
                id: 'resend',
                label: t('detail.resend'),
                icon: 'send',
                primary: true,
                onPress: noop,
              },
              { id: 'call', label: t('detail.call'), icon: 'phone', onPress: noop },
            ]
          : undefined
      }
      note={{ value: note, onChange: setNote }}
      history={d.history}
      historyMore={{ label: t('detail.historyAll'), onPress: noop }}
      footer={footer}
      menu={[
        { id: 'move', label: t('action.move'), icon: 'calendar' },
        { id: 'duplicate', label: t('detail.duplicate'), icon: 'copy' },
        {
          id: 'cancel',
          label: t('action.cancel'),
          icon: 'trash-2',
          destructive: true,
          separatorBefore: true,
        },
      ]}
      onMenu={noop}
      onClose={noop}
    />
  );
}

function Shell({ lang, children }: { lang: Lang; children: ReactNode }) {
  const title = lang === 'ro' ? 'Programări' : lang === 'de' ? 'Termine' : 'Appuntamenti';
  if (lang === 'ro') {
    return (
      <RoApp active="programari" title={title}>
        {children}
      </RoApp>
    );
  }
  return (
    <LxApp lang={lang} active="programari" title={title}>
      {children}
    </LxApp>
  );
}

const ACTIVE = { main: '2', now: '1', done: '8' } as const;

function Screen({
  mode,
  lang,
  state,
}: {
  mode: ScreenMode;
  lang: Lang;
  state: 'main' | 'now' | 'done';
}) {
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <Shell lang={lang}>
        <List mode={mode} lang={lang} active={ACTIVE[state]} />
      </Shell>
      <Detail mode={mode} lang={lang} state={state} />
    </div>
  );
}

/* ── the frames ─────────────────────────────────────────────────────────────────────────── */

const WIDTH: Record<ScreenMode, number> = { desktop: 1280, tablet: 820, mobile: 390 };
const SIZE_LABEL: Record<ScreenMode, string> = {
  desktop: 'Desktop · 1280',
  tablet: 'Tabletă portret · 820',
  mobile: 'Telefon · 390',
};
// preview.html Screens: desktopH 900, tabletH 1100, mobileH 1000
const HEIGHT: Record<ScreenMode, number> = { desktop: 900, tablet: 1100, mobile: 1000 };

function Frame({
  lang,
  mode,
  theme,
  state = 'main',
  height,
  label,
}: {
  lang: Lang;
  mode: ScreenMode;
  theme: Theme;
  state?: 'main' | 'now' | 'done';
  height?: number;
  label?: string;
}) {
  return (
    <div>
      <p className={`caption ${f.scrLab}`}>
        {label ?? ''}
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
            height: height ?? HEIGHT[mode],
            position: 'relative',
            overflow: 'hidden',
            ...(mode === 'desktop' ? {} : { borderRadius: 'var(--radius-xl)' }),
          }}
        >
          <Screen mode={mode} lang={lang} state={state} />
        </div>
      </NextIntlClientProvider>
    </div>
  );
}

export function BookingDetailGallery() {
  return (
    <div className={f.base}>
      <div className={f.scrWrap}>
        <p className="heading">EasyBook — Detaliul unei programări în drawer, peste listă</p>
        {(['light', 'dark'] as const).map((th) => (
          <div className={f.scrRow} key={th}>
            {(['desktop', 'tablet', 'mobile'] as const).map((m) => (
              <Frame key={m} lang="ro" mode={m} theme={th} />
            ))}
          </div>
        ))}
        <p className="heading">Stări: butonul principal urmează starea programării</p>
        <div className={f.scrRow}>
          <Frame
            lang="ro"
            mode="desktop"
            theme="light"
            state="now"
            height={900}
            label="În desfășurare · "
          />
          <Frame
            lang="ro"
            mode="mobile"
            theme="dark"
            state="now"
            height={900}
            label="În desfășurare · "
          />
          <Frame
            lang="ro"
            mode="mobile"
            theme="light"
            state="done"
            height={900}
            label="Încheiată · "
          />
        </div>
        <p className="heading">DE / IT — test de lungime a textelor: detaliul unei programări</p>
        <div className={f.scrRow}>
          <Frame lang="de" mode="desktop" theme="light" label="Deutsch · " />
          <Frame lang="it" mode="mobile" theme="light" label="Italiano · " />
        </div>
        <div className={f.scrRow}>
          <Frame lang="it" mode="desktop" theme="dark" label="Italiano · " />
          <Frame lang="de" mode="mobile" theme="dark" label="Deutsch · " />
        </div>
      </div>
    </div>
  );
}
