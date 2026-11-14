/* eslint-disable i18next/no-literal-string -- the example data and frame labels of preview.html */
'use client';

import { useState } from 'react';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import { Button, Sheet, SheetSection } from '@ventora/ui';
import {
  BookingClientCardView,
  ClearRiskDialog,
  HealthLocked,
  SettingsToast,
  type ClientHistoryItem,
  type ScreenMode,
} from '@ventora/booking/ui';
import { noop } from '../_shared/shell';
import { BookingApp } from '../_shared/booking-app';
import { MESSAGES, type Lang, type Theme } from '../_shared/booking-rows';
import f from '../_shared/frames.module.css';
import s from './card.module.css';

/* BookingClientCard (S116 c; Decision 7, screen 4) in the gallery: the frames of preview.html, in
   its order — 1 · the owner (whole history and the note „Risc ridicat”), 2 · a member (only their
   appointments, no note, no health information), 3 · „Șterge nota…” with a reason, 4 · the note
   removed; each at 1280 and 390, light and dark; then the label test (DE 1280 light, IT 390 dark).
   The card is the component of the application with the texts of its keys. The team notes and the
   health information are drawn here only (the page has no data source for them yet). */

// preview.html HROWS
const HROWS: ClientHistoryItem[] = [
  {
    id: '1',
    when: 'Vin, 6 nov., 12:30',
    service: 'Vopsit',
    member: 'Ioana Pavel',
    amount: '350 lei · avans 50 lei',
    status: 'confirmed',
  },
  {
    id: '2',
    when: '30 oct., 09:30',
    service: 'Tuns',
    member: 'Radu Matei',
    amount: '120 lei',
    status: 'no_show',
  },
  {
    id: '3',
    when: '14 oct., 17:00',
    service: 'Tuns',
    member: 'Radu Matei',
    amount: '120 lei',
    status: 'cancelled',
    late: true,
  },
  {
    id: '4',
    when: '29 sept., 10:00',
    service: 'Vopsit',
    member: 'Ioana Pavel',
    amount: '350 lei',
    status: 'completed',
  },
  {
    id: '5',
    when: '12 sept., 11:00',
    service: 'Tuns',
    member: 'Radu Matei',
    amount: '120 lei',
    status: 'no_show',
  },
  {
    id: '6',
    when: '20 aug., 15:00',
    service: 'Tratament facial',
    member: 'Mara Enache',
    amount: '220 lei',
    status: 'completed',
  },
];

// booking.health.* of i18n/booking.json (BookingHealthFields; drawn here only)
const HEALTH: Record<Lang, Record<string, string>> = {
  ro: {
    card: 'Informații medicale',
    locked: 'Informațiile medicale ale clientului le văd doar Ioana Pavel și proprietarul.',
    given: 'Consimțământ dat pe 3 nov. 2026, 18:42 · prin rezervarea online',
    allergies: 'Alergii cunoscute',
    skin: 'Afecțiuni ale pielii sau ale scalpului',
    withdraw: 'Înregistrează retragerea consimțământului…',
  },
  de: {
    card: 'Gesundheitsangaben',
    locked: 'Die Gesundheitsangaben dieses Kunden sehen nur Ioana Pavel und der Inhaber.',
    given: 'Einwilligung am 3 nov. 2026, 18:42 · über die Online-Buchung',
    allergies: 'Bekannte Allergien',
    skin: 'Haut- oder Kopfhauterkrankungen',
    withdraw: 'Widerruf der Einwilligung erfassen …',
  },
  it: {
    card: 'Informazioni sanitarie',
    locked: 'Le informazioni sanitarie di questo cliente le vedono solo Ioana Pavel e il titolare.',
    given: 'Consenso dato il 3 nov. 2026, 18:42 · tramite prenotazione online',
    allergies: 'Allergie note',
    skin: 'Disturbi della pelle o del cuoio capelluto',
    withdraw: 'Registra la revoca del consenso…',
  },
};

function Health({ lang, member }: { lang: Lang; member: boolean }) {
  const h = HEALTH[lang];
  return (
    <Sheet>
      <SheetSection title={h.card!}>
        {member ? (
          <HealthLocked text={h.locked!} />
        ) : (
          <div className={s.stack}>
            <p className={`caption ${s.muted}`}>{h.given}</p>
            <dl className={s.kv}>
              <dt className="caption">{h.allergies}</dt>
              <dd className="body">Nu</dd>
              <dt className="caption">{h.skin}</dt>
              <dd className="body">—</dd>
            </dl>
            <div>
              <Button size="sm" variant="quiet" icon="x">
                {h.withdraw}
              </Button>
            </div>
          </div>
        )}
      </SheetSection>
    </Sheet>
  );
}

type Item = 'owner' | 'member' | 'clear' | 'cleared';

