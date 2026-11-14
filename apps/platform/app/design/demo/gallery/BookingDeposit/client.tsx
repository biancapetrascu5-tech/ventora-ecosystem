/* eslint-disable i18next/no-literal-string -- the example data and frame labels of preview.html */
'use client';

import { NextIntlClientProvider, useTranslations } from 'next-intl';
import {
  DepositPayStep,
  DepositResultView,
  type DepositPayState,
  type DepositResult,
  type ScreenMode,
} from '@ventora/booking/ui';
import ro from '@ventora/i18n/messages/ro.json';
import en from '@ventora/i18n/messages/en.json';
import fr from '@ventora/i18n/messages/fr.json';
import es from '@ventora/i18n/messages/es.json';
import de from '@ventora/i18n/messages/de.json';
import it from '@ventora/i18n/messages/it.json';
import bookingRo from '@ventora/booking/messages/ro.json';
import bookingEn from '@ventora/booking/messages/en.json';
import bookingFr from '@ventora/booking/messages/fr.json';
import bookingEs from '@ventora/booking/messages/es.json';
import bookingDe from '@ventora/booking/messages/de.json';
import bookingIt from '@ventora/booking/messages/it.json';
import { noop } from '../_shared/shell';
import f from '../_shared/frames.module.css';
import g from '../BookingMoney/gallery.module.css';

/* BookingDeposit (S116 b; Decision 7, screen 5) in the gallery: the frames of preview.html, in its
   order — the payment step before the checkbox, ready, 3-D Secure, failed, paid, waiting for
   payment, expired; each at 1280 and 390, light and dark; then the DE / IT test and EN, FR, ES. The
   public page is the component of the module (PublicShell, shared with BookingPublic) with the
   texts of its keys; the server is B.11 + B.22 (Stripe Connect), so nothing is live yet. */

type L = 'ro' | 'en' | 'fr' | 'es' | 'de' | 'it';
const MESSAGES: Record<L, Record<string, unknown>> = {
  ro: { ...ro, booking: bookingRo },
  en: { ...en, booking: bookingEn },
  fr: { ...fr, booking: bookingFr },
  es: { ...es, booking: bookingEs },
  de: { ...de, booking: bookingDe },
  it: { ...it, booking: bookingIt },
};

// preview.html PUB / SVC / MEMBERS: the example data in each language
const PUB: Record<L, { addr: string; whenShort: string; email: string; until: string }> = {
  ro: {
    addr: 'Str. Nicolae Bălcescu 12, Sibiu',
    whenShort: 'Vin, 6 nov. · 12:30',
    email: 'cristina.dobre@gmail.com',
    until: '12:07',
  },
  en: {
    addr: '12 Nicolae Bălcescu St, Sibiu',
    whenShort: 'Fri 6 Nov · 12:30',
    email: 'cristina.dobre@gmail.com',
    until: '12:07',
  },
  fr: {
    addr: '12 rue Nicolae Bălcescu, Sibiu',
    whenShort: 'ven. 6 nov. · 12:30',
    email: 'cristina.dobre@gmail.com',
    until: '12:07',
  },
  es: {
    addr: 'C/ Nicolae Bălcescu 12, Sibiu',
    whenShort: 'vie 6 nov · 12:30',
    email: 'cristina.dobre@gmail.com',
    until: '12:07',
  },
  de: {
    addr: 'Str. Nicolae Bălcescu 12, Sibiu',
    whenShort: 'Fr., 6. Nov. · 12:30',
    email: 'christina.bauer@web.de',
    until: '12:07',
  },
  it: {
    addr: 'Via Nicolae Bălcescu 12, Sibiu',
    whenShort: 'ven 6 nov · 12:30',
    email: 'cristina.greco@libero.it',
    until: '12:07',
  },
};
const SERVICE: Record<L, string> = {
  ro: 'Vopsit',
  en: 'Colour',
  fr: 'Coloration',
  es: 'Color',
  de: 'Färben',
  it: 'Colore',
};
const MEMBER: Partial<Record<L, string>> = { de: 'Lena Wolf', it: 'Chiara Bruno' };

function useShared(lang: L, mode: ScreenMode) {
  const p = useTranslations('booking.public');
  return {
    mode,
    lang,
    business: { name: 'Salon Aurora', address: PUB[lang].addr },
    onLang: noop,
    amount: '50 lei',
    summary: [
      [p('k.service'), `${SERVICE[lang]} · ${p('minutes', { n: 90 })}`],
      [p('k.member'), MEMBER[lang] ?? 'Ioana Pavel'],
      [p('k.when'), PUB[lang].whenShort],
      [p('k.price'), '350 lei'],
      [p('k.deposit'), '50 lei'],
    ] as [string, string][],
  };
}

