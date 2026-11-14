/* eslint-disable i18next/no-literal-string -- the example data and frame labels of preview.html */
'use client';

import { useState, type ReactNode } from 'react';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import { Button, StripeSlot, type ScheduleEvent } from '@ventora/ui';
import {
  BookingCalendarView,
  BookingDetailDrawer,
  BookingSettingsHeader,
  ClientBalance,
  CollectDialog,
  FeesSection,
  MoneyBlock,
  MoneyPill,
  NoShowFeeDialog,
  PublicActions,
  PublicShell,
  PublicSummary,
  RefundDialog,
  SETTINGS_TABS_S127,
  SettingsToast,
  type DetailStatus,
  type MoneyHistoryRow,
  type MoneyMethod,
  type ScreenMode,
} from '@ventora/booking/ui';
import { noop } from '../_shared/shell';
import { BookingApp } from '../_shared/booking-app';
import { MESSAGES, type Theme } from '../_shared/booking-rows';
import f from '../_shared/frames.module.css';
import g from './gallery.module.css';

/* BookingMoney (B.21, S127; Decision 7, screen 5) in the gallery: the 12 frames of preview.html,
   in its order, each at Desktop 1280 · Tabletă 820 · Telefon 390, light and dark — the detail with
   „Plată” over the calendar (de încasat, „Încasează” cash / payment link, partly paid, paid, the
   refunds card / cash), the client card with a balance, the fees in Setări, „Nu a venit” with the
   fee, the declined card, the card as guarantee on the public page. The components are the ones
   of the application (modules/booking/src/ui) with the texts of their keys. The payment link, the
   card refund through Stripe, the fees and the guarantee card are B.22: drawn here only. */

type St = 'due' | 'partial' | 'paid';
// preview.html HIST
function hist(st: St, t: (k: string, v?: Record<string, string>) => string): MoneyHistoryRow[] {
  const rows: MoneyHistoryRow[] = [
    {
      id: '1',
      when: '4 nov., 18:42',
      what: t('h.deposit', { method: t('m.cardOnline') }),
      amount: '50 lei',
      refundable: true,
    },
  ];
  if (st !== 'due')
    rows.push({
      id: '2',
      when: '13 nov., 13:40',
      what: t('h.rest', { method: t('m.cash') }),
      amount: '200 lei',
      refundable: true,
    });
  if (st === 'paid')
    rows.push({
      id: '3',
      when: '13 nov., 13:42',
      what: t('h.rest', { method: t('m.card') }),
      amount: '100 lei',
      refundable: true,
    });
  return rows;
}

function Overlay({ mode, children }: { mode: ScreenMode; children: ReactNode }) {
  return <div className={`${g.overlay} ${mode === 'mobile' ? g.overlayM : ''}`}>{children}</div>;
}

const CAL_H: Record<ScreenMode, number> = { desktop: 640, tablet: 820, mobile: 760 };

function Calendar({ mode, status }: { mode: ScreenMode; status: ScheduleEvent['status'] }) {
  const t = useTranslations('booking');
  return (
    <BookingApp lang="ro" active="calendar" title={t('calendar.title')}>
      <BookingCalendarView
        mode={mode}
        view="day"
        date="2026-11-13"
        columns={[{ id: 'ioana', label: 'Ioana Pavel', sub: 'Coafor', person: 'Ioana Pavel' }]}
        events={[
          {
            id: 'a',
            col: 'ioana',
            start: '12:00',
            end: '13:30',
            title: 'Cristina Dobre',
            subtitle: 'Vopsit rădăcină',
            status,
          },
        ]}
        from={8}
        to={19}
        now="11:20"
        height={CAL_H[mode]}
        minColumnWidth={mode === 'desktop' ? 120 : 110}
        onEventClick={noop}
        onSlotClick={noop}
      />
    </BookingApp>
  );
}

