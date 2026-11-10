'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { DialogTrigger } from '@ventora/ui';
import {
  BookingSettingsHeader,
  BookingTeamView,
  ExceptionDialog,
  SettingsToast,
  StaffScheduleDrawer,
  TimeOffDialog,
  WEEKDAYS,
  businessOf,
  dayForm,
  dayInput,
  leaveDays,
  validateDay,
  validateTimeOff,
  validateWeek,
  weekdayOfDate,
  type DayError,
  type DayForm,
  type WeekForm,
} from '@ventora/booking/ui';
import {
  cancelTimeOff,
  readMemberSchedule,
  readTeamPage,
  removeDayOverride,
  saveDayOverride,
  saveTimeOff,
  saveWeeklyHours,
  type MemberScheduleData,
  type TeamActionError,
  type TeamPageData,
} from '@/server/booking-team-actions';
import { useMode } from './useMode';

/* Lot B.2-UI — EasyBook · Setări · „Programul echipei” (BookingTeamSchedule, S124): the state and
   the actions of the page. The screen is in modules/booking/src/ui (the same components as the
   gallery); every write goes through the server actions, which call the B.2 contracts. Nothing
   here cancels an appointment (S124); the appointments in a day or a leave come with B.4. */

type DrawerState = {
  memberId: string;
  name: string;
  week: WeekForm;
  errors: Record<number, DayError>;
  schedule: MemberScheduleData | null;
  busy: boolean;
};
type DialogState =
  | {
      kind: 'exception';
      memberId: string;
      name: string;
      date: string;
      day: DayForm;
      error: DayError | null;
      busy: boolean;
    }
  | {
      kind: 'leave';
      memberId: string;
      name: string;
      timeOffId: string | null;
      from: string;
      to: string;
      reason: string;
      error: ReturnType<typeof validateTimeOff>;
      busy: boolean;
    };
type ToastState = { title: string; tone: 'done' | 'danger' };

const SCHEDULE_REASONS = new Set(['order', 'overlap', 'before_open', 'after_close']);

/** An InvalidInput of a schedule („invalid:days.4.intervals:before_open”) → the day's error. */
function serverDayError(error: TeamActionError): { weekday: number | null; err: DayError } | null {
  if (!error.startsWith('invalid:')) return null;
  const [, field = '', reason = ''] = error.split(':');
  const m = /^days\.(\d)/.exec(field);
  const code = SCHEDULE_REASONS.has(reason) ? (reason as DayError['code']) : 'invalid';
  const at = code === 'after_close' || code === 'order' ? 'to' : 'from';
  return { weekday: m ? Number(m[1]) : null, err: { i: 0, at, code } };
}

