/* eslint-disable i18next/no-literal-string -- the example data and frame labels of preview.html */
'use client';

import { useState, type ReactNode } from 'react';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import { GrowthSlot, RecommendationCard, type AgendaItem } from '@ventora/ui';
import {
  BookingTodayView,
  type ScreenMode,
  type TodayAttention,
  type TodayCurrent,
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

/* BookingToday (B.6b) in the gallery: the frames of preview.html, in its order — the screens
   (Desktop 1280 · Tabletă 820 · Telefon 390, light and dark) and the DE / IT label test (DE desktop
   light, IT phone light, IT phone dark). The screen is the component of the application
   (modules/booking/src/ui) with the texts of its keys; only the example data is fixed here (Salon
   Aurora, Friday 23 Oct 2026, 11:20). */

type Lang = 'ro' | 'de' | 'it';
const MESSAGES: Record<Lang, Record<string, unknown>> = {
  ro: { ...ro, booking: bookingRo },
  de: { ...de, booking: bookingDe },
  it: { ...it, booking: bookingIt },
};
const TODAY = '2026-10-23';
const NOW = '11:20';

// preview.html D__de / D__it: the example data in the label test
const LX: Record<string, [string, string]> = {
  Tuns: ['Haarschnitt', 'Taglio'],
  'Vopsit rădăcini': ['Ansatzfärbung', 'Colore alla radice'],
  Vopsit: ['Färben', 'Colore'],
  'Tratament facial': ['Gesichtsbehandlung', 'Trattamento viso'],
  'Coafat eveniment': ['Event-Frisur', 'Acconciatura per eventi'],
  Manichiură: ['Maniküre', 'Manicure'],
  Pedichiură: ['Pediküre', 'Pedicure'],
  'Manichiură semipermanentă': ['Maniküre mit Gel-Lack', 'Manicure semipermanente'],
  'Tuns bărbați': ['Herrenhaarschnitt', 'Taglio uomo'],
  'Tuns + barbă': ['Haarschnitt + Bart', 'Taglio + barba'],
  'Adu clienții înapoi la timp': [
    'Holen Sie Ihre Kunden rechtzeitig zurück',
    'Riporti in tempo i Suoi clienti',
  ],
  'CampaignKit trimite automat o reamintire clienților care n-au mai venit de 6 săptămâni, pe baza programărilor tale.':
    [
      'CampaignKit sendet Kunden, die seit 6 Wochen nicht mehr da waren, automatisch eine Erinnerung – auf Basis Ihrer Termine.',
      'CampaignKit invia automaticamente un promemoria ai clienti che non vengono da 6 settimane, in base ai Suoi appuntamenti.',
    ],
  '49 lei pe lună · fără cost de implementare': [
    '49 € pro Monat · keine Einrichtungsgebühr',
    '49 € al mese · nessun costo di attivazione',
  ],
  'Vezi opțiunile': ['Optionen ansehen', 'Vedi le opzioni'],
};
const lx = (s: string, lang: Lang) => (lang !== 'ro' && LX[s] ? LX[s][lang === 'de' ? 0 : 1] : s);

// preview.html BK_EVENTS (without the blocked time) → the day's agenda; „now” shows as confirmed
type Ev = [string, string, string, string, string, string, AgendaItem['status']];
const EVENTS: Ev[] = [
  ['e1', 'ioana', '09:00', '09:45', 'Ana Popescu', 'Tuns', 'done'],
  ['e2', 'ioana', '10:00', '11:00', 'Elena Georgescu', 'Vopsit rădăcini', 'done'],
  ['e3', 'ioana', '11:00', '12:00', 'Andrei Ionescu', 'Vopsit', 'now'],
  ['e4', 'ioana', '12:30', '13:15', 'Cristina Dobre', 'Tratament facial', 'unconfirmed'],
  ['e5', 'ioana', '14:30', '15:15', 'Dan Stoica', 'Tuns', 'confirmed'],
  ['e6', 'ioana', '16:00', '17:00', 'Bianca Marin', 'Coafat eveniment', 'confirmed'],
  ['m1', 'mara', '09:30', '10:20', 'Ioana Radu', 'Manichiură', 'done'],
  ['m2', 'mara', '10:45', '11:45', 'Sorina Vlad', 'Pedichiură', 'now'],
  ['m4', 'mara', '14:00', '14:50', 'Alina Murariu', 'Manichiură semipermanentă', 'confirmed'],
  ['m5', 'mara', '15:00', '15:50', 'Oana Dinu', 'Manichiură', 'unconfirmed'],
  ['r1', 'radu', '09:00', '09:30', 'Mihai Tudose', 'Tuns bărbați', 'done'],
  ['r2', 'radu', '10:00', '10:30', 'Vlad Cristea', 'Tuns bărbați', 'cancelled'],
  ['r3', 'radu', '11:30', '12:00', 'Sergiu Pop', 'Tuns + barbă', 'confirmed'],
  ['r4', 'radu', '17:00', '17:30', 'Paul Stan', 'Tuns bărbați', 'confirmed'],
];
const STAFF_NAME: Record<string, string> = { ioana: 'Ioana', mara: 'Mara', radu: 'Radu' };
const STAFF = Object.entries(STAFF_NAME).map(([id, label]) => ({ id, label }));

const agendaOf = (lang: Lang) =>
  EVENTS.map(([id, staffId, start, end, title, subtitle, status]) => ({
    id,
    staffId,
    start,
    end,
    title,
    subtitle: lx(subtitle, lang),
    staff: STAFF_NAME[staffId],
    status: status === 'now' ? ('confirmed' as const) : status,
  }));

const currentOf = (lang: Lang): TodayCurrent[] => [
  {
    id: 'e3',
    client: 'Andrei Ionescu',
    service: lx('Vopsit', lang),
    staff: 'Ioana',
    start: '11:00',
    end: '12:00',
    progress: 33,
    leftMin: 40,
  },
  {
    id: 'm2',
    client: 'Sorina Vlad',
    service: lx('Pedichiură', lang),
    staff: 'Mara',
    start: '10:45',
    end: '11:45',
    progress: 58,
    leftMin: 25,
  },
];

// preview.html BK_ATTN (the DE / IT copies in euro)
const attentionOf = (lang: Lang): TodayAttention[] => [
  {
    kind: 'unconfirmed',
    id: '1',
    client: 'Cristina Dobre',
    time: '12:30',
    service: lx('Tratament facial', lang),
    staff: 'Ioana',
    inMin: 60,
    second: 'resend',
  },
  {
    kind: 'unconfirmed',
    id: '2',
    client: 'Oana Dinu',
    time: '15:00',
    service: lx('Manichiură', lang),
    staff: 'Mara',
    inMin: 240,
    second: 'call',
  },
  {
    kind: 'unpaid',
    id: '3',
    client: 'Dan Stoica',
    amountMinor: 12000,
    currency: lang === 'ro' ? 'RON' : 'EUR',
    visitDate: '2026-10-16',
  },
  {
    kind: 'move',
    id: '4',
    client: 'Elena Georgescu',
    from: { date: '2026-10-24', time: '10:00' },
    to: { date: '2026-10-31', time: '11:00' },
  },
];

function Reco({ lang }: { lang: Lang }) {
  const pay = useTranslations('pay');
  const growth = useTranslations('hub.growth');
  return (
    <GrowthSlot label={pay('recommendation')}>
      <RecommendationCard
        app="marketing"
        title={lx('Adu clienții înapoi la timp', lang)}
        benefit={lx(
          'CampaignKit trimite automat o reamintire clienților care n-au mai venit de 6 săptămâni, pe baza programărilor tale.',
          lang,
        )}
        cost={lx('49 lei pe lună · fără cost de implementare', lang)}
        actionLabel={lx('Vezi opțiunile', lang)}
        onAction={noop}
        onDismiss={noop}
        onRemindLater={noop}
        labels={{
          recommendation: pay('recommendation'),
          recommendSend: growth('actions.recommendApp'),
          decides: (who) => pay('decides', { who }),
          recommendSent: (who) => pay('recommendSent', { who }),
          recoActivated: growth('status.activated'),
          recoDeclined: growth('status.declined'),
          recoPending: growth('status.pending'),
          remind: {
            moreOptions: pay('moreOptions'),
            remindLater: pay('remindLater'),
            remindWeek: pay('remindWeek'),
            remindMonth: pay('remindMonth'),
            notInterested: pay('notInterested'),
          },
        }}
      />
    </GrowthSlot>
  );
}

function Today({ mode, lang }: { mode: ScreenMode; lang: Lang }) {
  const [staff, setStaff] = useState('all');
  return (
    <BookingTodayView
      mode={mode}
      name="Bianca"
      part="morning"
      today={TODAY}
      count={14}
      waiting={2}
      free={{ time: '15:00', hours: 3 }}
      next={{
        client: 'Sergiu Pop',
        service: lx('Tuns + barbă', lang),
        staff: 'Radu',
        time: '11:30',
        inMin: 10,
      }}
      current={currentOf(lang)}
      attention={attentionOf(lang)}
      attentionTotal={4}
      agenda={agendaOf(lang)}
      staff={STAFF}
      staffFilter={staff}
      onStaffFilter={setStaff}
      now={NOW}
      onSelect={noop}
      onConfirm={noop}
      onResend={noop}
      onCall={noop}
      onCollect={noop}
      onPayLink={noop}
      onAccept={noop}
      onPropose={noop}
      onComplete={noop}
      growth={<Reco lang={lang} />}
    />
  );
}

function Shell({ lang, children }: { lang: Lang; children: ReactNode }) {
  if (lang === 'ro') {
    return (
      <RoApp active="azi" title="EasyBook">
        {children}
      </RoApp>
    );
  }
  return (
    <LxApp
      lang={lang}
      active="azi"
      title="EasyBook"
      user={{ name: 'Bianca Petrașcu', email: 'bianca@ventora-hub.com' }}
    >
      {children}
    </LxApp>
  );
}

/* ── the frames ─────────────────────────────────────────────────────────────────────────── */

type Theme = 'light' | 'dark';
const WIDTH: Record<ScreenMode, number> = { desktop: 1280, tablet: 820, mobile: 390 };
const SIZE_LABEL: Record<ScreenMode, string> = {
  desktop: 'Desktop · 1280',
  tablet: 'Tabletă portret · 820',
  mobile: 'Telefon · 390',
};
// preview.html Screens: desktopH 1080, tabletH 1300, mobileH 1300
const HEIGHT: Record<ScreenMode, number> = { desktop: 1080, tablet: 1300, mobile: 1300 };

function Frame({ lang, mode, theme }: { lang: Lang; mode: ScreenMode; theme: Theme }) {
  const label =
    lang === 'ro' ? '' : `${lang === 'de' ? 'Deutsch' : 'Italiano'} · ${SIZE_LABEL[mode]} · `;
  return (
    <div>
      <p className={`caption ${f.scrLab}`}>
        {label || `${SIZE_LABEL[mode]} · `}
        {theme === 'light' ? 'Light' : 'Dark'}
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
          <Shell lang={lang}>
            <Today mode={mode} lang={lang} />
          </Shell>
        </div>
      </NextIntlClientProvider>
    </div>
  );
}

export function BookingTodayGallery() {
  return (
    <div className={f.base}>
      <div className={f.scrWrap}>
        <p className="heading">
          EasyBook — Azi: salut, fraza zilei, au nevoie de tine, programul cu linia „acum”, în
          desfășurare
        </p>
        {(['light', 'dark'] as const).map((th) => (
          <div className={f.scrRow} key={th}>
            {(['desktop', 'tablet', 'mobile'] as const).map((m) => (
              <Frame key={m} lang="ro" mode={m} theme={th} />
            ))}
          </div>
        ))}
        <p className="heading">Test de lungime — germană (1280) și italiană (390)</p>
        <div className={f.scrRow}>
          <Frame lang="de" mode="desktop" theme="light" />
          <Frame lang="it" mode="mobile" theme="light" />
          <Frame lang="it" mode="mobile" theme="dark" />
        </div>
      </div>
    </div>
  );
}
