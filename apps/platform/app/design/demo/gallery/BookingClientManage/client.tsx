/* eslint-disable i18next/no-literal-string -- the example data and frame labels of preview.html */
'use client';

import type { ReactNode } from 'react';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import {
  ManageCancel,
  ManageFinal,
  ManageLink,
  ManageMove,
  ManageOverview,
  ManageStop,
  type ManageStopKind,
  type PublicBrand,
  type ScreenMode,
} from '@ventora/booking/ui';
import { noop } from '../_shared/shell';
import { BRAND_FULL, PUBLIC_MESSAGES, type PL } from '../_shared/public-data';
import f from '../_shared/frames.module.css';
import g from '../BookingMoney/gallery.module.css';

/* BookingClientManage (B.11 / B.11b, S125, S146; Decision 7, screen 6) in the gallery: the frames
   of preview.html, in its order — the 14 states of S125 and the 3 link states of S146, each at
   Desktop 1280 · Tabletă 820 · Telefon 390, light and dark; the DE / IT test of S146; then S148,
   the page in the business's brand. The page is the component of the module with the texts of its
   keys; only the example data is fixed here (Salon Aurora, Friday 13 Nov 2026). */

// preview.html D / MSLOTS / LD146
const D = {
  phone: '0722 123 456',
  email: 'cristina.dobre@gmail.com',
  when: 'vineri, 13 noiembrie, la 12:30',
  whenShort: 'Vin, 13 nov. · 12:30',
  freeUntil: 'joi, 12 noiembrie, la 12:30',
  newWhen: 'luni, 16 noiembrie, la 15:30',
  newShort: 'luni, 16 nov., 15:30',
  past: 'vineri, 6 noiembrie, la 12:30',
};
const MSLOTS = (
  [
    ['09:00', false],
    ['10:30', true],
    ['11:15', false],
    ['12:30', true],
    ['14:00', true],
    ['15:30', true],
    ['16:15', false],
    ['17:00', true],
  ] as const
).map(([time, available]) => ({ time, available }));
const LD146: Record<PL, [string, string, string, string, string]> = {
  ro: ['Vopsit · 90 min', 'Ioana Pavel', 'Azi · 12:30', 'Vin, 9 oct. · 12:30', '0722 123 456'],
  de: ['Färben · 90 Min.', 'Lena Wolf', 'Heute · 12:30', 'Fr., 9. Okt. · 12:30', '+40 722 123 456'],
  it: ['Colore · 90 min', 'Ioana Pavel', 'Oggi · 12:30', 'ven 9 ott · 12:30', '+40 722 123 456'],
  en: ['Colour · 90 min', 'Ioana Pavel', 'Today · 12:30', 'Fri 9 Oct · 12:30', '+40 722 123 456'],
  fr: [
    'Coloration · 90 min',
    'Ioana Pavel',
    'Aujourd’hui · 12:30',
    'ven. 9 oct. · 12:30',
    '+40 722 123 456',
  ],
  es: ['Color · 90 min', 'Ioana Pavel', 'Hoy · 12:30', 'vie 9 oct · 12:30', '+40 722 123 456'],
};

type Frame = { mode: ScreenMode; lang?: PL; brand?: PublicBrand | null };

function useFrame({ mode, lang = 'ro', brand }: Frame) {
  const t = useTranslations('booking.manage');
  const frame = {
    mode: mode === 'mobile' ? ('mobile' as const) : ('desktop' as const),
    lang,
    brand,
    business: { name: 'Salon Aurora', address: 'Str. Nicolae Bălcescu 12, Sibiu' },
    onLang: noop,
  };
  const sum = (o: { deposit?: boolean; when?: string; newTime?: boolean } = {}) => {
    const rows: [string, string][] = [
      [t('k.salon'), 'Salon Aurora · Str. Nicolae Bălcescu 12, Sibiu'],
      [t('k.service'), 'Vopsit · 90 min'],
      [t('k.member'), 'Ioana Pavel'],
      [t('k.when'), o.when ?? (o.newTime ? D.newShort : D.whenShort)],
      [t('k.price'), '350 lei'],
    ];
    if (o.deposit !== false) rows.push([t('k.deposit'), '50 lei'], [t('k.rest'), '300 lei']);
    return rows;
  };
  return { frame, sum, t };
}

function Overview({ deposit = true, ...fr }: Frame & { deposit?: boolean }) {
  const { frame, sum } = useFrame(fr);
  return (
    <ManageOverview
      {...frame}
      summary={sum({ deposit })}
      status="confirmed"
      policy={{
        freeUntil: D.freeUntil,
        hours: 24,
        late: { kind: deposit ? 'deposit' : 'fee', amount: '50 lei' },
        onlineHours: 2,
      }}
      onMove={noop}
      onCancel={noop}
    />
  );
}