function Detail({
  mode,
  st = 'due',
  overlay,
  toast,
  noShow,
}: {
  mode: ScreenMode;
  st?: St;
  overlay?: ReactNode;
  toast?: { title: string; tone?: 'done' | 'danger' };
  noShow?: boolean;
}) {
  const t = useTranslations('booking');
  const m = useTranslations('booking.money');
  const due = st === 'paid' ? null : st === 'partial' ? '100 lei' : '300 lei';
  const paid = st === 'due' ? 50 : st === 'partial' ? 250 : 350;
  const status: DetailStatus = noShow ? 'no_show' : st === 'paid' ? 'completed' : 'in_progress';
  return (
    <div className={g.frame}>
      <Calendar mode={mode} status={noShow ? 'noshow' : st === 'paid' ? 'done' : 'now'} />
      <BookingDetailDrawer
        mode={mode}
        dense
        width={560}
        title="Cristina Dobre"
        subtitle="Vopsit rădăcină · Ioana Pavel"
        status={status}
        pill={<MoneyPill due={due} />}
        rows={[
          [t('detail.kv.when'), 'Vineri, 13 noiembrie · 12:00–13:30'],
          [t('detail.kv.service'), 'Vopsit rădăcină · 90 min'],
          [t('detail.kv.client'), 'Cristina Dobre · 0742 220 118'],
        ]}
        money={
          <MoneyBlock
            price="350 lei"
            paid={`${paid} lei`}
            due={due}
            history={hist(st, m)}
            onRefund={noop}
          />
        }
        footerStart={{ id: 'noShow', label: m('noShowStart'), icon: 'circle-x', onPress: noop }}
        footer={[
          due
            ? {
                id: 'collect',
                label: `${m('collect')} · ${due}`,
                icon: 'wallet',
                primary: true,
                onPress: noop,
              }
            : { id: 'rebook', label: t('action.rebook'), icon: 'calendar', onPress: noop },
        ]}
        menu={[]}
        onClose={noop}
      />
      {overlay && <Overlay mode={mode}>{overlay}</Overlay>}
      {toast && (
        <SettingsToast
          mode={mode}
          framed
          tone={toast.tone ?? 'done'}
          title={toast.title}
          onDismiss={noop}
        />
      )}
    </div>
  );
}

function Collect({ mode, method = 'cash' }: { mode: ScreenMode; method?: MoneyMethod }) {
  const m = useTranslations('booking.money');
  const link = method === 'link';
  const [note, setNote] = useState(link ? '' : 'Restul de 100 lei, data viitoare.');
  return (
    <CollectDialog
      mode={mode}
      framed
      client="Cristina Dobre"
      description="Vopsit rădăcină · 13 noiembrie, 12:00"
      amount={link ? '300' : '200'}
      due="300 lei"
      unit="lei"
      method={method}
      methods={['cash', 'card', 'transfer', 'link']}
      date={link ? undefined : { value: '2026-11-13', today: '2026-11-13' }}
      note={note}
      onNote={setNote}
      submitLabel={m('submit', { amount: '200 lei' })}
      onClose={noop}
      onSubmit={noop}
    />
  );
}

function Refund({ mode, cash }: { mode: ScreenMode; cash?: boolean }) {
  const m = useTranslations('booking.money');
  const [reason, setReason] = useState('Salonul a anulat: Ioana e bolnavă.');
  return (
    <RefundDialog
      mode={mode}
      framed
      client="Cristina Dobre"
      what={
        cash
          ? m('refundWhat', {
              kind: 'Rest',
              date: '13 nov.',
              amount: '200 lei',
              method: m('m.cash'),
            })
          : m('refundWhat', {
              kind: 'Avans',
              date: '4 nov.',
              amount: '50 lei',
              method: m('m.cardOnline'),
            })
      }
      amount={cash ? '200' : '50'}
      max={cash ? '200 lei' : '50 lei'}
      unit="lei"
      card={cash ? null : { last4: '4242' }}
      reason={reason}
      onReason={setReason}
      submitLabel={m('refundSubmit', { amount: cash ? '200 lei' : '50 lei' })}
      onClose={noop}
      onSubmit={noop}
    />
  );
}

