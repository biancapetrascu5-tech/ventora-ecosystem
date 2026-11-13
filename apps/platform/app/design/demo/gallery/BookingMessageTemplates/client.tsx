/* eslint-disable i18next/no-literal-string -- the example data and frame labels of preview.html (S127) */
'use client';

import type { ReactNode } from 'react';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import {
  BookingMessagesView,
  BookingSettingsHeader,
  EmailPreview,
  MessageEditorDrawer,
  SETTINGS_TABS_S127,
  SettingsToast,
  SmsPreview,
  servicesStyles,
  type MessageId,
  type MessageRow,
  type ScreenMode,
} from '@ventora/booking/ui';
import ro from '@ventora/i18n/messages/ro.json';
import bookingRo from '@ventora/booking/messages/ro.json';
import { noop } from '../_shared/shell';
import { BookingApp } from '../_shared/booking-shell';
import f from '../_shared/frames.module.css';

/* BookingMessageTemplates (S127) in the gallery: the 7 frames of preview.html, each at 1280 / 820 /
   390, light and dark, with the same example data (Salon Aurora, Cristina Dobre). The screen is the
   component of the application (modules/booking/src/ui); only the rows, the texts and the open
   Drawer are fixed here. The team rows, the review request and the SMS (B.15–B.17) exist only here. */

const MESSAGES = { ...ro, booking: bookingRo };

function useRows() {
  const t = useTranslations('booking.msg');
  const clients: MessageRow[] = [
    { id: 'confirm', channels: ['email'], when: t('when.now'), on: true },
    { id: 'reminder', channels: ['sms', 'email'], when: t('when.before', { n: 24 }), on: true },
    { id: 'changed', channels: ['email'], when: t('when.now'), on: true },
    { id: 'cancelled', channels: ['email'], when: t('when.now'), on: true },
    { id: 'followup', channels: ['email'], when: t('when.after', { n: 2 }), on: true },
    { id: 'review', channels: ['sms'], when: t('when.nextDay', { time: '10:00' }), on: false },
  ];
  const team: MessageRow[] = [
    { id: 'teamNew', channels: ['push'], when: t('when.now'), on: true },
    { id: 'teamCancelled', channels: ['push', 'email'], when: t('when.now'), on: true },
    { id: 'teamMoved', channels: ['push'], when: t('when.now'), on: true },
    {
      id: 'teamDigest',
      channels: ['email'],
      when: t('when.morning', { time: '07:30' }),
      on: false,
    },
  ];
  return { clients, team };
}

const VARS = ['client', 'service', 'date', 'time', 'member', 'business', 'link', 'review'];

const TEXT = {
  followup: {
    subject: 'Mulțumim, {client}!',
    body: 'Bună ziua, {client},\n\nMulțumim că ați fost azi la {business} pentru {service}. Dacă ceva nu a fost cum vă doreați, răspundeți la acest e-mail.\n\nVă așteptăm cu drag data viitoare.',
  },
  review:
    '{business}: Multumim pentru vizita de ieri, {client}! Ne lasati o parere? Dureaza un minut: {review}',
  reviewLong:
    '{business}: Multumim pentru vizita de ieri, {client}! Ne-ar ajuta mult sa ne spuneti cum a fost la {service} cu {member}. Ne lasati o parere pe Google? Dureaza un minut si ne ajuta sa ne facem cunoscuti: {review}',
};

function Page({ mode, drawer, toast }: { mode: ScreenMode; drawer?: ReactNode; toast?: string }) {
  const t = useTranslations('booking.msg');
  const { clients, team } = useRows();
  return (
    <div className={servicesStyles.frame}>
      <BookingApp>
        <BookingSettingsHeader
          mode={mode}
          tab="messages"
          tabs={SETTINGS_TABS_S127}
          description={t('lead')}
        />
        <BookingMessagesView mode={mode} clients={clients} team={team} />
      </BookingApp>
      {drawer}
      {toast ? (
        <SettingsToast mode={mode} framed title={toast} onDismiss={noop} dismissLabel="Închide" />
      ) : null}
    </div>
  );
}

function Mail() {
  return (
    <EmailPreview
      m={{
        fromLabel: 'De la',
        from: 'Salon Aurora prin EasyBook',
        toLabel: 'Către',
        to: 'cristina.dobre@gmail.com',
        subject: 'Mulțumim, Cristina!',
        preheader: 'Mulțumim că ați fost azi la Salon Aurora…',
        business: 'Salon Aurora',
        title: 'Mulțumim, Cristina!',
        paragraphs: [
          'Bună ziua, Cristina,',
          'Mulțumim că ați fost azi la Salon Aurora pentru Vopsit rădăcină. Dacă ceva nu a fost cum vă doreați, răspundeți la acest e-mail.',
          'Vă așteptăm cu drag data viitoare.',
        ],
        rows: [],
        why: 'Ați primit acest e-mail pentru că ați făcut o programare la Salon Aurora.',
        foot: 'Salon Aurora · Str. Nicolae Bălcescu 12, Sibiu · 0722 123 456 · Trimis prin EasyBook, Ventora Systems',
      }}
    />
  );
}

