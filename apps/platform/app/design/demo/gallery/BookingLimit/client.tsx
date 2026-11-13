/* eslint-disable i18next/no-literal-string -- the example data and frame labels of preview.html */
'use client';

import type { ReactNode } from 'react';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import type { DataTableAction } from '@ventora/ui';
import {
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
import { LimitDialog } from '@/screens/plan/LimitDialog';
import { noop } from '../_shared/shell';
import { LxApp, RoApp } from '../_shared/easybook-shell';
import f from '../_shared/frames.module.css';
import x from './limit.module.css';

/* BookingLimit (B.6c) in the gallery: the frames of preview.html, in its order — the limit reached
   while creating an appointment, over the list (Desktop 1280 · Tabletă 820 · Telefon 390; light:
   the owner chooses the pack or asks for another plan; dark: a member sees the options and who
   decides), then the DE / IT label test. The dialog is the application's LimitDialog (the shared
   UpgradeDialog), the list the module's BookingListView; only the example data (the catalog's pack
   and plan, Salon Aurora, October) is fixed here. */

type Lang = 'ro' | 'de' | 'it';
type Theme = 'light' | 'dark';
const MESSAGES: Record<Lang, Record<string, unknown>> = {
  ro: { ...ro, booking: bookingRo },
  de: { ...de, booking: bookingDe },
  it: { ...it, booking: bookingIt },
};

// preview.html LX_MAP / LX_EUR (the first 5 rows of BK_ROWS)
const LX: Record<string, [string, string]> = {
  'Andrei Ionescu': ['Andreas Wagner', 'Andrea Marino'],
  'Cristina Dobre': ['Christina Bauer', 'Cristina Greco'],
  'Dan Stoica': ['Daniel Koch', 'Daniele Gallo'],
  'Alina Murariu': ['Alina Meyer', 'Alina Barbieri'],
  'Oana Dinu': ['Olivia Braun', 'Olivia Lombardi'],
  Ioana: ['Lena', 'Chiara'],
  Mara: ['Mara', 'Sara'],
  Vopsit: ['Färben', 'Colore'],
  'Tratament facial': ['Gesichtsbehandlung', 'Trattamento viso'],
  Tuns: ['Haarschnitt', 'Taglio'],
  'Manichiură semipermanentă': ['Semipermanente Maniküre', 'Manicure semipermanente'],
  Manichiură: ['Maniküre', 'Manicure'],
};
const lx = (s: string, lang: Lang) => (lang !== 'ro' && LX[s] ? LX[s][lang === 'de' ? 0 : 1] : s);
const EUR: Record<number, number> = { 350: 70, 220: 45, 120: 25, 140: 30, 110: 22 };
const TODAY: Record<Lang, string> = { ro: 'Azi', de: 'Heute', it: 'Oggi' };
const MIN: Record<Lang, string> = { ro: 'min', de: 'Min.', it: 'min' };
const phone = (p: string, lang: Lang) =>
  lang === 'de' ? `0151 ${p.slice(5)}` : lang === 'it' ? `347 ${p.slice(5)}` : p;

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

// preview.html Limit / LX.*.limit: the catalog's pack and plan, the decider, the month
const OFFER: Record<
  Lang,
  {
    decider: string;
    usage: string;
    month: string;
    pack: { title: string; price: string; includes: string[] };
    plan: { title: string; price: string; includes: string[] };
  }
> = {
  ro: {
    decider: 'Bianca Petrașcu (proprietar)',
    usage: 'Programări în octombrie',
    month: 'octombrie',
    pack: {
      title: 'Pachet de 200 de programări',
      price: '39 lei · doar pentru octombrie · fără cost de implementare',
      includes: ['Intră imediat; programarea începută se salvează'],
    },
    plan: {
      title: 'Abonamentul Business Plus',
      price: '449 lei pe lună în loc de 349 · fără cost de implementare',
      includes: ['Programări nelimitate', '3.000 SMS pe lună'],
    },
  },
  de: {
    decider: 'Julia Becker (Inhaber)',
    usage: 'Termine im Oktober',
    month: 'Oktober',
    pack: {
      title: 'Zusatzpaket · 200 Termine',
      price: '8 € · nur für Oktober · keine Einrichtungsgebühr',
      includes: ['Sofort aktiv; der begonnene Termin wird gespeichert'],
    },
    plan: {
      title: 'Abonnement Business Plus',
      price: '89 € pro Monat statt 69 € · keine Einrichtungsgebühr',
      includes: ['Unbegrenzte Termine', '3.000 SMS pro Monat'],
    },
  },
  it: {
    decider: 'Giulia Romano (titolare)',
    usage: 'Appuntamenti a ottobre',
    month: 'ottobre',
    pack: {
      title: 'Pacchetto extra · 200 appuntamenti',
      price: '8 € · solo per ottobre · nessun costo di attivazione',
      includes: ['Attivo subito; l’appuntamento iniziato viene salvato'],
    },
    plan: {
      title: 'Abbonamento Business Plus',
      price: '89 € al mese invece di 69 € · nessun costo di attivazione',
      includes: ['Appuntamenti illimitati', '3.000 SMS al mese'],
    },
  },
};

function Screen({ mode, lang, theme }: { mode: ScreenMode; lang: Lang; theme: Theme }) {
  const t = useTranslations('booking');
  const o = OFFER[lang];
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
  const title = lang === 'ro' ? 'Programări' : lang === 'de' ? 'Termine' : 'Appuntamenti';
  const list = (
    <BookingListView
      mode={mode}
      rows={rowsOf(lang)}
      rowActions={actions}
      filters={false}
      onNew={noop}
      query=""
      period="today"
      staff={[]}
      staffFilter="all"
      state="active"
    />
  );
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      {lang === 'ro' ? (
        <RoApp active="programari" title={title} meter={false}>
          {list}
        </RoApp>
      ) : (
        <LxApp lang={lang} active="programari" title={title} meter={false}>
          {list}
        </LxApp>
      )}
      <div className={`${x.modal} ${mode === 'mobile' ? x.mobile : ''}`}>
        <LimitDialog
          open
          inline
          sheet={mode === 'mobile'}
          title={t('limit.title', { month: o.month })}
          description={t('limit.desc')}
          usage={{ label: o.usage, used: 1000, limit: 1000 }}
          packs={[{ id: 'pack', ...o.pack }]}
          plan={o.plan}
          owner={theme === 'light'}
          ownerName={o.decider}
          onBuy={noop}
          onPlan={noop}
          onRecommend={() => Promise.resolve(true)}
          onClose={noop}
        />
      </div>
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
// preview.html Screens: desktopH 860, tabletH 1000, mobileH 900; LX_Frames 860 / 900
const HEIGHT: Record<ScreenMode, number> = { desktop: 860, tablet: 1000, mobile: 900 };

function Frame({
  lang,
  mode,
  theme,
  label,
}: {
  lang: Lang;
  mode: ScreenMode;
  theme: Theme;
  label?: ReactNode;
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
            height: HEIGHT[mode],
            position: 'relative',
            overflow: 'hidden',
            ...(mode === 'desktop' ? {} : { borderRadius: 'var(--radius-xl)' }),
          }}
        >
          <Screen mode={mode} lang={lang} theme={theme} />
        </div>
      </NextIntlClientProvider>
    </div>
  );
}

export function BookingLimitGallery() {
  return (
    <div className={f.base}>
      <div className={f.scrWrap}>
        <p className="heading">EasyBook — Limita atinsă la crearea unei programări</p>
        {(['light', 'dark'] as const).map((th) => (
          <div className={f.scrRow} key={th}>
            {(['desktop', 'tablet', 'mobile'] as const).map((m) => (
              <Frame key={m} lang="ro" mode={m} theme={th} />
            ))}
          </div>
        ))}
        <p className="heading">DE / IT — test de lungime a textelor: limita atinsă</p>
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