export function TeamScreen({ initial }: { initial: TeamPageData }) {
  const t = useTranslations('booking.team');
  const ui = useTranslations('ui');
  const locale = useLocale();
  const router = useRouter();
  const mode = useMode();
  const [data, setData] = useState(initial);
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const reload = async () => {
    const page = await readTeamPage();
    if (page.kind === 'ok') setData(page.data);
    else router.refresh();
  };
  const fail = (error: TeamActionError, name?: string) => {
    if (error === 'forbidden' || error === 'not_found' || error === 'removed') void reload();
    setToast({
      tone: 'danger',
      title: error === 'removed' && name ? t('err.removed', { name }) : t('err.failed'),
    });
  };
  const refreshSchedule = async (memberId: string) => {
    const res = await readMemberSchedule(memberId);
    if (res.ok) {
      setDrawer((d) => (d && d.memberId === memberId ? { ...d, schedule: res.value } : d));
    }
  };

  const memberById = (id: string) => data.members.find((m) => m.id === id);
  const sinceFmt = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: data.timeZone,
  });

  // ── the Drawer: the week, the exceptions, the leaves ──────────────────────────────────────
  const openDrawer = async (id: string) => {
    const m = memberById(id);
    if (!m) return;
    const week: WeekForm = {};
    for (const w of WEEKDAYS) {
      const d = m.week.find((x) => x.weekday === w);
      week[w] = dayForm({
        isWorking: !!d && d.intervals.length > 0,
        intervals: d?.intervals ?? [],
      });
    }
    setDrawer({ memberId: id, name: m.name, week, errors: {}, schedule: null, busy: false });
    const res = await readMemberSchedule(id);
    if (!res.ok) {
      setDrawer(null);
      return fail(res.error, m.name);
    }
    setDrawer((d) => (d && d.memberId === id ? { ...d, schedule: res.value } : d));
  };
  const saveWeek = async () => {
    if (!drawer) return;
    const errors = validateWeek(drawer.week, data.business);
    if (Object.keys(errors).length > 0) return setDrawer({ ...drawer, errors });
    setDrawer({ ...drawer, errors: {}, busy: true });
    const days = WEEKDAYS.map((w) => ({
      weekday: w,
      ...dayInput(
        businessOf(data.business, w)
          ? (drawer.week[w] ?? { on: false, intervals: [] })
          : { on: false, intervals: [] },
      ),
    }));
    const res = await saveWeeklyHours(drawer.memberId, days);
    if (!res.ok) {
      const day = serverDayError(res.error);
      if (day && day.weekday) {
        return setDrawer({ ...drawer, busy: false, errors: { [day.weekday]: day.err } });
      }
      setDrawer({ ...drawer, busy: false });
      return fail(res.error, drawer.name);
    }
    setDrawer(null);
    setToast({ tone: 'done', title: t('saved') });
    await reload();
  };

  // ── the exception on a date ───────────────────────────────────────────────────────────────
  const openException = (memberId: string, overrideId?: string) => {
    const m = memberById(memberId);
    if (!m) return;
    const o = overrideId ? drawer?.schedule?.overrides.find((x) => x.id === overrideId) : undefined;
    setDialog({
      kind: 'exception',
      memberId,
      name: m.name,
      date: o?.date ?? data.today,
      day: o ? dayForm(o) : { on: false, intervals: [] },
      error: null,
      busy: false,
    });
  };
  const submitException = async (st: Extract<DialogState, { kind: 'exception' }>) => {
    const bounds = businessOf(data.business, weekdayOfDate(st.date));
    const error = validateDay(st.day, bounds);
    if (error) return setDialog({ ...st, error });
    setDialog({ ...st, error: null, busy: true });
    const res = await saveDayOverride(st.memberId, st.date, dayInput(st.day));
    if (!res.ok) {
      const day = serverDayError(res.error);
      if (day) return setDialog({ ...st, busy: false, error: day.err });
      setDialog(null);
      return fail(res.error, st.name);
    }
    setDialog(null);
    setToast({ tone: 'done', title: t('saved') });
    await Promise.all([refreshSchedule(st.memberId), reload()]);
  };
  const removeException = async (id: string) => {
    if (!drawer) return;
    const res = await removeDayOverride(id);
    if (!res.ok) return fail(res.error, drawer.name);
    await Promise.all([refreshSchedule(drawer.memberId), reload()]);
  };

  // ── the leave ─────────────────────────────────────────────────────────────────────────────
  const openLeave = (memberId: string, timeOffId?: string) => {
    const m = memberById(memberId);
    if (!m) return;
    const l = timeOffId ? drawer?.schedule?.timeOff.find((x) => x.id === timeOffId) : undefined;
    setDialog({
      kind: 'leave',
      memberId,
      name: m.name,
      timeOffId: l?.id ?? null,
      from: l?.startsOn ?? data.today,
      to: l?.endsOn ?? data.today,
      reason: l?.reason ?? '',
      error: null,
      busy: false,
    });
  };
  const submitLeave = async (st: Extract<DialogState, { kind: 'leave' }>) => {
    const error = validateTimeOff(st.from, st.to);
    if (error) return setDialog({ ...st, error });
    setDialog({ ...st, error: null, busy: true });
    // C1: someone who does not see the reason never sends it (the saved one stays)
    const res = await saveTimeOff(st.memberId, st.timeOffId, {
      startsOn: st.from,
      endsOn: st.to,
      ...(data.canSeeReason ? { reason: st.reason.trim() || null } : {}),
    });
    if (!res.ok) {
      if (res.error.startsWith('invalid:') && res.error.endsWith(':leave_order')) {
        return setDialog({ ...st, busy: false, error: { field: 'endsOn', code: 'leave_order' } });
      }
      setDialog(null);
      return fail(res.error, st.name);
    }
    setDialog(null);
    setToast({ tone: 'done', title: t('saved') });
    await Promise.all([refreshSchedule(st.memberId), reload()]);
  };
  const cancelLeave = async (id: string) => {
    if (!drawer) return;
    const res = await cancelTimeOff(id);
    if (!res.ok) return fail(res.error, drawer.name);
    await Promise.all([refreshSchedule(drawer.memberId), reload()]);
  };

  return (
    <>
      <BookingSettingsHeader
        mode={mode}
        tab="team"
        description={t('lead')}
        onTabChange={(tab) => {
          if (tab !== 'team') router.push(`/booking/settings/${tab}`);
        }}
      />
      <BookingTeamView
        mode={mode}
        business={data.business}
        members={data.members}
        removed={data.removed.map((r) => ({
          id: r.id,
          name: r.name,
          since: sinceFmt.format(new Date(r.archivedAt)),
          past: null,
        }))}
        onEdit={(id) => void openDrawer(id)}
        onException={(id) => openException(id)}
        onLeave={(id) => openLeave(id)}
        onBusinessEdit={() => router.push('/booking/settings/general')}
        onBookings={() => router.push('/booking/appointments')}
        onOpenTeam={() => router.push('/admin/team')}
      />

      {drawer && (
        <StaffScheduleDrawer
          mode={mode}
          isOpen
          name={drawer.name}
          business={data.business}
          week={drawer.week}
          onWeekChange={(week) => setDrawer({ ...drawer, week, errors: {} })}
          errors={drawer.errors}
          overrides={drawer.schedule?.overrides ?? []}
          timeOff={drawer.schedule?.timeOff ?? []}
          canSeeReason={data.canSeeReason}
          busy={drawer.busy}
          onSave={saveWeek}
          onCancel={() => setDrawer(null)}
          onAddException={() => openException(drawer.memberId)}
          onEditException={(id) => openException(drawer.memberId, id)}
          onRemoveException={removeException}
          onAddLeave={() => openLeave(drawer.memberId)}
          onEditLeave={(id) => openLeave(drawer.memberId, id)}
          onCancelLeave={cancelLeave}
        />
      )}

      <DialogTrigger isOpen={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog?.kind === 'exception' ? (
          <ExceptionDialog
            mode={mode}
            name={dialog.name}
            date={dialog.date}
            today={data.today}
            onDateChange={(date) => setDialog({ ...dialog, date, error: null })}
            day={dialog.day}
            onDayChange={(day) => setDialog({ ...dialog, day, error: null })}
            bounds={businessOf(data.business, weekdayOfDate(dialog.date))}
            weekday={weekdayOfDate(dialog.date)}
            error={dialog.error}
            busy={dialog.busy}
            onSubmit={() => submitException(dialog)}
            onCancel={() => setDialog(null)}
          />
        ) : dialog?.kind === 'leave' ? (
          <TimeOffDialog
            mode={mode}
            name={dialog.name}
            from={dialog.from}
            to={dialog.to}
            today={data.today}
            onFromChange={(from) => setDialog({ ...dialog, from, error: null })}
            onToChange={(to) => setDialog({ ...dialog, to, error: null })}
            canSeeReason={data.canSeeReason}
            reason={dialog.reason}
            onReasonChange={(reason) => setDialog({ ...dialog, reason })}
            error={dialog.error}
            days={leaveDays(dialog.from, dialog.to)}
            busy={dialog.busy}
            onSubmit={() => submitLeave(dialog)}
            onCancel={() => setDialog(null)}
          />
        ) : (
          <span />
        )}
      </DialogTrigger>

      {toast && (
        <SettingsToast
          mode={mode}
          tone={toast.tone}
          title={toast.title}
          onDismiss={() => setToast(null)}
          dismissLabel={ui('close')}
        />
      )}
    </>
  );
}
