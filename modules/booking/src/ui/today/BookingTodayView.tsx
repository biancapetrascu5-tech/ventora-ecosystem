'use client';

import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Agenda,
  AttentionList,
  Avatar,
  Badge,
  Button,
  ProgressBar,
  SegmentedControl,
  StatusPill,
  type AgendaItem,
  type AttentionItem,
} from '@ventora/ui';
import { amountText } from '../services/format';
import type { ScreenMode } from '../services/BookingServicesView';
import { useCalendarTexts } from '../calendar/calendar-texts';
import { addDays, dayDate } from '../calendar/calendar-format';
import s from './today.module.css';

/* BookingToday (B.6b, preview.html of BookingToday): EasyBook · „Azi” — the greeting and the day's
   sentence, „Au nevoie de tine” (at most 5, then „Vezi toate”), the appointments in progress with
   the time left, and the day's Agenda with the „acum” line, filterable by person. Desktop: two
   columns; tablet and phone: attention first, then in progress, then the agenda; on phones „Următoarea
   programare” is the first card. Under the attention list, a GrowthSlot (owners and admins only:
   the page decides). Only props: the page of the application and the gallery draw this component. */

export type TodayNext = {
  client: string;
  service: string;
  staff: string;
  time: string;
  inMin: number;
};
export type TodayCurrent = {
  id: string;
  client: string;
  service: string;
  staff: string;
  start: string;
  end: string;
  /** 0–100 */
  progress: number;
  leftMin: number;
};
export type TodayAttention =
  | {
      kind: 'unconfirmed';
      id: string;
      client: string;
      time: string;
      service: string;
      staff: string;
      inMin: number;
      /** The second action: resend the reminder, or call; none when the page can do neither. */
      second?: 'resend' | 'call';
    }
  | {
      kind: 'unpaid';
      id: string;
      client: string;
      amountMinor: number;
      currency: 'RON' | 'EUR';
      /** The visit's local day („YYYY-MM-DD”). */
      visitDate: string;
    }
  | {
      kind: 'move';
      id: string;
      client: string;
      from: { date: string; time: string };
      to: { date: string; time: string };
    };

/** An action shows only when the page passes its handler (the page offers what it can do). */
export type TodayActions = {
  onConfirm?: (id: string) => void;
  onResend?: (id: string) => void;
  onCall?: (id: string) => void;
  onCollect?: (id: string) => void;
  onPayLink?: (id: string) => void;
  onAccept?: (id: string) => void;
  onPropose?: (id: string) => void;
  onComplete?: (id: string) => void;
};

export type BookingTodayViewProps = TodayActions & {
  mode: ScreenMode;
  /** The person's first name. */
  name: string;
  /** The part of the day, for the greeting. */
  part: 'morning' | 'day' | 'evening';
  /** The business's today („YYYY-MM-DD”): „mâine” in a request to move. */
  today: string;
  /** Today's appointments that still hold the day. */
  count: number;
  /** Today's appointments waiting for confirmation. */
  waiting: number;
  /** The free hours after a time („după 15:00 mai ai 3 ore libere”), or none. */
  free?: { time: string; hours: number } | null;
  next?: TodayNext | null;
  current: TodayCurrent[];
  /** At most 5 are shown; `attentionTotal` counts them all. */
  attention: TodayAttention[];
  attentionTotal: number;
  onSeeAll?: () => void;
  agenda: (AgendaItem & { staffId: string })[];
  staff: { id: string; label: string }[];
  staffFilter: string;
  onStaffFilter?: (id: string) => void;
  now?: string;
  onSelect?: (item: AgendaItem) => void;
  /** The slot `booking.today.aside` (a GrowthSlot with its recommendation); nothing → nothing drawn. */
  growth?: ReactNode;
  notice?: ReactNode;
};

export const ATTENTION_MAX = 5;