function Balance({ mode }: { mode: ScreenMode }) {
  const t = useTranslations('booking');
  const m = useTranslations('booking.money');
  return (
    <div className={g.frame}>
      <BookingApp lang="ro" active="clienti" title={t('client.title')}>
        <ClientBalance
          mode={mode}
          name="Cristina Dobre"
          balance="100 lei"
          from="Vopsit rădăcină, 13 noiembrie"
          bookings={5}
          payments={4}
          rows={[
            {
              id: '1',
              service: 'Vopsit rădăcină · 13 nov.',
              date: '13 nov.',
              what: m('h.rest', { method: m('m.cash') }),
              amount: '200 lei',
              due: '100 lei',
            },
            {
              id: '2',
              service: 'Vopsit rădăcină · 13 nov.',
              date: '4 nov.',
              what: m('h.deposit', { method: m('m.cardOnline') }),
              amount: '50 lei',
            },
            {
              id: '3',
              service: 'Tratament facial',
              date: '20 aug.',
              what: m('h.rest', { method: m('m.card') }),
              amount: '220 lei',
            },
          ]}
          onCollect={noop}
          onNew={noop}
          onBack={noop}
        />
      </BookingApp>
    </div>
  );
}

function Fees({ mode }: { mode: ScreenMode }) {
  return (
    <div className={g.frame}>
      <BookingApp lang="ro" active="setari" title="Setări">
        <BookingSettingsHeader
          mode={mode}
          tab="payments"
          tabs={SETTINGS_TABS_S127}
          description={null}
        />
        <div className={g.svBody}>
          <FeesSection
            hours={24}
            unit="lei"
            late={{ on: true, kind: 'fixed', amount: '50' }}
            noShow={{ on: true, kind: 'percent', amount: '30' }}
            card
          />
        </div>
      </BookingApp>
    </div>
  );
}

function NoShow({ mode }: { mode: ScreenMode }) {
  const [v, setV] = useState<'deposit' | 'balance' | 'none'>('deposit');
  return (
    <NoShowFeeDialog
      mode={mode}
      framed
      client="Cristina Dobre"
      fee="105 lei"
      deposit="50 lei"
      last4="4242"
      split="50 lei + 55 lei"
      value={v}
      onValue={setV}
      onClose={noop}
      onSubmit={noop}
    />
  );
}

function PubCard({ mode }: { mode: ScreenMode }) {
  const p = useTranslations('booking.public');
  const m = useTranslations('booking.money');
  const pay = useTranslations('pay');
  const mob = mode === 'mobile';
  return (
    <PublicShell
      mode={mob ? 'mobile' : 'desktop'}
      business={{ name: 'Salon Aurora', address: 'Str. Nicolae Bălcescu 12, Sibiu' }}
      lang="ro"
      step={{ n: 4, total: 4 }}
      title={m('pub.cardTitle')}
      aside={
        <PublicSummary
          rows={[
            [p('k.service'), `Vopsit · ${p('minutes', { n: 90 })}`],
            [p('k.member'), 'Ioana Pavel'],
            [p('k.when'), 'Vin, 6 nov. · 12:30'],
            [p('k.price'), '350 lei'],
          ]}
          policy={p('policy')}
        />
      }
    >
      <p className="body">{m('pub.cardBody', { amount: '50 lei', hours: 24 })}</p>
      <StripeSlot labels={{ stripeSlot: pay('stripeSlot'), saveCard: pay('saveCard') }} />
      <PublicActions mode={mode}>
        <Button variant="quiet" icon="arrow-left">
          {p('back')}
        </Button>
        <Button variant="primary" block={mob} icon="lock">
          {p('continue')}
        </Button>
      </PublicActions>
    </PublicShell>
  );
}

