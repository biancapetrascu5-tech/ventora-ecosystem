'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  ManageCancel,
  ManageFinal,
  ManageLink,
  ManageMove,
  ManageOverview,
  ManageStop,
  useNewTexts,
} from '@ventora/booking/ui';
import {
  cancelManagedBookingAction,
  confirmManagedMoveAction,
  readManagedSlots,
  startManagedMoveAction,
  type ManagedData,
  type PublicSlotData,
} from '@/server/booking-public-actions';
import { rememberLocale } from '@/i18n/locale';
import { useMode } from '../useMode';
import {
  addDays,
  dayLong,
  phoneText,
  downloadIcs,
  icsOf,
  leftOf,
  stripDays,
  stripLabel,
  whenShort,
} from './public-format';

/* Decision 7, screen 6 — BookingClientManage (B.11 / B.11b, S125, S146) at /r/<slug>/m/<token>:
   the booking and the policy; „Mută programarea” (the new time held 10 minutes, the old one kept
   until the confirmation); „Anulează programarea” with the salon's policy; the states that stop
   online changes (from the contract's `state`); the results. B.11c: the salon's phone („Sună la
   salon”). The client's e-mail is not in getManagedBooking: „V-am trimis un e-mail…” is not drawn. */

type View = 'overview' | 'move' | 'cancel' | 'moved' | 'cancelled';