function useTodayTexts() {
  const t = useTranslations('booking.today');
  const locale = useLocale();
  const fmt = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...o, timeZone: 'UTC' });
  const inText = (min: number) =>
    min < 60 ? t('in.min', { n: min }) : t('in.hours', { n: Math.round(min / 60) });
  return { t, locale, fmt, inText };
}

export function BookingTodayView(p: BookingTodayViewProps) {
  const { t, locale, fmt, inText } = useTodayTexts();
  const c = useCalendarTexts();
  const mob = p.mode === 'mobile';

  // „Azi ai 14 programări. Două așteaptă confirmarea, iar după 15:00 mai ai 3 ore libere.”
  const waiting = p.waiting > 0 ? t('sentence.waiting', { n: p.waiting }) : null;
  const free = p.free ? t('sentence.free', p.free) : null;
  const cap = (x: string) => x.charAt(0).toLocaleUpperCase(locale) + x.slice(1);
  const tail =
    waiting && free
      ? t('sentence.both', { waiting, free })
      : waiting || free
        ? t('sentence.one', { text: cap((waiting ?? free) as string) })
        : null;
  const sentence = [
    p.count > 0 ? t('sentence.count', { count: p.count }) : t('sentence.none'),
    tail,
  ]
    .filter(Boolean)
    .join(' ');

  const dayText = (iso: string) =>
    iso === addDays(p.today, 1)
      ? new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(1, 'day')
      : fmt({ weekday: 'long' }).format(dayDate(iso));
  const when = (x: { date: string; time: string }) =>
    t('attn.when', { day: dayText(x.date), time: x.time });

  type Act = { label: string; primary?: boolean; quiet?: boolean; on?: (id: string) => void };
  const acts = (id: string, list: Act[]) =>
    list.filter((x) => x.on).map(({ on, ...x }) => ({ ...x, onPress: () => on?.(id) }));

  const items: AttentionItem[] = p.attention.slice(0, ATTENTION_MAX).map((a) => {
    if (a.kind === 'unconfirmed') {
      return {
        id: a.id,
        icon: 'clock',
        title: t('attn.unconfirmed', { client: a.client }),
        meta: t('attn.unconfirmedMeta', { time: a.time, service: a.service, staff: a.staff }),
        time: inText(a.inMin),
        actions: acts(a.id, [
          { label: t('attn.confirm'), primary: true, on: p.onConfirm },
          ...(a.second === 'resend'
            ? [{ label: t('attn.resend'), on: p.onResend }]
            : a.second === 'call'
              ? [{ label: t('attn.call'), on: p.onCall }]
              : []),
        ]),
      };
    }
    if (a.kind === 'unpaid') {
      return {
        id: a.id,
        icon: 'wallet',
        tone: 'danger',
        title: t('attn.unpaid', {
          client: a.client,
          amount: t(`money.${a.currency}`, { amount: amountText(a.amountMinor) }),
        }),
        meta: t('attn.unpaidMeta', {
          date: fmt({ day: 'numeric', month: 'long' }).format(dayDate(a.visitDate)),
        }),
        actions: acts(a.id, [
          { label: t('attn.collect'), on: p.onCollect },
          { label: t('attn.payLink'), quiet: true, on: p.onPayLink },
        ]),
      };
    }
    return {
      id: a.id,
      icon: 'calendar',
      title: t('attn.move', { client: a.client }),
      meta: t('attn.moveMeta', { from: when(a.from), to: when(a.to) }),
      actions: acts(a.id, [
        { label: t('attn.accept'), primary: true, on: p.onAccept },
        { label: t('attn.propose'), on: p.onPropose },
      ]),
    };
  });

  const agenda = p.agenda.filter((e) => p.staffFilter === 'all' || e.staffId === p.staffFilter);

  const person = (name: string, sub: string) => (
    <span className={`${s.r} ${s.who}`}>
      <Avatar name={name} size="md" />
      <span className={s.lines}>
        <span className="body-strong">{name}</span>
        <span className="body-small muted">{sub}</span>
      </span>
    </span>
  );

  return (
    <div className={`${s.today} ${s[p.mode]}`}>
      <div className={s.greet}>
        <h1 className="display-l">{t(`greeting.${p.part}`, { name: p.name })}</h1>
        <p className="body muted">{sentence}</p>
      </div>
      {p.notice}
      <div className={s.grid}>
        <div className={s.main}>
          {mob && p.next && (
            <section>
              <h2 className={`heading ${s.sec}`}>{t('next.title')}</h2>
              <div className={s.nowcard}>
                <div className={`${s.r} ${s.between}`}>
                  {person(
                    p.next.client,
                    t('next.meta', {
                      service: p.next.service,
                      staff: p.next.staff,
                      time: p.next.time,
                    }),
                  )}
                  <StatusPill tone="neutral" icon="clock">
                    {inText(p.next.inMin)}
                  </StatusPill>
                </div>
              </div>
            </section>
          )}
          {p.current.length > 0 && (
            <section>
              <h2 className={`heading ${s.sec}`}>{t('current.title')}</h2>
              <div className={s.nowcards}>
                {p.current.map((e) => (
                  <div key={e.id} className={s.nowcard}>
                    <div className={`${s.r} ${s.between}`}>
                      {person(e.client, `${e.service} · ${e.staff}`)}
                      <StatusPill tone="attention">{t('current.now')}</StatusPill>
                    </div>
                    <ProgressBar
                      value={e.progress}
                      label={t('current.progress', { from: e.start, to: e.end, n: e.leftMin })}
                      size="sm"
                    />
                    {(p.onComplete || p.onCollect) && (
                      <div className={`${s.r} ${s.tight}`}>
                        {p.onComplete && (
                          <Button
                            size="sm"
                            variant="secondary"
                            icon="check"
                            onPress={() => p.onComplete?.(e.id)}
                          >
                            {t('current.complete')}
                          </Button>
                        )}
                        {p.onCollect && (
                          <Button
                            size="sm"
                            variant="quiet"
                            icon="wallet"
                            onPress={() => p.onCollect?.(e.id)}
                          >
                            {t('current.collect')}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
          <section>
            <div className={s.sechead}>
              <h2 className="heading">{t('agenda.title')}</h2>
              <SegmentedControl
                size="sm"
                aria-label={t('agenda.staff')}
                value={p.staffFilter}
                onChange={(v) => p.onStaffFilter?.(v)}
                options={[
                  { value: 'all', label: t('agenda.all') },
                  ...p.staff.map((m) => ({ value: m.id, label: m.label })),
                ]}
              />
            </div>
            <div className={s.sheetlike}>
              {agenda.length > 0 ? (
                <Agenda
                  items={agenda}
                  now={p.now}
                  onSelect={p.onSelect}
                  showStaff={p.staffFilter === 'all'}
                  statusLabels={c.statusLabels()}
                  nowLabel={t('current.now')}
                />
              ) : (
                <p className={`body muted ${s.empty}`}>{t('agenda.empty')}</p>
              )}
            </div>
          </section>
        </div>
        <aside className={s.side}>
          <h2 className={`heading ${s.sec}`}>
            {t('attn.title')}{' '}
            {p.attentionTotal > 0 && <Badge tone="attention" count={p.attentionTotal} />}
          </h2>
          <div className={s.sheetlike}>
            <AttentionList
              items={items}
              empty={<p className={`body muted ${s.empty}`}>{t('attn.empty')}</p>}
            />
            {p.attentionTotal > ATTENTION_MAX && (
              <div className={s.more}>
                <Button size="sm" variant="quiet" onPress={p.onSeeAll}>
                  {t('attn.more', { n: p.attentionTotal })}
                </Button>
              </div>
            )}
          </div>
          {p.growth}
        </aside>
      </div>
    </div>
  );
}