function Editor({
  mode,
  kind = 'followup',
  err,
  long,
}: {
  mode: ScreenMode;
  kind?: MessageId;
  err?: boolean;
  long?: boolean;
}) {
  const t = useTranslations('booking.msg');
  const sms = kind === 'review';
  const team = kind === 'teamCancelled';
  const whenOptions = [
    { value: 'now', label: t('when.now') },
    { value: 'after', label: t('when.after', { n: 2 }) },
    { value: 'nextDay', label: t('when.nextDay', { time: '10:00' }) },
  ];
  const body = team
    ? '{client} a anulat programarea de {date}, {time} ({service}).'
    : sms
      ? long
        ? TEXT.reviewLong
        : TEXT.review
      : err
        ? TEXT.followup.body.replace('{client},\n\nMulțumim', '{clinet},\n\nMulțumim')
        : TEXT.followup.body;
  const preview = team ? (
    <SmsPreview text="Cristina Dobre a anulat programarea de joi, 19 noiembrie, 10:00 (Vopsit rădăcină)." />
  ) : sms ? (
    <SmsPreview
      text={
        long
          ? 'Salon Aurora: Multumim pentru vizita de ieri, Cristina! Ne-ar ajuta mult sa ne spuneti cum a fost la Vopsit radacina cu Ioana Pavel. Ne lasati o parere pe Google? Dureaza un minut si ne ajuta sa ne facem cunoscuti: g.page/r/aurora'
          : 'Salon Aurora: Multumim pentru vizita de ieri, Cristina! Ne lasati o parere? Dureaza un minut: g.page/r/aurora'
      }
      caption={long ? t('smsCount', { chars: 214, n: 2 }) : t('smsCount', { chars: 112, n: 1 })}
    />
  ) : (
    <Mail />
  );
  return (
    <MessageEditorDrawer
      framed
      mode={mode}
      kind={kind}
      channels={team ? ['push', 'email'] : ['email', 'sms']}
      channel={team ? 'push' : sms ? 'sms' : 'email'}
      subject={TEXT.followup.subject}
      body={body}
      variables={VARS}
      error={err ? { field: 'body', text: t('err.var', { var: '{clinet}' }) } : null}
      smsOver={long}
      when={
        team
          ? undefined
          : { options: whenOptions, value: sms ? 'nextDay' : 'after', hours: sms ? null : 2 }
      }
      review={sms ? { link: 'https://g.page/r/aurora', onlyDone: true, limitDays: 90 } : undefined}
      team={team ? { member: true, owner: true, reception: false } : undefined}
      preview={preview}
    />
  );
}

function useFrames(): [string, (m: ScreenMode) => ReactNode, number, number, number][] {
  const t = useTranslations('booking.msg');
  return [
    ['1 · Mesajele salonului', (m) => <Page mode={m} />, 960, 1180, 1310],
    [
      '2 · Mulțumire după vizită: e-mail, cu variabile și previzualizare',
      (m) => <Page mode={m} drawer={<Editor mode={m} />} />,
      960,
      1190,
      1350,
    ],
    [
      '3 · Variabilă greșită',
      (m) => <Page mode={m} drawer={<Editor mode={m} err />} />,
      960,
      1210,
      1370,
    ],
    [
      '4 · Cerere de recenzie: SMS, linkul, cât de des',
      (m) => <Page mode={m} drawer={<Editor mode={m} kind="review" />} />,
      960,
      1180,
      1310,
    ],
    [
      '5 · SMS peste 160 de caractere',
      (m) => <Page mode={m} drawer={<Editor mode={m} kind="review" long />} />,
      960,
      1180,
      1310,
    ],
    [
      '6 · Notificare pentru echipă: cine o primește',
      (m) => <Page mode={m} drawer={<Editor mode={m} kind="teamCancelled" />} />,
      960,
      1180,
      1310,
    ],
    ['7 · Salvat', (m) => <Page mode={m} toast={t('saved')} />, 960, 1180, 1310],
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
      <p className="heading">
        EasyBook — Mesaje: șabloane și automatizări predefinite (B.13–B.15, S127)
      </p>
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

export function BookingMessageTemplatesGallery() {
  return (
    <NextIntlClientProvider locale="ro" messages={MESSAGES} timeZone="Europe/Bucharest">
      <div className={f.base}>
        <Board />
      </div>
    </NextIntlClientProvider>
  );
}
