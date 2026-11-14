/* eslint-disable i18next/no-literal-string -- the example data and frame labels of preview.html */
'use client';

import type { ReactNode } from 'react';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import {
  BookingPaymentsView,
  DisconnectStripeDialog,
  type DepositForm,
  type ScreenMode,
  type StripeState,
} from '@ventora/booking/ui';
import { noop } from '../_shared/shell';
import { BookingApp } from '../_shared/booking-app';
import { MESSAGES, type Lang, type Theme } from '../_shared/booking-rows';
import f from '../_shared/frames.module.css';
import g from '../BookingMoney/gallery.module.css';

/* BookingPayments (S116 d; Decision 7, screen 5) in the gallery: the frames of preview.html, in
   its order — Stripe neconectat, în verificare, activ (50 lei on the chosen services), percentage
   with unsaved changes, cu probleme, „Deconectează…”; each at 1280 and 390, light and dark; then
   the label test (DE 1280 light, IT 390 dark). The screen is the component of the module with the
   texts of its keys; its server is B.22 (Stripe Connect), so the application has no route yet. */

// preview.html DepositBox: the services and the 24 hours of Setări · Reguli
const deposit = (kind: 'fixed' | 'percent'): DepositForm => ({
  on: true,
  kind,
  amount: kind === 'fixed' ? '50' : '20',
  example: '70 lei',
  services: 'some',
  serviceOptions: [
    { id: 'vopsit', name: 'Vopsit', on: true },
    { id: 'coafat', name: 'Coafat eveniment', on: true },
    { id: 'facial', name: 'Tratament facial', on: false },
  ],
  riskAll: true,
  refund: 'window',
  hours: 24,
});

function Settings({
  mode,
  lang,
  st,
  kind = 'fixed',
  unsaved,
  overlay,
}: {
  mode: ScreenMode;
  lang: Lang;
  st: StripeState;
  kind?: 'fixed' | 'percent';
  unsaved?: boolean;
  overlay?: ReactNode;
}) {
  const t = useTranslations('booking.payments');
  return (
    <div className={g.frame}>
      <BookingApp lang={lang} active="setari" title={t('settingsTitle')}>
        <BookingPaymentsView
          mode={mode}
          stripe={st}
          deposit={deposit(kind)}
          unit="lei"
          unsaved={unsaved}
          onConnect={noop}
          onOpenStripe={noop}
          onDisconnect={noop}
          onSave={noop}
        />
      </BookingApp>
      {overlay && (
        <div className={`${g.overlay} ${mode === 'mobile' ? g.overlayM : ''}`}>{overlay}</div>
      )}
    </div>
  );
}

type Item = {
  label: string;
  st: StripeState;
  kind?: 'fixed' | 'percent';
  unsaved?: boolean;
  disc?: boolean;
  dH: number;
  mH: number;
};
// preview.html Board items (dH 1560, mH 2400 unless given)
const ITEMS: Item[] = [
  { label: '1 · Stripe neconectat: avansul nu se poate porni', st: 'none', dH: 900, mH: 1100 },
  { label: '2 · În verificare', st: 'pending', dH: 900, mH: 1100 },
  { label: '3 · Activ: avans de 50 lei la serviciile alese', st: 'active', dH: 1560, mH: 2400 },
  {
    label: '4 · Procent din preț, cu schimbări nesalvate',
    st: 'active',
    kind: 'percent',
    unsaved: true,
    dH: 1560,
    mH: 2400,
  },
  { label: '5 · Cu probleme: Stripe a oprit încasările', st: 'problem', dH: 900, mH: 1100 },
  { label: '6 · „Deconectează…”', st: 'active', disc: true, dH: 1560, mH: 2400 },
];

function Frame({
  lang,
  mode,
  theme,
  height,
  label,
  item,
}: {
  lang: Lang;
  mode: ScreenMode;
  theme: Theme;
  height: number;
  label: string;
  item: Omit<Item, 'label' | 'dH' | 'mH'>;
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
          <Settings
            mode={mode}
            lang={lang}
            st={item.st}
            kind={item.kind}
            unsaved={item.unsaved}
            overlay={
              item.disc ? <DisconnectStripeDialog mode={mode} framed onClose={noop} /> : null
            }
          />
        </div>
      </NextIntlClientProvider>
    </div>
  );
}

export function BookingPaymentsGallery() {
  return (
    <div className={f.base}>
      <div className={f.scrWrap}>
        <p className="heading">EasyBook — Setări · Plăți și avans (S116 d)</p>
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
            height={1560}
            item={{ st: 'active', kind: 'percent' }}
            label="Deutsch · 1280 · Light"
          />
          <Frame
            lang="it"
            mode="mobile"
            theme="dark"
            height={1100}
            item={{ st: 'problem' }}
            label="Italiano · 390 · Dark"
          />
        </div>
      </div>
    </div>
  );
}