export function ManageScreen({
  slug,
  token,
  booking,
}: {
  slug: string;
  token: string;
  booking: ManagedData;
}) {
  const t = useTranslations('booking.manage');
  const pub = useTranslations('booking.public');
  const locale = useLocale();
  const router = useRouter();
  const mode = useMode();
  const nx = useNewTexts();
  const a = booking.appointment;
  const [view, setView] = useState<View>('overview');
  const [date, setDate] = useState(a.date);
  const [slots, setSlots] = useState<PublicSlotData[]>([]);
  const [slot, setSlot] = useState<PublicSlotData | null>(null);
  const [hold, setHold] = useState<{ id: string; expiresAt: string; time: string } | null>(null);
  const [expired, setExpired] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!hold) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hold]);
  const holdLeft = hold ? Date.parse(hold.expiresAt) - now : 0;

  const cur = a.currency === 'EUR' ? 'EUR' : 'RON';
  const money = (minor: number) => nx.money(minor, cur);
  const price = nx.price(
    {
      durationMin: a.durationMinutes,
      durationMax: a.durationMinutes,
      priceKind: a.priceKind,
      priceMinor: a.priceMinor,
      priceMaxMinor: a.priceMaxMinor,
    },
    cur,
  );
  const deposit = a.paidMinor > 0 ? money(a.paidMinor) : null;
  const salon = a.location?.address
    ? `${booking.business.name} · ${a.location.address}`
    : booking.business.name;
  const summary = (when = whenShort(a.date, a.time, locale)): [string, string][] => {
    const rows: [string, string][] = [
      [t('k.salon'), salon],
      [t('k.service'), `${a.serviceName} · ${pub('minutes', { n: a.durationMinutes })}`],
      [t('k.member'), a.staffDisplayName],
      [t('k.when'), when],
      [t('k.price'), price],
    ];
    if (deposit) {
      rows.push([t('k.deposit'), deposit]);
      if (a.leftToPayMinor !== null) rows.push([t('k.rest'), money(a.leftToPayMinor)]);
    }
    return rows;
  };
  const frame = {
    mode,
    business: { name: booking.business.name, address: a.location?.address ?? '' },
    lang: locale,
    onLang: (code: string) => {
      rememberLocale(code);
      router.refresh();
    },
  };
  const rebook = () => router.push(`/r/${encodeURIComponent(slug)}`);
  const phone = booking.business.phone ? phoneText(booking.business.phone) : null;
  const call = () => {
    if (booking.business.phone) window.location.assign(`tel:${booking.business.phone}`);
  };

  const loadDay = async (d: string) => {
    setDate(d);
    setSlot(null);
    const r = await readManagedSlots({ slug, token, from: d, to: addDays(d, 1) });
    setSlots(r.ok ? (r.days.find((x) => x.date === d)?.slots ?? []) : []);
  };
  const pick = async (time: string) => {
    const s = slots.find((x) => x.time === time) ?? null;
    setSlot(s);
    setExpired(null);
    if (!s) return;
    const r = await startManagedMoveAction({ slug, token, startsAt: s.startsAt });
    if (r.ok) setHold({ id: r.holdId, expiresAt: r.expiresAt, time: s.time });
    else {
      setHold(null);
      setSlot(null);
      void loadDay(date);
    }
  };

  // the states that stop online changes (the contract's judge)
  if (booking.state !== 'open' && view === 'overview') {
    const short = summary();
    if (booking.state === 'over' && a.status === 'in_progress')
      return (
        <ManageLink
          {...frame}
          kind="started"
          summary={short.slice(1, 4)}
          phone={phone}
          onCall={call}
        />
      );
    if (booking.state === 'over')
      return (
        <ManageStop
          {...frame}
          kind="done"
          v={{
            service: a.serviceName,
            member: a.staffDisplayName,
            when: `${dayLong(a.date, locale)}, ${a.time}`,
          }}
          onRebook={rebook}
        />
      );
    if (booking.state === 'cancelled')
      return (
        <ManageStop
          {...frame}
          kind="cancelled"
          v={{ date: dayLong(a.date, locale) }}
          summary={short}
          onRebook={rebook}
        />
      );
    if (booking.state === 'too_late')
      return (
        <ManageStop
          {...frame}
          kind="tooLate"
          v={{
            when: `${dayLong(a.date, locale)}, ${a.time}`,
            hours: String(booking.policy.onlineCutoffHours),
            phone: phone ?? '',
          }}
          summary={short}
          phone={phone}
          onCall={call}
        />
      );
    return (
      <ManageStop
        {...frame}
        kind="closed"
        v={{ business: booking.business.name, phone: phone ?? '' }}
        summary={short}
        phone={phone}
        onCall={call}
      />
    );
  }

  if (view === 'move') {
    return (
      <ManageMove
        {...frame}
        summary={summary()}
        member={a.staffDisplayName}
        from={whenShort(a.date, a.time, locale)}
        picker={{
          date,
          today: booking.today,
          days: stripDays(booking.today, 5).map((d) => ({ date: d, label: stripLabel(d, locale) })),
          isDisabled: (d) => d > addDays(booking.today, 29),
          onDate: (d) => void loadDay(d),
        }}
        slots={slots.map((x) => ({ time: x.time, available: x.available }))}
        time={slot?.time ?? null}
        onTime={(time) => void pick(time)}
        held={hold && holdLeft > 0 ? { time: hold.time, left: leftOf(hold.expiresAt, now) } : null}
        expired={hold && holdLeft <= 0 ? { time: hold.time } : expired ? { time: expired } : null}
        deposit={deposit}
        submitWhen={hold && slot ? whenShort(date, slot.time, locale) : null}
        busy={busy}
        onBack={() => setView('overview')}
        onSubmit={async () => {
          if (!hold) return;
          setBusy(true);
          const r = await confirmManagedMoveAction({ slug, token, holdId: hold.id });
          setBusy(false);
          if (r.ok) return setView('moved');
          if (r.error === 'expired') {
            setExpired(hold.time);
            setHold(null);
          }
        }}
      />
    );
  }
  if (view === 'cancel') {
    return (
      <ManageCancel
        {...frame}
        service={a.serviceName}
        member={a.staffDisplayName}
        when={`${dayLong(a.date, locale)}, ${a.time}`}
        hours={booking.policy.freeCancelHours}
        late={booking.cancelLate}
        deposit={deposit}
        busy={busy}
        onKeep={() => setView('overview')}
        onSubmit={async () => {
          setBusy(true);
          const r = await cancelManagedBookingAction({ slug, token });
          setBusy(false);
          if (r.ok) setView('cancelled');
        }}
      />
    );
  }
  if (view === 'moved' && slot) {
    return (
      <ManageFinal
        {...frame}
        kind="moved"
        when={`${dayLong(date, locale)}, ${slot.time}`}
        onAddCal={() =>
          downloadIcs(
            'programare.ics',
            icsOf({
              uid: `${crypto.randomUUID()}@ventora-hub.com`,
              title: `${a.serviceName} · ${booking.business.name}`,
              startsAt: slot.startsAt,
              endsAt: new Date(
                Date.parse(slot.startsAt) + a.durationMinutes * 60_000,
              ).toISOString(),
              location: a.location?.address ?? null,
              now: new Date().toISOString(),
            }),
          )
        }
        summary={summary(whenShort(date, slot.time, locale))}
      />
    );
  }
  if (view === 'cancelled') {
    return (
      <ManageFinal
        {...frame}
        kind="cancelled"
        when={`${dayLong(a.date, locale)}, ${a.time}`}
        refund={null}
        onRebook={rebook}
      />
    );
  }
  return (
    <ManageOverview
      {...frame}
      summary={summary()}
      status={a.status === 'unconfirmed' ? 'unconfirmed' : 'confirmed'}
      policy={{
        freeUntil: `${dayLong(booking.policy.freeUntil.date, locale)}, ${booking.policy.freeUntil.time}`,
        hours: booking.policy.freeCancelHours,
        late: deposit ? { kind: 'deposit', amount: deposit } : null,
        onlineHours: booking.policy.onlineCutoffHours,
      }}
      onMove={
        booking.canMove
          ? () => {
              setView('move');
              void loadDay(a.date);
            }
          : undefined
      }
      onCancel={booking.canCancel ? () => setView('cancel') : undefined}
    />
  );
}