function Pay({ lang, mode, state }: { lang: L; mode: ScreenMode; state: DepositPayState }) {
  const shared = useShared(lang, mode);
  return (
    <DepositPayStep
      {...shared}
      state={state}
      price="350 lei"
      rest="300 lei"
      hours={24}
      accepted
      hold={{ time: '12:30', left: '14:12' }}
      onBack={noop}
      onPay={noop}
    />
  );
}

function Result({ lang, mode, kind }: { lang: L; mode: ScreenMode; kind: DepositResult }) {
  const shared = useShared(lang, mode);
  return (
    <DepositResultView
      {...shared}
      kind={kind}
      email={PUB[lang].email}
      until={PUB[lang].until}
      onAddCal={noop}
      onPay={noop}
      onChooseAgain={noop}
      onManage={noop}
    />
  );
}

type Item = {
  label: string;
  pay?: DepositPayState;
  result?: DepositResult;
  dH: number;
  mH: number;
};
// preview.html Board items (dH 1250, mH 1750 unless given)
const ITEMS: Item[] = [
  {
    label: '1 · Pasul de plată: suma și politica, înainte de bifă',
    pay: 'start',
    dH: 1250,
    mH: 1750,
  },
  { label: '2 · Gata de plată', pay: 'ready', dH: 1250, mH: 1750 },
  { label: '3 · Banca cere confirmare (3-D Secure)', pay: 'bank', dH: 1250, mH: 1750 },
  { label: '4 · Plata nu a trecut: nu s-a retras nimic', pay: 'fail', dH: 1250, mH: 1750 },
  { label: '5 · Plătit: programarea e confirmată', result: 'ok', dH: 850, mH: 1000 },
  {
    label: '6 · Așteaptă plata (clientul a închis pagina; revine din e-mail)',
    result: 'wait',
    dH: 850,
    mH: 1000,
  },
  { label: '7 · Timpul de plată a expirat: ora s-a eliberat', result: 'expired', dH: 750, mH: 900 },
];

function Frame({
  lang,
  mode,
  theme,
  height,
  label,
  item,
}: {
  lang: L;
  mode: ScreenMode;
  theme: 'light' | 'dark';
  height: number;
  label: string;
  item: Pick<Item, 'pay' | 'result'>;
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
          {item.pay ? (
            <Pay lang={lang} mode={mode} state={item.pay} />
          ) : (
            <Result lang={lang} mode={mode} kind={item.result ?? 'ok'} />
          )}
        </div>
      </NextIntlClientProvider>
    </div>
  );
}

export function BookingDepositGallery() {
  return (
    <div className={f.base}>
      <div className={f.scrWrap}>
        <p className="heading">EasyBook — Avansul prin Stripe, în rezervarea online (S116 b)</p>
        {ITEMS.map(({ label, dH, mH, ...item }) => (
          <div key={label} className={g.group}>
            <p className={`subheading ${g.groupLab}`}>{label}</p>
            {(['light', 'dark'] as const).map((th) => (
              <div className={f.scrRow} key={th}>
                <Frame
                  lang="ro"
                  mode="desktop"
                  theme={th}
                  height={dH}
                  item={item}
                  label={`Desktop · 1280 · ${th === 'light' ? 'Light' : 'Dark'}`}
                />
                <Frame
                  lang="ro"
                  mode="mobile"
                  theme={th}
                  height={mH}
                  item={item}
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
            height={1250}
            item={{ pay: 'fail' }}
            label="Deutsch · 1280 · Light · Zahlung"
          />
          <Frame
            lang="it"
            mode="mobile"
            theme="dark"
            height={1000}
            item={{ result: 'wait' }}
            label="Italiano · 390 · Dark · in attesa"
          />
        </div>
        <p className="heading">Celelalte limbi: EN, FR, ES</p>
        <div className={f.scrRow}>
          <Frame
            lang="en"
            mode="mobile"
            theme="light"
            height={1750}
            item={{ pay: 'ready' }}
            label="English · 390 · Light"
          />
          <Frame
            lang="fr"
            mode="mobile"
            theme="light"
            height={1000}
            item={{ result: 'ok' }}
            label="Français · 390 · Light"
          />
          <Frame
            lang="es"
            mode="mobile"
            theme="dark"
            height={900}
            item={{ result: 'expired' }}
            label="Español · 390 · Dark"
          />
        </div>
      </div>
    </div>
  );
}
