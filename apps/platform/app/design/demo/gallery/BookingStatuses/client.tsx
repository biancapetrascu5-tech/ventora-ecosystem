/* eslint-disable i18next/no-literal-string -- the example data, the documentation and frame labels of preview.html */
'use client';

import type { ReactNode } from 'react';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import {
  Badge,
  DataTable,
  Icon,
  Notice,
  PageHeader,
  Sheet,
  SheetSection,
  StatusPill,
  type IconName,
} from '@ventora/ui';
import {
  BookingDetailDrawer,
  STATUS_LOOK,
  type DetailStatus,
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
import { DATATABLE_RO } from '../_shared/labels';
import { BookingApp } from '../_shared/booking-shell';
import f from '../_shared/frames.module.css';
import x from './statuses.module.css';

/* BookingStatuses (S116 f, D-B-11) in the gallery: the frames of preview.html, in its order — the
   map of the 7 states, then BookingDetail in each state (the footer and the „…” menu offer only the
   transitions allowed), each at Desktop 1280 · Telefon 390, light and dark; then the pills in the
   6 languages. The drawer and the pills are the components of the application with the texts of
   their keys (booking.status.* / booking.action.* from i18n/booking.json); the list behind the
   drawer and the documentation of the map are the preview's own. */

type Lang = 'ro' | 'en' | 'fr' | 'es' | 'de' | 'it';
type Theme = 'light' | 'dark';
const LANGS: Lang[] = ['ro', 'en', 'fr', 'es', 'de', 'it'];
const MESSAGES: Record<Lang, Record<string, unknown>> = {
  ro: { ...ro, booking: bookingRo },
  en: { ...en, booking: bookingEn },
  fr: { ...fr, booking: bookingFr },
  es: { ...es, booking: bookingEs },
  de: { ...de, booking: bookingDe },
  it: { ...it, booking: bookingIt },
};

function Pill({ s }: { s: DetailStatus }) {
  const t = useTranslations('booking');
  const look = STATUS_LOOK[s];
  return (
    <StatusPill tone={look.tone} icon={look.icon}>
      {t(`status.${look.key}`)}
    </StatusPill>
  );
}

// preview.html BK_ROWS
type Row = {
  id: number;
  client: string;
  service: string;
  staff: string;
  when: string;
  st: DetailStatus;
};
const ROWS: Row[] = [
  {
    id: 1,
    client: 'Andrei Ionescu',
    service: 'Vopsit',
    staff: 'Ioana',
    when: 'Azi, 11:00',
    st: 'in_progress',
  },
  {
    id: 2,
    client: 'Cristina Dobre',
    service: 'Vopsit',
    staff: 'Ioana',
    when: 'Vin, 6 nov., 12:30',
    st: 'awaiting_payment',
  },
  {
    id: 3,
    client: 'Dan Stoica',
    service: 'Tuns',
    staff: 'Radu',
    when: 'Azi, 09:30',
    st: 'no_show',
  },
  {
    id: 4,
    client: 'Elena Georgescu',
    service: 'Vopsit rădăcini',
    staff: 'Ioana',
    when: 'Azi, 10:00',
    st: 'completed',
  },
  {
    id: 5,
    client: 'Oana Dinu',
    service: 'Manichiură',
    staff: 'Mara',
    when: 'Azi, 15:00',
    st: 'unconfirmed',
  },
  {
    id: 6,
    client: 'Sorina Vlad',
    service: 'Tratament facial',
    staff: 'Mara',
    when: 'Azi, 16:30',
    st: 'confirmed',
  },
  {
    id: 7,
    client: 'Paul Stan',
    service: 'Tuns + barbă',
    staff: 'Radu',
    when: 'Azi, 17:00',
    st: 'cancelled',
  },
];

// preview.html BkList: the list behind the drawer (headers: booking.client.history / col.*)
function BkList({ active }: { active: number }) {
  return (
    <DataTable
      caption="Programări"
      rows={ROWS}
      rowKey={(r) => r.id}
      activeRow={active}
      onRowClick={noop}
      labels={DATATABLE_RO}
      columns={[
        { key: 'client', header: 'Programări', primary: true },
        { key: 'service', header: 'Serviciu', secondary: true },
        { key: 'staff', header: 'Cu cine', optional: true },
        { key: 'when', header: 'Când', secondary: true },
        { key: 'st', header: 'Stare', trailing: true, render: (r) => <Pill s={r.st} /> },
      ]}
    />
  );
}

// preview.html FLOW: the map of the states
const FLOW: [DetailStatus, string, string, string, boolean][] = [
  [
    'awaiting_payment',
    'Rezervare online cu avans, până la plată.',
    'Rezervarea online, când serviciul cere avans',
    '→ Confirmată (plata reușită, automat) · → Anulată (timpul expiră, clientul sau salonul anulează)',
    false,
  ],
  [
    'unconfirmed',
    'Rezervare online pe care salonul o confirmă manual.',
    'Rezervarea online, cu „Confirmare manuală” în Reguli',
    '→ Confirmată · → Anulată · → Nu a venit (după ora de început)',
    false,
  ],
  [
    'confirmed',
    'Clientul e așteptat.',
    'Programarea făcută de echipă; confirmarea automată; plata avansului',
    '→ În desfășurare · → Anulată · → Nu a venit (după ora de început)',
    false,
  ],
  [
    'in_progress',
    'Clientul e în salon (peach: acum).',
    '„Începe” sau automat la ora de început, dacă e pornit',
    '→ Încheiată (cu încasarea)',
    false,
  ],
  [
    'completed',
    'Serviciul s-a făcut.',
    '„Încasează” / „Încheie”',
    '—  (corectare în 24 de ore, proprietar sau admin)',
    true,
  ],
  [
    'cancelled',
    'Cu cine a anulat și cu cât timp înainte.',
    'Clientul (din link) sau echipa',
    '—  (corectare în 24 de ore, proprietar sau admin)',
    true,
  ],
  [
    'no_show',
    'Clientul nu a venit. Numără pentru „Risc ridicat”.',
    '„Marchează: nu a venit”, după ora de început',
    '—  (corectare în 24 de ore, proprietar sau admin)',
    true,
  ],
];

function DD({ tag }: { tag: string }) {
  return (
    <span className={`caption ${x.dd}`}>
      <Icon icon="lightbulb" size={14} />
      DE DECIS{` · ${tag}`}
    </span>
  );
}

function Overview({ mode }: { mode: ScreenMode }) {
  const mob = mode === 'mobile';
  const note = (tag: string, text: string) => (
    <div className={`${x.ddnote} ${mob ? x.pad : ''}`}>
      <DD tag={tag} />
      <p className="body-small">{text}</p>
    </div>
  );
  return (
    <div style={{ height: '100%', overflow: 'hidden', background: 'var(--canvas)' }}>
      <div className={`${x.xbody} ${mob ? x.m : ''}`}>
        <Sheet>
          <SheetSection
            title="Stările unei programări (D-B-11)"
            description="Patru tonuri, șapte stări. Culoarea nu e singurul semn: fiecare stare are iconul ei. Stările finale: Încheiată, Anulată, Nu a venit."
          >
            {mob ? (
              <div className={x.stack}>
                {FLOW.map(([s, what, , to, fin]) => (
                  <div key={s} className={x.field}>
                    <div>
                      <div className={x.row}>
                        <Pill s={s} />
                        {fin ? <Badge>Finală</Badge> : null}
                      </div>
                      <p className={`body-small ${x.mt1}`}>{what}</p>
                      <p className={`caption ${x.muted}`}>{to}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <table className={x.tr}>
                <thead>
                  <tr>
                    {['Starea', 'Ce înseamnă', 'De unde vine', 'Unde poate merge', ''].map(
                      (h, i) => (
                        <th key={i} className="caption">
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {FLOW.map(([s, what, from, to, fin]) => (
                    <tr key={s}>
                      <td>
                        <Pill s={s} />
                      </td>
                      <td className="body-small">{what}</td>
                      <td className={`body-small ${x.muted}`}>{from}</td>
                      <td className="body-small">{to}</td>
                      <td>{fin ? <Badge>Finală</Badge> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SheetSection>
        </Sheet>
        {note(
          'etichete',
          'D-B-11 spune „finalizată” și „neprezentare”; glosarul spune „încheiată” și „nu a venit” (deja în ecrane, în 6 limbi). Recomand etichetele din glosar pe ecran; id-urile tehnice rămân cele din D-B-11 (completed, no_show).',
        )}
        {note(
          'tonul „Nu a venit”',
          'Recomand `danger` (o pierdere pentru salon, ca „Restantă”). Alternativa: `neutral`, ca „Anulată”.',
        )}
        {note(
          'corectarea stărilor finale',
          'Recomand: proprietarul sau un admin poate corecta o stare finală în 24 de ore („Corectează starea…”, cu motiv, în jurnal). După 24 de ore, nu.',
        )}
      </div>
    </div>
  );
}

// preview.html DET / TIME / HIST: the drawer of each state (S147: state 4 without „Anulează
// programarea”, with „Corectează starea…”).
type Foot = [IconName, string, boolean?, Record<string, string>?];
type Det = { row: number; foot: Foot[]; menu: string[]; final?: boolean };
const DET: Record<DetailStatus, Det> = {
  awaiting_payment: { row: 2, foot: [['send', 'action.resendPay']], menu: ['action.cancel'] },
  unconfirmed: {
    row: 5,
    foot: [
      ['calendar', 'action.move'],
      ['check', 'action.confirm', true],
    ],
    menu: ['action.noShow', 'action.cancel'],
  },
  confirmed: {
    row: 6,
    foot: [
      ['calendar', 'action.move'],
      ['circle-dot', 'action.start', true],
    ],
    menu: ['action.noShow', 'action.cancel'],
  },
  in_progress: {
    row: 1,
    foot: [['wallet', 'action.collect', true, { amount: '300 lei' }]],
    menu: ['action.correct'],
  },
  completed: {
    row: 4,
    final: true,
    foot: [['calendar-check', 'action.rebook', true]],
    menu: ['action.correct'],
  },
  cancelled: {
    row: 7,
    final: true,
    foot: [['calendar-check', 'action.rebook', true]],
    menu: ['action.correct'],
  },
  no_show: {
    row: 3,
    final: true,
    foot: [['calendar-check', 'action.rebook', true]],
    menu: ['action.correct'],
  },
};
const TIME = [
  'Vineri, 6 noiembrie · 12:30–14:00',
  'Vopsit · 90 min · 350 lei',
  'Ioana Pavel',
  'Cristina Dobre · 0742 220 118',
];
const HIST: Record<DetailStatus, [string, string][]> = {
  awaiting_payment: [['Azi, 11:52', 'Rezervată online · așteaptă avansul de 50 lei']],
  unconfirmed: [['Azi, 08:14', 'Rezervată online · confirmare manuală']],
  confirmed: [
    ['3 nov., 18:42', 'Avans plătit: 50 lei, card ···· 4242'],
    ['3 nov., 18:40', 'Rezervată online'],
  ],
  in_progress: [
    ['Azi, 10:58', 'Ioana Pavel a început programarea'],
    ['2 nov., 11:00', 'Confirmată de client prin e-mail'],
  ],
  completed: [
    ['Azi, 11:04', 'Încasat 280 lei, cu cardul'],
    ['Azi, 10:02', 'Începută'],
  ],
  cancelled: [
    ['Azi, 14:00', 'Anulată de client din linkul din e-mail · avansul de 50 lei rămâne la salon'],
    ['1 nov., 09:30', 'Avans plătit: 50 lei'],
  ],
  no_show: [
    ['Azi, 09:50', 'Radu Matei a marcat: nu a venit · a doua oară în 6 luni → „Risc ridicat”'],
    ['3 nov., 09:30', 'Reamintire trimisă pe e-mail'],
  ],
};

function Lines({ s }: { s: DetailStatus }) {
  const t = useTranslations('booking');
  if (s === 'awaiting_payment')
    return (
      <p className={`body-small ${x.muted}`}>
        {t('status.paymentUntil', { amount: '50 lei', until: '12:07' })}
      </p>
    );
  if (s === 'confirmed')
    return (
      <p className={`body-small ${x.muted}`}>{t('status.depositPaid', { amount: '50 lei' })}</p>
    );
  if (s === 'cancelled')
    return (
      <>
        <p className="body-small">{t('status.byClient', { time: '3 ore' })}</p>
        <p className={`body-small ${x.muted}`}>{t('status.late')}</p>
      </>
    );
  if (s === 'no_show')
    return (
      <Notice
        className={x.notice}
        tone="attention"
        icon="triangle-alert"
        title={t('detail.risk.title', { n: 2, m: 6 })}
      >
        {t('detail.risk.body')}
      </Notice>
    );
  return null;
}

function Detail({ mode, s }: { mode: ScreenMode; s: DetailStatus }) {
  const t = useTranslations('booking');
  const d = DET[s];
  const r = ROWS.find((y) => y.id === d.row)!;
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <BookingApp active="programari" title="Programări" appName="EasyBook">
        <PageHeader title="Programări" />
        <BkList active={d.row} />
      </BookingApp>
      <BookingDetailDrawer
        mode={mode === 'mobile' ? 'mobile' : 'desktop'}
        dense
        title={r.client}
        subtitle={`${r.service} · ${r.when}`}
        status={s}
        badge={s === 'awaiting_payment' || s === 'unconfirmed' ? t('detail.online') : null}
        lines={<Lines s={s} />}
        rows={[
          [t('detail.kv.when'), TIME[0]!],
          [t('detail.kv.service'), TIME[1]!],
          [t('detail.kv.with'), TIME[2]!],
          [t('detail.kv.client'), TIME[3]!],
        ]}
        finalNote={d.final ? t('status.final') : null}
        history={HIST[s]}
        footer={d.foot.map(([icon, key, primary, vars]) => ({
          id: key,
          label: t(key, vars),
          icon,
          primary,
          onPress: noop,
        }))}
        menu={d.menu.map((key) => ({
          id: key,
          label: t(key),
          icon: key.endsWith('cancel') ? 'trash-2' : key.endsWith('noShow') ? 'circle-x' : 'pencil',
          destructive: key.endsWith('cancel'),
        }))}
        onMenu={noop}
        onClose={noop}
      />
    </div>
  );
}

/* ── the frames ─────────────────────────────────────────────────────────────────────────── */

function Frame({
  mode,
  theme,
  height,
  children,
}: {
  mode: ScreenMode;
  theme: Theme;
  height: number;
  children: ReactNode;
}) {
  return (
    <div>
      <p className={`caption ${f.scrLab}`}>
        {mode === 'desktop' ? 'Desktop · 1280' : 'Telefon · 390'} ·{' '}
        {theme === 'light' ? 'Light' : 'Dark'}
      </p>
      <div
        className={`${f.scr} ${f.scrD}`}
        data-gallery-frame
        data-theme={theme}
        lang="ro"
        style={{
          width: mode === 'desktop' ? 1280 : 390,
          height,
          position: 'relative',
          overflow: 'hidden',
          ...(mode === 'desktop' ? {} : { borderRadius: 'var(--radius-xl)' }),
        }}
      >
        {children}
      </div>
    </div>
  );
}

type Item = [string, (m: ScreenMode) => ReactNode, number?, number?];
const ITEMS: Item[] = [
  ['Harta stărilor', (m) => <Overview mode={m} />, 1150, 1900],
  [
    '1 · Așteaptă plata: „Retrimite linkul de plată”; anularea în meniu',
    (m) => <Detail mode={m} s="awaiting_payment" />,
  ],
  ['2 · Neconfirmată: „Confirmă”', (m) => <Detail mode={m} s="unconfirmed" />],
  [
    '3 · Confirmată: „Începe”; „Nu a venit” și anularea în meniu',
    (m) => <Detail mode={m} s="confirmed" />,
  ],
  [
    '4 · În desfășurare: „Încasează” (→ Încheiată) și „Corectare”; fără anulare (S147)',
    (m) => <Detail mode={m} s="in_progress" />,
  ],
  ['5 · Încheiată (finală)', (m) => <Detail mode={m} s="completed" />],
  ['6 · Anulată (finală): cine și cu cât timp înainte', (m) => <Detail mode={m} s="cancelled" />],
  [
    '7 · Nu a venit (finală): clientul ajunge la „Risc ridicat”',
    (m) => <Detail mode={m} s="no_show" />,
  ],
];
const ORDER: DetailStatus[] = [
  'awaiting_payment',
  'unconfirmed',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
];

export function BookingStatusesGallery() {
  return (
    <div className={f.base}>
      <NextIntlClientProvider locale="ro" messages={MESSAGES.ro} timeZone="Europe/Bucharest">
        <div className={f.scrWrap}>
          <p className="heading">
            EasyBook — Cele 7 stări ale programării și tranzițiile (S116 f, D-B-11)
          </p>
          <p className={`caption ${x.muted}`}>
            StatusPill pentru fiecare stare · BookingDetail: în subsol și în meniul „…” apar doar
            tranzițiile permise din starea curentă · Finale: Încheiată, Anulată, Nu a venit
          </p>
          {ITEMS.map(([lab, render, D = 900, M = 1000]) => (
            <div key={lab} className={x.group}>
              <p className={`subheading ${x.grouplab}`}>{lab}</p>
              {(['light', 'dark'] as const).map((th) => (
                <div className={f.scrRow} key={th}>
                  <Frame mode="desktop" theme={th} height={D}>
                    {render('desktop')}
                  </Frame>
                  <Frame mode="mobile" theme={th} height={M}>
                    {render('mobile')}
                  </Frame>
                </div>
              ))}
            </div>
          ))}
        </div>
      </NextIntlClientProvider>
      <div className={f.scrWrap}>
        <p className="heading">Etichetele în cele 6 limbi (i18n/booking.json, booking.status.*)</p>
        {(['light', 'dark'] as const).map((th) => (
          <div key={th} className={x.fx} data-gallery-frame data-theme={th}>
            {LANGS.map((l) => (
              <NextIntlClientProvider
                key={l}
                locale={l}
                messages={MESSAGES[l]}
                timeZone="Europe/Bucharest"
              >
                <div className={x.row} lang={l}>
                  <span className={`caption ${x.muted} ${x.lang}`}>{l.toUpperCase()}</span>
                  {ORDER.map((s) => (
                    <Pill key={s} s={s} />
                  ))}
                </div>
              </NextIntlClientProvider>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