function Card({ mode, lang, item }: { mode: ScreenMode; lang: Lang; item: Item }) {
  const t = useTranslations('booking');
  const member = item === 'member';
  const risk = item !== 'cleared';
  const [notes, setNotes] = useState('Preferă după-amiaza. Sună înainte, nu răspunde la SMS.');
  const [reason, setReason] = useState(
    lang === 'ro' ? 'A sunat și a explicat: a fost internat pe 30 octombrie. Revine vineri.' : '',
  );
  return (
    <div className={s.frame}>
      <BookingApp lang={lang} active="clienti" title={t('client.title')}>
        <BookingClientCardView
          mode={mode}
          name="Dan Stoica"
          backHref="#"
          onNew={noop}
          stats={
            member ? null : { visits: '4', noShows: '2', late: '1', spent: '1.040', unit: 'lei' }
          }
          risk={
            risk
              ? {
                  title: t('client.riskTitle', { n: 2, months: 6 }),
                  body: t('client.riskBody', { d1: '12 septembrie', d2: '30 octombrie' }),
                }
              : null
          }
          onClearRisk={noop}
          history={member ? HROWS.filter((r) => r.member === 'Radu Matei') : HROWS}
          onRow={noop}
          contact={{
            phone: '0744 310 552',
            email: 'dan.stoica@yahoo.com',
            since: 'august 2026',
          }}
          notes={{ value: notes, onChange: setNotes }}
          health={<Health lang={lang} member={member} />}
        />
      </BookingApp>
      {item === 'clear' && (
        <div className={`${s.overlay} ${mode === 'mobile' ? s.overlayM : ''}`}>
          <ClearRiskDialog
            mode={mode}
            framed
            name="Dan Stoica"
            reason={reason}
            onReason={setReason}
            onClose={noop}
            onConfirm={noop}
          />
        </div>
      )}
      {item === 'cleared' && (
        <SettingsToast mode={mode} framed title={t('client.riskCleared')} onDismiss={noop} />
      )}
    </div>
  );
}

/* ── the frames ─────────────────────────────────────────────────────────────────────────── */

function Frame({
  lang,
  mode,
  theme,
  item,
  height,
  label,
}: {
  lang: Lang;
  mode: ScreenMode;
  theme: Theme;
  item: Item;
  height: number;
  label: string;
}) {
  return (
    <div>
      <p className={`caption ${f.scrLab}`}>{label}</p>
      <NextIntlClientProvider locale={lang} messages={MESSAGES[lang]} timeZone="Europe/Bucharest">
        <div
          className={`${f.scr} ${f.scrD}`}
          data-gallery-frame
          data-theme={theme}
          lang={lang}
          style={{
            width: mode === 'mobile' ? 390 : 1280,
            height,
            position: 'relative',
            overflow: 'hidden',
            ...(mode === 'mobile' ? { borderRadius: 'var(--radius-xl)' } : {}),
          }}
        >
          <Card mode={mode} lang={lang} item={item} />
        </div>
      </NextIntlClientProvider>
    </div>
  );
}

// preview.html Board items: [label, render, desktopH = 1200, mobileH = 2200]
const ITEMS: [Item, string, number, number][] = [
  ['owner', '1 · Proprietar: istoric complet și nota „Risc ridicat”', 1200, 2200],
  [
    'member',
    '2 · Membru (Radu Matei): doar programările lui, fără notă și fără informațiile medicale',
    1000,
    1500,
  ],
  ['clear', '3 · „Șterge nota…”: cu motiv, în jurnal', 1200, 2200],
  ['cleared', '4 · Nota ștearsă', 1200, 2200],
];

export function BookingClientCardGallery() {
  return (
    <div className={f.base}>
      <div className={f.scrWrap}>
        <p className="heading">EasyBook — Fișa clientului (S116 c)</p>
        {ITEMS.map(([item, label, dH, mH]) => (
          <div key={item} className={s.group}>
            <p className={`subheading ${s.groupLab}`}>{label}</p>
            {(['light', 'dark'] as const).map((th) => (
              <div className={f.scrRow} key={th}>
                <Frame
                  lang="ro"
                  mode="desktop"
                  theme={th}
                  item={item}
                  height={dH}
                  label={`Desktop · 1280 · ${th === 'light' ? 'Light' : 'Dark'}`}
                />
                <Frame
                  lang="ro"
                  mode="mobile"
                  theme={th}
                  item={item}
                  height={mH}
                  label={`Telefon · 390 · ${th === 'light' ? 'Light' : 'Dark'}`}
                />
              </div>
            ))}
          </div>
        ))}
        <p className="heading">Test cu etichete în germană și italiană</p>
        <div className={f.scrRow}>
          <Frame
            lang="de"
            mode="desktop"
            theme="light"
            item="owner"
            height={1200}
            label="Deutsch · 1280 · Light"
          />
          <Frame
            lang="it"
            mode="mobile"
            theme="dark"
            item="owner"
            height={2200}
            label="Italiano · 390 · Dark"
          />
        </div>
      </div>
    </div>
  );
}
