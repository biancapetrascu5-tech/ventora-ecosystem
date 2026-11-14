/* eslint-disable i18next/no-literal-string -- the example data and frame labels of preview.html */
'use client';

import type { ReactNode } from 'react';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import {
  PublicDetailsStep,
  PublicDone,
  PublicHealthFields,
  PublicMemberStep,
  PublicServiceStep,
  PublicTimeStep,
  PublicVerifyStep,
  type PublicBrand,
  type ScreenMode,
} from '@ventora/booking/ui';
import { noop } from '../_shared/shell';
import {
  BRAND_FULL,
  DAYS,
  DAY_ISO,
  PUB,
  PUBLIC_MESSAGES,
  SLOTS,
  SVC,
  lei,
  mem,
  type PL,
} from '../_shared/public-data';
import f from '../_shared/frames.module.css';
import g from '../BookingMoney/gallery.module.css';

/* BookingPublic (S116 a; Decision 7, screen 6) in the gallery: the frames of preview.html, in its
   order — the 15 states of the booking at 1280 and 390, light and dark; the DE / IT test and EN,
   FR, ES; then S148, the page in the business's brand (logo, colour, accent, font) and the same
   page without a brand, with its DE / IT test. The steps are the components of the module with the
   texts of their keys; only the example data is fixed here (Salon Aurora, Friday 6 Nov 2026). */

type Frame = { lang: PL; mode: ScreenMode; brand?: PublicBrand | null };

function useData({ lang, mode, brand }: Frame) {
  const t = useTranslations('booking.public');
  const svc = SVC[lang][1]!;
  const m = mem(lang)[0]!;
  const p = PUB[lang];
  const rows = (time: boolean): [string, string][] => [
    [t('k.service'), `${svc[1]} · ${t('minutes', { n: svc[2] })}`],
    [t('k.member'), m[1]],
    ...(time ? ([[t('k.when'), p.whenShort]] as [string, string][]) : []),
    [t('k.price'), lei(svc[3])],
  ];
  return {
    frame: {
      mode,
      lang,
      brand,
      business: { name: 'Salon Aurora', address: p.addr },
      onLang: noop,
    },
    rows,
    t,
    p,
    m,
    svc,
  };
}

function Service(fr: Frame) {
  const { frame, t } = useData(fr);
  return (
    <PublicServiceStep
      {...frame}
      services={SVC[fr.lang].map((s) => ({
        id: s[0],
        name: s[1],
        meta: `${t('minutes', { n: s[2] })} · ${lei(s[3])}`,
        deposit: s[4] ? t('depositTag', { amount: lei(s[4]) }) : null,
      }))}
      value="vopsit"
      onContinue={noop}
    />
  );
}

function Member(fr: Frame) {
  const { frame, rows } = useData(fr);
  return (
    <PublicMemberStep
      {...frame}
      summary={rows(false)}
      members={mem(fr.lang).map((x) => ({ id: x[0], name: x[1], sub: x[2] }))}
      value="ioana"
      onBack={noop}
      onContinue={noop}
    />
  );
}

function Time({ state, ...fr }: Frame & { state?: 'noday' | 'none' }) {
  const { frame, rows, p, m, svc } = useData(fr);
  const days = DAYS[fr.lang] ?? DAYS.ro!;
  return (
    <PublicTimeStep
      {...frame}
      summary={rows(false)}
      picker={{
        date: state === 'noday' ? '2026-11-07' : '2026-11-06',
        today: '2026-11-04',
        days: DAY_ISO.map((d, i) => ({ date: d, label: days[i]! })),
        isDisabled: (d) => new Date(`${d}T12:00:00Z`).getUTCDay() === 0,
        onDate: noop,
      }}
      state={state ?? 'slots'}
      slots={SLOTS}
      time="12:30"
      noDay={{
        member: m[1],
        next: p.next,
        nextShort: p.nextShort,
        onNext: noop,
        onAnyone: noop,
      }}
      none={{ service: svc[1], phone: p.phone, onCall: noop }}
      onBack={noop}
      onContinue={noop}
    />
  );
}

