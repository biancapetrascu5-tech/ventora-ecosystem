/* eslint-disable i18next/no-literal-string -- the example data and frame labels of preview.html (S124) */
'use client';

import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import {
  BookingSettingsHeader,
  BookingTeamView,
  ExceptionDialog,
  FrameOverlay,
  SettingsToast,
  StaffScheduleDrawer,
  TimeOffDialog,
  servicesStyles,
  useTeamTexts,
  validateWeek,
  type BusinessDayData,
  type DayForm,
  type RemovedMemberRow,
  type ScreenMode,
  type TeamMemberRow,
  type WeekForm,
} from '@ventora/booking/ui';
import ro from '@ventora/i18n/messages/ro.json';
import bookingRo from '@ventora/booking/messages/ro.json';
import { noop } from '../_shared/shell';
import { BookingApp } from '../_shared/booking-shell';
import f from '../_shared/frames.module.css';

/* BookingTeamSchedule (S124) in the gallery: the 10 frames of preview.html, each at 1280 / 820 /
   390, light and dark, with the same example data (Salon Aurora, today 8 Nov 2026). The screen is
   the component of the application (modules/booking/src/ui); only the data and the open Drawer or
   dialog are fixed here. The roles under the names are the preview's (the application shows the
   Hub role, decision 4); the appointments (B.4) only here. */

const MESSAGES = { ...ro, booking: bookingRo };
const H = (h: number, m = 0) => h * 60 + m;
const iv = (a: number, b: number) => ({ startMin: a, endMin: b });
const TODAY = '2026-11-08';

// preview.html BIZ: Lun–Mie 09–19, Joi–Vin 09–20, Sâm 10–16, Dum închis
const BIZ: BusinessDayData[] = [1, 2, 3, 4, 5, 6, 7].map((weekday) =>
  weekday <= 3
    ? { weekday, isOpen: true, opensAtMin: H(9), closesAtMin: H(19) }
    : weekday <= 5
      ? { weekday, isOpen: true, opensAtMin: H(9), closesAtMin: H(20) }
      : weekday === 6
        ? { weekday, isOpen: true, opensAtMin: H(10), closesAtMin: H(16) }
        : { weekday, isOpen: false, opensAtMin: null, closesAtMin: null },
);

const days = (list: number[], intervals: { startMin: number; endMin: number }[]) =>
  list.map((weekday) => ({ weekday, intervals }));

// preview.html MEMBERS
const MEMBERS: TeamMemberRow[] = [
  {
    id: '1',
    name: 'Ioana Pavel',
    role: 'Stilist',
    week: [
      ...days([1, 2, 3, 4, 5], [iv(H(9), H(13)), iv(H(14), H(18))]),
      ...days([6], [iv(H(10), H(14))]),
    ],
    next: { kind: 'leave', from: '2026-11-16', to: '2026-11-20' },
  },
  {
    id: '2',
    name: 'Mara Enache',
    role: 'Manichiuristă',
    week: days([2, 3, 4, 5, 6], [iv(H(10), H(16))]),
    next: { kind: 'off', date: '2026-11-14' },
  },
  {
    id: '3',
    name: 'Radu Matei',
    role: 'Stilist',
    week: [...days([1, 2, 3], [iv(H(12), H(19))]), ...days([4, 5], [iv(H(12), H(20))])],
    next: null,
  },
  {
    id: '4',
    name: 'Diana Ilie',
    role: 'Cosmeticiană',
    week: days([1, 3, 5], [iv(H(9), H(17))]),
    next: { kind: 'other', date: '2026-11-13', intervals: [iv(H(12), H(20))] },
  },
  {
    id: '5',
    name: 'Sorin Vlad',
    role: 'Maseur',
    week: [...days([4, 5], [iv(H(14), H(20))]), ...days([6], [iv(H(10), H(16))])],
    next: null,
  },
];
// preview.html GONE
const GONE: RemovedMemberRow[] = [
  { id: '6', name: 'Cristian Dobre', role: 'Stilist', since: '3 nov.', past: 56 },
  { id: '7', name: 'Andreea Popa', role: 'Cosmeticiană', since: '30 sept.', past: 128 },
];