function Move({ expired, ...fr }: Frame & { expired?: boolean }) {
  const { frame, sum } = useFrame(fr);
  return (
    <ManageMove
      {...frame}
      summary={sum()}
      member="Ioana Pavel"
      from={D.whenShort}
      picker={{
        date: '2026-11-16',
        today: '2026-11-10',
        days: ['Mar 10', 'Mie 11', 'Joi 12', 'Vin 13', 'Lun 16'].map((label, i) => ({
          date: ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-16'][i]!,
          label,
        })),
        isDisabled: (d) => new Date(`${d}T12:00:00Z`).getUTCDay() === 0,
        onDate: noop,
      }}
      slots={MSLOTS}
      time={expired ? null : '15:30'}
      onTime={noop}
      held={expired ? null : { time: '15:30', left: '9:42' }}
      expired={expired ? { time: '15:30' } : null}
      deposit="50 lei"
      submitWhen={D.newShort}
      onBack={noop}
      onSubmit={noop}
    />
  );
}

function Cancel({ late, fee, ...fr }: Frame & { late?: boolean; fee?: boolean }) {
  const { frame } = useFrame(fr);
  return (
    <ManageCancel
      {...frame}
      service="Vopsit"
      member="Ioana Pavel"
      when={late ? 'mâine, vineri, 13 noiembrie, la 12:30' : D.when}
      hours={24}
      late={!!late}
      deposit={fee ? null : '50 lei'}
      fee={fee ? '50 lei' : null}
      onKeep={noop}
      onSubmit={noop}
    />
  );
}

function Stop({ kind, ...fr }: Frame & { kind: ManageStopKind }) {
  const { frame, sum } = useFrame(fr);
  const V: Record<ManageStopKind, Record<string, string>> = {
    tooLate: { when: 'azi la 12:30', hours: '2', phone: D.phone },
    cancelled: { date: '10 noiembrie' },
    invalid: {},
    done: { service: 'Vopsit', member: 'Ioana Pavel', when: D.past },
    closed: { business: 'Salon Aurora', phone: D.phone },
  };
  const withSum = kind === 'tooLate' || kind === 'cancelled' || kind === 'closed';
  return (
    <ManageStop
      {...frame}
      kind={kind}
      v={V[kind]}
      summary={withSum ? sum(kind === 'tooLate' ? { when: 'Azi · 12:30' } : {}) : null}
      phone={D.phone}
      onCall={noop}
      onRebook={noop}
    />
  );
}

function Final({ kind, ...fr }: Frame & { kind: 'moved' | 'cancelled' }) {
  const { frame, sum } = useFrame(fr);
  return (
    <ManageFinal
      {...frame}
      kind={kind}
      when={kind === 'moved' ? D.newWhen : D.when}
      email={D.email}
      summary={sum({ newTime: true })}
      refund={{ amount: '50 lei', last4: '4242' }}
      onAddCal={noop}
      onRebook={noop}
    />
  );
}

function Link({ kind, ...fr }: Frame & { kind: 'started' | 'expired' | 'revoked' }) {
  const { frame, t } = useFrame(fr);
  const d = LD146[fr.lang ?? 'ro'];
  return (
    <ManageLink
      {...frame}
      kind={kind}
      summary={[
        [t('k.service'), d[0]],
        [t('k.member'), d[1]],
        [t('k.when'), kind === 'started' ? d[2] : d[3]],
      ]}
      phone={d[4]}
      onCall={noop}
      onBookAgain={noop}
    />
  );
}