function Details({
  state,
  ...fr
}: Frame & { state?: 'errors' | 'taken' | 'network' | 'health' | 'healthErr' }) {
  const { frame, rows, p, t } = useData(fr);
  const h = useTranslations('booking.health.f');
  const health = state === 'health' || state === 'healthErr';
  const e = state === 'errors';
  return (
    <PublicDetailsStep
      {...frame}
      summary={rows(true)}
      form={
        e
          ? { name: '', phone: '0742 22', email: 'cristina.dobre@gmail', message: '' }
          : { name: p.name, phone: p.tel, email: p.email, message: '' }
      }
      errors={
        e
          ? {
              name: t('err.required', { field: t('name').toLowerCase() }),
              phone: t('err.phone'),
              email: t('err.email'),
              captcha: t('captchaError'),
            }
          : {}
      }
      taken={
        state === 'taken'
          ? {
              time: '12:30',
              slots: SLOTS.map((s) => (s.time === '12:30' ? { ...s, available: false } : s)),
              value: null,
            }
          : null
      }
      network={state === 'network'}
      extra={
        health ? (
          <PublicHealthFields
            fields={[
              {
                id: 'allergies',
                label: h('allergies'),
                value: fr.lang === 'ro' ? 'Alergie la parafenilendiamină (PPD)' : 'PPD',
              },
              { id: 'skin', label: h('skin'), value: '' },
            ]}
            consent={state === 'health'}
            error={state === 'healthErr'}
          />
        ) : undefined
      }
      captcha={{ state: 'ok' }}
      privacyHref="#"
      onBack={noop}
      onSend={noop}
    />
  );
}

function Verify({ state, ...fr }: Frame & { state?: 'wrong' | 'expired' | 'tooMany' }) {
  const { frame, rows, p } = useData(fr);
  return (
    <PublicVerifyStep
      {...frame}
      summary={rows(true)}
      email={p.email}
      code={state === 'wrong' ? '482931' : state ? '' : '48291'}
      state={state ?? 'idle'}
      triesLeft={2}
      held={{ time: '12:30', left: p.left }}
      resendIn={state === 'tooMany' ? 0 : 42}
      onResend={noop}
      onChangeEmail={noop}
      onConfirm={noop}
    />
  );
}

function Done({ pending, ...fr }: Frame & { pending?: boolean }) {
  const { frame, rows, p } = useData(fr);
  return (
    <PublicDone
      {...frame}
      summary={rows(true)}
      pending={!!pending}
      when={p.when}
      email={p.email}
      onAddCal={noop}
      onManage={noop}
    />
  );
}

type Item = [string, (fr: Frame) => ReactNode, number?, number?];
const ITEMS: Item[] = [
  ['1 · Serviciul (serviciul cu avans are eticheta lui)', (fr) => <Service {...fr} />],
  ['2 · Cu cine: „Oricine e liber” sau un membru', (fr) => <Member {...fr} />],
  ['3 · Ziua și ora', (fr) => <Time {...fr} />],
  ['4 · Niciun loc liber în ziua aleasă: primul loc liber', (fr) => <Time {...fr} state="noday" />],
  [
    '5 · Nimic liber online în 30 de zile: telefonul salonului',
    (fr) => <Time {...fr} state="none" />,
    900,
    1000,
  ],
  [
    '6 · Datele clientului, verificarea anti-robot reușită',
    (fr) => <Details {...fr} />,
    1100,
    1500,
  ],
  [
    '7 · Erori: câmp gol, telefon, e-mail, verificarea anti-robot',
    (fr) => <Details {...fr} state="errors" />,
    1250,
    1700,
  ],
  [
    '8 · Ora a fost luată între timp: alegi alta, datele rămân',
    (fr) => <Details {...fr} state="taken" />,
    1400,
    1950,
  ],
  [
    '8b · Câmpurile medicale opționale (S116 e), cu acordul explicit',
    (fr) => <Details {...fr} state="health" />,
    1600,
    2250,
  ],
  [
    '8c · Câmp medical completat fără acord',
    (fr) => <Details {...fr} state="healthErr" />,
    1650,
    2300,
  ],
  ['9 · Codul din e-mail (sau butonul din e-mail)', (fr) => <Verify {...fr} />, 900, 1150],
  ['10 · Cod greșit', (fr) => <Verify {...fr} state="wrong" />, 900, 1150],
  ['11 · Cod expirat: plecat altul', (fr) => <Verify {...fr} state="expired" />, 950, 1250],
  ['12 · Prea multe încercări', (fr) => <Verify {...fr} state="tooMany" />, 900, 1150],
  ['13 · Fără conexiune la trimitere', (fr) => <Details {...fr} state="network" />, 1150, 1550],
  ['14 · Confirmată (salonul confirmă automat)', (fr) => <Done {...fr} />, 800, 1000],
  [
    '15 · Cerere trimisă (salonul confirmă manual): „Neconfirmată”',
    (fr) => <Done {...fr} pending />,
    800,
    1000,
  ],
];
const BRAND_ITEMS: Item[] = [
  ['S148 · 1 · Serviciul, cu brand complet', (fr) => <Service {...fr} brand={BRAND_FULL} />],
  ['S148 · 2 · Ziua și ora, cu brand complet', (fr) => <Time {...fr} brand={BRAND_FULL} />],
  [
    'S148 · 3 · Confirmată, cu brand complet',
    (fr) => <Done {...fr} brand={BRAND_FULL} />,
    800,
    1000,
  ],
  ['S148 · 4 · Aceeași pagină fără brand: aspectul Ventora', (fr) => <Service {...fr} />],
];