const two = (a: string, b: string, c: string, d: string): DayForm => ({
  on: true,
  intervals: [
    { from: a, to: b },
    { from: c, to: d },
  ],
});
const one = (a: string, b: string): DayForm => ({ on: true, intervals: [{ from: a, to: b }] });
const OFF: DayForm = { on: false, intervals: [] };
// preview.html IOANA and IOANA_ERR
const IOANA: WeekForm = {
  1: two('09:00', '13:00', '14:00', '18:00'),
  2: two('09:00', '13:00', '14:00', '18:00'),
  3: two('09:00', '13:00', '14:00', '18:00'),
  4: two('09:00', '13:00', '14:00', '18:00'),
  5: two('09:00', '13:00', '14:00', '18:00'),
  6: one('10:00', '14:00'),
  7: OFF,
};
const IOANA_ERR: WeekForm = {
  ...IOANA,
  4: two('08:00', '13:00', '14:00', '18:00'),
  5: two('09:00', '13:00', '12:30', '18:00'),
  6: one('10:00', '17:00'),
};
const EXC = [
  { id: 'e1', date: '2026-11-14', isWorking: false, intervals: [] },
  {
    id: 'e2',
    date: '2026-11-27',
    isWorking: true,
    intervals: [iv(H(12), H(16)), iv(H(17), H(20))],
  },
];
const LEAVES = [
  { id: 'l1', startsOn: '2026-11-16', endsOn: '2026-11-20', reason: 'Concediu de odihnă' },
];
const SAT = { opensAtMin: H(10), closesAtMin: H(16) };

function Page({
  mode,
  empty,
  drawer,
  overlay,
  toast,
}: {
  mode: ScreenMode;
  empty?: boolean;
  drawer?: ReactNode;
  overlay?: ReactNode;
  toast?: string;
}) {
  const { t } = useTeamTexts();
  return (
    <div className={servicesStyles.frame}>
      <BookingApp>
        <BookingSettingsHeader mode={mode} tab="team" description={t('lead')} />
        <BookingTeamView
          mode={mode}
          business={BIZ}
          members={empty ? [] : MEMBERS}
          removed={empty ? [] : GONE}
          leftWithBookings={empty ? null : { name: 'Cristian Dobre', count: 4 }}
        />
      </BookingApp>
      {drawer}
      {overlay ? <FrameOverlay mode={mode}>{overlay}</FrameOverlay> : null}
      {toast ? (
        <SettingsToast mode={mode} framed title={toast} onDismiss={noop} dismissLabel="Închide" />
      ) : null}
    </div>
  );
}

function Drawer({ mode, errors }: { mode: ScreenMode; errors?: boolean }) {
  const week = errors ? IOANA_ERR : IOANA;
  return (
    <StaffScheduleDrawer
      framed
      mode={mode}
      name="Ioana Pavel"
      business={BIZ}
      week={week}
      errors={errors ? validateWeek(week, BIZ) : undefined}
      overrides={EXC}
      timeOff={LEAVES}
      canSeeReason
    />
  );
}

function Exception({ mode, other, err }: { mode: ScreenMode; other?: boolean; err?: boolean }) {
  return (
    <ExceptionDialog
      framed
      mode={mode}
      name="Mara Enache"
      date={other ? '2026-11-21' : '2026-11-14'}
      today={TODAY}
      day={
        other
          ? err
            ? two('10:00', '13:00', '14:00', '18:00')
            : two('10:00', '13:00', '14:00', '16:00')
          : OFF
      }
      bounds={SAT}
      weekday={6}
      error={err ? { i: 1, at: 'to', code: 'after_close' } : null}
      bookings={other ? null : { count: 2, date: '14 noiembrie' }}
    />
  );
}

