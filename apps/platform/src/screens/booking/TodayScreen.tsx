'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  BookingTodayView,
  SettingsToast,
  type TodayAttention,
  type TodayCurrent,
  type TodayNext,
} from '@ventora/booking/ui';
import {
  completeTodayAppointment,
  confirmTodayAppointment,
  type TodayAppointmentData,
  type TodayPageData,
} from '@/server/booking-today-actions';
import type { GrowthSlotView } from '@/server/growth-slot';
import { GrowthRecommendation } from '../growth/GrowthRecommendation';
import { useMode } from './useMode';

/* Lot B.6b — EasyBook · „Azi” (BookingToday): the state and the actions of the page. The screen is
   in modules/booking/src/ui (the same component as the gallery). The quick actions confirm with a
   Toast and „Anulează” (the design): the change is written when the Toast closes without
   „Anulează”, because a confirmation cannot be taken back (B.4a). „Încasează” and a click on an
   appointment open its detail (BookingDetail / BookingPayments, Decision 7, screens 3 and 5). */

const UNDO_MS = 5000;
const min = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const partOf = (now: string): 'morning' | 'day' | 'evening' => {
  const h = Number(now.slice(0, 2));
  return h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 18 ? 'day' : 'evening';
};
const continueHref = (v: GrowthSlotView) =>
  v.app ? `/applications/${v.app}` : v.kind === 'addon' ? '/admin/plan' : '/catalog';

type Pending = { id: string; kind: 'confirm' | 'complete'; client: string; started: boolean };

export function TodayScreen({ initial, userName }: { initial: TodayPageData; userName: string }) {
  const router = useRouter();
  const mode = useMode();
  const t = useTranslations('booking.today');
  // the page's data; router.refresh() brings it again after a change
  const data = initial;
  const [staffFilter, setStaffFilter] = useState('all');
  const [pending, setPending] = useState<Pending | null>(null);
  const [toast, setToast] = useState<{
    title: string;
    tone: 'done' | 'danger';
    undo?: boolean;
  } | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const staffName = new Map(data.staff.map((m) => [m.id, firstName(m.name)]));
  const now = data.now;
  const shown = (a: TodayAppointmentData): TodayAppointmentData =>
    pending?.id === a.id
      ? { ...a, status: pending.kind === 'confirm' ? 'confirmed' : 'completed' }
      : a;
  const appointments = data.appointments.map(shown);
  const holding = appointments.filter((a) => a.status !== 'cancelled' && a.status !== 'no_show');

  const current: TodayCurrent[] = holding
    .filter(
      (a) =>
        a.status === 'in_progress' || (a.status === 'confirmed' && a.start <= now && a.end > now),
    )
    .map((a) => {
      const span = Math.max(1, min(a.end) - min(a.start));
      const done = Math.min(span, Math.max(0, min(now) - min(a.start)));
      return {
        id: a.id,
        client: a.client,
        service: a.service,
        staff: staffName.get(a.staffId) ?? '',
        start: a.start,
        end: a.end,
        progress: Math.round((done / span) * 100),
        leftMin: span - done,
      };
    });
  const upcoming = holding.find(
    (a) => a.start > now && a.status !== 'completed' && a.status !== 'in_progress',
  );
  const next: TodayNext | null = upcoming
    ? {
        client: upcoming.client,
        service: upcoming.service,
        staff: staffName.get(upcoming.staffId) ?? '',
        time: upcoming.start,
        inMin: min(upcoming.start) - min(now),
      }
    : null;

  const attention: TodayAttention[] = [
    ...data.unconfirmed
      .filter((a) => pending?.id !== a.id)
      .map((a): TodayAttention => ({
        kind: 'unconfirmed',
        id: a.id,
        client: a.client,
        time: a.start,
        service: a.service,
        staff: staffName.get(a.staffId) ?? '',
        inMin: min(a.start) - min(now),
        second: a.phone ? 'call' : undefined,
      })),
    ...data.unpaid.map((u): TodayAttention => ({
      kind: 'unpaid',
      id: u.id,
      client: u.client,
      amountMinor: u.amountMinor,
      currency: u.currency,
      visitDate: u.visitDate,
    })),
  ];
  const waiting = holding.filter((a) => a.status === 'unconfirmed').length;

  const commit = async (p: Pending) => {
    const res =
      p.kind === 'confirm'
        ? await confirmTodayAppointment(p.id)
        : await completeTodayAppointment(p.id, p.started);
    setPending(null);
    if (!res.ok) setToast({ tone: 'danger', title: t('toast.failed') });
    router.refresh();
  };
  const quick = (p: Pending) => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      if (pending) void commit(pending);
    }
    setPending(p);
    setToast({
      tone: 'done',
      undo: true,
      title: t(p.kind === 'confirm' ? 'toast.confirmed' : 'toast.completed', { client: p.client }),
    });
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setToast(null);
      void commit(p);
    }, UNDO_MS);
  };
  const undo = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setPending(null);
    setToast({ tone: 'done', title: t('toast.undone') });
  };
  const byId = (id: string) => data.appointments.find((a) => a.id === id);
  const detail = (id: string) => router.push(`/booking/appointments/${id}`);

  return (
    <>
      <BookingTodayView
        mode={mode}
        name={firstName(userName)}
        part={partOf(now)}
        today={data.today}
        count={holding.length}
        waiting={waiting}
        free={data.free}
        next={next}
        current={current}
        attention={attention}
        attentionTotal={attention.length}
        onSeeAll={() => router.push('/booking/appointments')}
        agenda={appointments.map((a) => ({
          id: a.id,
          staffId: a.staffId,
          start: a.start,
          end: a.end,
          title: a.client,
          subtitle: a.service,
          staff: staffName.get(a.staffId),
          status:
            a.status === 'completed'
              ? 'done'
              : a.status === 'cancelled'
                ? 'cancelled'
                : a.status === 'no_show'
                  ? 'noshow'
                  : a.status === 'confirmed' || a.status === 'in_progress'
                    ? 'confirmed'
                    : 'unconfirmed',
        }))}
        staff={data.staff.map((m) => ({ id: m.id, label: firstName(m.name) }))}
        staffFilter={staffFilter}
        onStaffFilter={setStaffFilter}
        now={now}
        onSelect={(item) => detail(String(item.id))}
        onConfirm={
          data.canWrite
            ? (id) => quick({ id, kind: 'confirm', client: byId(id)?.client ?? '', started: false })
            : undefined
        }
        onCall={(id) => {
          const phone = data.unconfirmed.find((a) => a.id === id)?.phone;
          if (phone) window.location.href = `tel:${phone.replace(/\s+/g, '')}`;
        }}
        onCollect={data.canWrite ? detail : undefined}
        onComplete={
          data.canWrite
            ? (id) =>
                quick({
                  id,
                  kind: 'complete',
                  client: byId(id)?.client ?? '',
                  started: byId(id)?.status === 'in_progress',
                })
            : undefined
        }
        growth={
          data.growth ? (
            <GrowthRecommendation
              view={data.growth}
              role={data.role}
              onContinue={(v) => router.push(continueHref(v))}
            />
          ) : null
        }
      />
      {toast && (
        <SettingsToast
          mode={mode}
          tone={toast.tone}
          title={toast.title}
          onDismiss={() => setToast(null)}
          dismissLabel={t('toast.close')}
          action={toast.undo ? { label: t('toast.undo'), onClick: undo } : undefined}
        />
      )}
    </>
  );
}