function Shot({
  lang,
  mode,
  theme,
  height,
  label,
  children,
}: {
  lang: PL;
  mode: ScreenMode;
  theme: 'light' | 'dark';
  height: number;
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className={`caption ${f.scrLab}`}>{label}</p>
      <NextIntlClientProvider
        locale={lang}
        messages={PUBLIC_MESSAGES[lang]}
        timeZone="Europe/Bucharest"
      >
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
          {children}
        </div>
      </NextIntlClientProvider>
    </div>
  );
}

function Board({ title, items }: { title: string; items: Item[] }) {
  return (
    <>
      <p className="heading">{title}</p>
      {items.map(([label, render, dH = 1000, mH = 1240]) => (
        <div key={label} className={g.group}>
          <p className={`subheading ${g.groupLab}`}>{label}</p>
          {(['light', 'dark'] as const).map((th) => (
            <div className={f.scrRow} key={th}>
              <Shot
                lang="ro"
                mode="desktop"
                theme={th}
                height={dH}
                label={`Desktop · 1280 · ${th === 'light' ? 'Light' : 'Dark'}`}
              >
                {render({ lang: 'ro', mode: 'desktop' })}
              </Shot>
              <Shot
                lang="ro"
                mode="mobile"
                theme={th}
                height={mH}
                label={`Telefon · 390 · ${th === 'light' ? 'Light' : 'Dark'}`}
              >
                {render({ lang: 'ro', mode: 'mobile' })}
              </Shot>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

export function BookingPublicGallery() {
  return (
    <div className={f.base}>
      <div className={f.scrWrap}>
        <Board title="EasyBook — Pagina publică de rezervare (S116 a)" items={ITEMS} />
        <p className="heading">Test cu etichete în germană și italiană</p>
        <div className={f.scrRow}>
          <Shot
            lang="de"
            mode="desktop"
            theme="light"
            height={1150}
            label="Deutsch · 1280 · Light · Angaben"
          >
            <Details lang="de" mode="desktop" />
          </Shot>
          <Shot
            lang="it"
            mode="mobile"
            theme="dark"
            height={1150}
            label="Italiano · 390 · Dark · codice"
          >
            <Verify lang="it" mode="mobile" state="wrong" />
          </Shot>
        </div>
        <p className="heading">Celelalte limbi: EN, FR, ES</p>
        <div className={f.scrRow}>
          <Shot
            lang="en"
            mode="mobile"
            theme="light"
            height={1000}
            label="English · 390 · Light · service"
          >
            <Service lang="en" mode="mobile" />
          </Shot>
          <Shot
            lang="fr"
            mode="mobile"
            theme="light"
            height={1240}
            label="Français · 390 · Light · créneau"
          >
            <Time lang="fr" mode="mobile" state="noday" />
          </Shot>
          <Shot
            lang="es"
            mode="mobile"
            theme="dark"
            height={1000}
            label="Español · 390 · Dark · confirmada"
          >
            <Done lang="es" mode="mobile" />
          </Shot>
        </div>
        <Board title="EasyBook — Pagina publică în brandul afacerii (S148)" items={BRAND_ITEMS} />
        <p className="heading">Test cu etichete în germană și italiană (S148 · brand)</p>
        <div className={f.scrRow}>
          <Shot
            lang="de"
            mode="desktop"
            theme="light"
            height={1000}
            label="Deutsch · 1280 · Light · mit Marke"
          >
            <Service lang="de" mode="desktop" brand={BRAND_FULL} />
          </Shot>
          <Shot
            lang="it"
            mode="mobile"
            theme="dark"
            height={1240}
            label="Italiano · 390 · Dark · con brand"
          >
            <Service lang="it" mode="mobile" brand={BRAND_FULL} />
          </Shot>
        </div>
      </div>
    </div>
  );
}