function Leave({ mode, err }: { mode: ScreenMode; err?: boolean }) {
  return (
    <TimeOffDialog
      framed
      mode={mode}
      name="Ioana Pavel"
      from="2026-11-16"
      to={err ? '2026-11-12' : '2026-11-20'}
      today={TODAY}
      canSeeReason
      reason={err ? '' : 'Concediu de odihnă'}
      error={err ? { field: 'endsOn', code: 'leave_order' } : null}
      days={err ? 0 : 5}
      bookings={err ? null : { count: 7, from: '16', to: '20 noiembrie' }}
    />
  );
}

function useFrames(): [string, (m: ScreenMode) => ReactNode, number, number, number][] {
  const { t } = useTeamTexts();
  return [
    [
      '1 · Membrii din calendar și cine nu mai e în echipă',
      (m) => <Page mode={m} />,
      1100,
      1150,
      1300,
    ],
    [
      '2 · Programul unui membru: săptămâna, excepțiile, concediile',
      (m) => <Page mode={m} drawer={<Drawer mode={m} />} />,
      1400,
      1400,
      1850,
    ],
    [
      '3 · Depășește programul afacerii; intervale suprapuse',
      (m) => <Page mode={m} drawer={<Drawer mode={m} errors />} />,
      1550,
      1550,
      2050,
    ],
    [
      '4 · Excepție: zi liberă, cu programări în ziua aceea',
      (m) => <Page mode={m} overlay={<Exception mode={m} />} />,
      1000,
      1150,
      1300,
    ],
    [
      '5 · Excepție: alt program, cu pauză',
      (m) => <Page mode={m} overlay={<Exception mode={m} other />} />,
      1000,
      1150,
      1300,
    ],
    [
      '6 · Excepție în afara programului afacerii',
      (m) => <Page mode={m} overlay={<Exception mode={m} other err />} />,
      1000,
      1150,
      1300,
    ],
    [
      '7 · Concediu, cu programări în perioada aleasă',
      (m) => <Page mode={m} overlay={<Leave mode={m} />} />,
      1000,
      1150,
      1300,
    ],
    [
      '8 · Concediu: „Până la” înainte de „De la”',
      (m) => <Page mode={m} overlay={<Leave mode={m} err />} />,
      1000,
      1150,
      1300,
    ],
    ['9 · Salvat', (m) => <Page mode={m} toast={t('saved')} />, 1100, 1150, 1300],
    ['10 · Starea goală: nimeni în calendar', (m) => <Page mode={m} empty />, 700, 800, 900],
  ];
}

const SIZES: [ScreenMode, string, 'd' | 't' | 'm'][] = [
  ['desktop', 'Desktop · 1280', 'd'],
  ['tablet', 'Tabletă portret · 820', 't'],
  ['mobile', 'Telefon · 390', 'm'],
];
const WIDTH = { d: 1280, t: 820, m: 390 } as const;

function Board() {
  const frames = useFrames();
  return (
    <div className={f.scrWrap}>
      <p className="heading">EasyBook — Setări · Programul echipei (pilot, S124)</p>
      {frames.map(([label, render, D, T, M]) => (
        <div key={label} className={f.scrGroup}>
          <p className="subheading">{label}</p>
          {(['light', 'dark'] as const).map((th) => (
            <div className={f.scrRow} key={th}>
              {SIZES.map(([mode, lab, k]) => (
                <div key={mode}>
                  <p className={`caption ${f.scrLab}`}>
                    {lab} · {th === 'light' ? 'Light' : 'Dark'}
                  </p>
                  <div
                    className={`${f.scr} ${f.scrD}`}
                    data-gallery-frame
                    data-frame={k}
                    data-theme={th}
                    style={{
                      width: WIDTH[k],
                      height: k === 'd' ? D : k === 't' ? T : M,
                      position: 'relative',
                      overflow: 'hidden',
                      ...(k === 'd' ? {} : { borderRadius: 'var(--radius-xl)' }),
                    }}
                  >
                    {render(mode)}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function BookingTeamScheduleGallery() {
  return (
    <NextIntlClientProvider locale="ro" messages={MESSAGES} timeZone="Europe/Bucharest">
      <div className={f.base}>
        <Board />
      </div>
    </NextIntlClientProvider>
  );
}