function Screen({ item, mode }: { item: number; mode: ScreenMode }) {
  const m = useTranslations('booking.money');
  switch (item) {
    case 1:
      return <Detail mode={mode} />;
    case 2:
      return <Detail mode={mode} overlay={<Collect mode={mode} />} />;
    case 3:
      return <Detail mode={mode} overlay={<Collect mode={mode} method="link" />} />;
    case 4:
      return (
        <Detail
          mode={mode}
          st="partial"
          toast={{ title: m('collected', { amount: '200 lei', due: '100 lei' }) }}
        />
      );
    case 5:
      return (
        <Detail mode={mode} st="paid" toast={{ title: m('collectedAll', { amount: '100 lei' }) }} />
      );
    case 6:
      return <Detail mode={mode} st="paid" overlay={<Refund mode={mode} />} />;
    case 7:
      return <Detail mode={mode} st="paid" overlay={<Refund mode={mode} cash />} />;
    case 8:
      return <Balance mode={mode} />;
    case 9:
      return <Fees mode={mode} />;
    case 10:
      return <Detail mode={mode} overlay={<NoShow mode={mode} />} />;
    case 11:
      return (
        <Detail
          mode={mode}
          noShow
          toast={{ title: m('chargeFailed', { last4: '4242', amount: '55 lei' }), tone: 'done' }}
        />
      );
    default:
      return <PubCard mode={mode} />;
  }
}

const WIDTH: Record<ScreenMode, number> = { desktop: 1280, tablet: 820, mobile: 390 };
const SIZE_LABEL: Record<ScreenMode, string> = {
  desktop: 'Desktop · 1280',
  tablet: 'Tabletă portret · 820',
  mobile: 'Telefon · 390',
};

// preview.html Board3 items: [label, desktopH, tabletH, mobileH]
const ITEMS: [string, number, number, number][] = [
  ['1 · Detaliul: de încasat 300 lei, avansul plătit online', 840, 1020, 1040],
  ['2 · „Încasează”: numerar, o parte din sumă', 840, 1020, 1040],
  ['3 · „Încasează”: link de plată', 840, 1020, 1040],
  ['4 · Încasat parțial: sold restant 100 lei', 840, 1020, 1040],
  ['5 · Achitat', 840, 1020, 1040],
  ['6 · Rambursezi avansul (card, prin Stripe)', 840, 1020, 1040],
  ['7 · Rambursezi o plată în numerar', 840, 1020, 1040],
  ['8 · Fișa clientului: sold restant', 720, 710, 900],
  ['9 · Setări · Plăți și avans: taxele', 660, 670, 780],
  ['10 · „Nu a venit”: reții taxa de neprezentare', 840, 1020, 1040],
  ['11 · Cardul a fost refuzat: taxa rămâne sold restant', 840, 1020, 1040],
  ['12 · Pagina publică: cardul pentru garanție', 610, 630, 620],
];

function Frame({
  item,
  mode,
  theme,
  height,
}: {
  item: number;
  mode: ScreenMode;
  theme: Theme;
  height: number;
}) {
  return (
    <div>
      <p className={`caption ${f.scrLab}`}>
        {SIZE_LABEL[mode]} · {theme === 'light' ? 'Light' : 'Dark'}
      </p>
      <NextIntlClientProvider locale="ro" messages={MESSAGES.ro} timeZone="Europe/Bucharest">
        <div
          className={`${f.scr} ${f.scrD}`}
          data-gallery-frame
          data-theme={theme}
          lang="ro"
          style={{
            width: WIDTH[mode],
            height,
            position: 'relative',
            overflow: 'hidden',
            ...(mode === 'desktop' ? {} : { borderRadius: 'var(--radius-xl)' }),
          }}
        >
          <Screen item={item} mode={mode} />
        </div>
      </NextIntlClientProvider>
    </div>
  );
}

export function BookingMoneyGallery() {
  return (
    <div className={f.base}>
      <div className={f.scrWrap}>
        <p className="heading">
          EasyBook — Încasări: înregistrare, rambursare, sold restant, taxe (B.16, B.21, S127)
        </p>
        {ITEMS.map(([label, dH, tH, mH], i) => (
          <div key={label} className={g.group}>
            <p className={`subheading ${g.groupLab}`}>{label}</p>
            {(['light', 'dark'] as const).map((th) => (
              <div className={f.scrRow} key={th}>
                <Frame item={i + 1} mode="desktop" theme={th} height={dH} />
                <Frame item={i + 1} mode="tablet" theme={th} height={tH} />
                <Frame item={i + 1} mode="mobile" theme={th} height={mH} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