type Item = [string, (fr: Frame) => ReactNode, number, number, number];
const ITEMS: Item[] = [
  ['1 · Rezumatul programării, cu avans', (fr) => <Overview {...fr} />, 730, 730, 800],
  [
    '2 · Fără avans: politica cu taxa de anulare târzie',
    (fr) => <Overview {...fr} deposit={false} />,
    670,
    670,
    740,
  ],
  [
    '3 · „Mută programarea”: altă zi și oră, ora ținută 10 minute',
    (fr) => <Move {...fr} />,
    860,
    900,
    680,
  ],
  ['4 · Au trecut cele 10 minute', (fr) => <Move {...fr} expired />, 930, 990, 760],
  [
    '5 · „Anulează programarea”: gratuit, avansul se rambursează',
    (fr) => <Cancel {...fr} />,
    610,
    610,
    680,
  ],
  [
    '6 · Anulare târzie: salonul poate reține avansul',
    (fr) => <Cancel {...fr} late />,
    610,
    610,
    700,
  ],
  ['7 · Anulare târzie fără avans: taxa', (fr) => <Cancel {...fr} late fee />, 610, 610, 700],
  [
    '8 · Prea târziu pentru schimbări online: telefonul salonului',
    (fr) => <Stop {...fr} kind="tooLate" />,
    690,
    690,
    710,
  ],
  ['9 · Programare deja anulată', (fr) => <Stop {...fr} kind="cancelled" />, 700, 700, 670],
  ['10 · Link expirat sau invalid', (fr) => <Stop {...fr} kind="invalid" />, 460, 460, 430],
  ['11 · Programare încheiată', (fr) => <Stop {...fr} kind="done" />, 440, 440, 410],
  [
    '12 · Salonul a închis rezervările online',
    (fr) => <Stop {...fr} kind="closed" />,
    730,
    730,
    710,
  ],
  ['13 · „Am mutat programarea”', (fr) => <Final {...fr} kind="moved" />, 740, 740, 750],
  ['14 · „Am anulat programarea”', (fr) => <Final {...fr} kind="cancelled" />, 510, 510, 510],
];
const S146: Item[] = [
  ['15 · Programarea a început', (fr) => <Link {...fr} kind="started" />, 640, 640, 700],
  [
    '16 · Linkul a expirat (30 de zile după programare)',
    (fr) => <Link {...fr} kind="expired" />,
    660,
    660,
    760,
  ],
  [
    '17 · Linkul revocat după ștergerea datelor',
    (fr) => <Link {...fr} kind="revoked" />,
    500,
    500,
    560,
  ],
];
const BRAND: Item[] = [
  [
    'S148 · 1 · Rezumatul programării, cu brand complet',
    (fr) => <Overview {...fr} brand={BRAND_FULL} />,
    760,
    760,
    840,
  ],
  [
    'S148 · 2 · „Mută programarea”, cu brand complet',
    (fr) => <Move {...fr} brand={BRAND_FULL} />,
    890,
    930,
    710,
  ],
  [
    'S148 · 3 · Linkul expirat, cu brand complet',
    (fr) => <Link {...fr} kind="expired" brand={BRAND_FULL} />,
    640,
    660,
    760,
  ],
];

const WIDTH: Record<ScreenMode, number> = { desktop: 1280, tablet: 820, mobile: 390 };
const SIZE: Record<ScreenMode, string> = {
  desktop: 'Desktop · 1280',
  tablet: 'Tabletă portret · 820',
  mobile: 'Telefon · 390',
};

function Shot({
  lang = 'ro',
  mode,
  theme,
  height,
  label,
  children,
}: {
  lang?: PL;
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

function Board3({ title, items }: { title: string; items: Item[] }) {
  return (
    <>
      <p className="heading">{title}</p>
      {items.map(([label, render, dH, tH, mH]) => (
        <div key={label} className={g.group}>
          <p className={`subheading ${g.groupLab}`}>{label}</p>
          {(['light', 'dark'] as const).map((th) => (
            <div className={f.scrRow} key={th}>
              {(['desktop', 'tablet', 'mobile'] as const).map((m) => (
                <Shot
                  key={m}
                  mode={m}
                  theme={th}
                  height={m === 'desktop' ? dH : m === 'tablet' ? tH : mH}
                  label={`${SIZE[m]} · ${th === 'light' ? 'Light' : 'Dark'}`}
                >
                  {render({ mode: m })}
                </Shot>
              ))}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

export function BookingClientManageGallery() {
  return (
    <div className={f.base}>
      <div className={f.scrWrap}>
        <Board3
          title="EasyBook — Pagina clientului: mută sau anulează programarea (B.11, S125)"
          items={ITEMS}
        />
        <Board3 title="S146 · Linkul clientului: stări noi (B.11b)" items={S146} />
        <p className="heading">Test cu etichete în germană și italiană (S146)</p>
        <div className={f.scrRow}>
          <Shot
            lang="de"
            mode="desktop"
            theme="light"
            height={640}
            label="Deutsch · 1280 · Light · Termin begonnen"
          >
            <Link mode="desktop" lang="de" kind="started" />
          </Shot>
          <Shot
            lang="it"
            mode="mobile"
            theme="dark"
            height={780}
            label="Italiano · 390 · Dark · link scaduto"
          >
            <Link mode="mobile" lang="it" kind="expired" />
          </Shot>
        </div>
        <Board3 title="EasyBook — Pagina clientului în brandul afacerii (S148)" items={BRAND} />
      </div>
    </div>
  );
}
