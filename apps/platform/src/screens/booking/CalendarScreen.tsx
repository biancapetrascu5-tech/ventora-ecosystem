'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button, DialogTrigger, Notice, type ScheduleColumn } from '@ventora/ui';
import {
  BookingCalendarView,
  FirstFreeDialog,
  activeCount,
  addDays,
  dayColumn,
  gridHours,
  stepDate,
  toEvents,
  useCalendarTexts,
  weekDays,
  weekdayOf,
  type CalendarBlock,
  type CalendarView,
  type FirstFreeResult,
  CalendarHint,
} from '@ventora/booking/ui';
import {
  readCalendarRange,
  readFirstFree,
  type CalendarPageData,
  type CalendarRangeData,
} from '@/server/booking-calendar-actions';
import { useMode } from './useMode';
import hs from './calendar-screen.module.css';

const HINT_KEY = 'ventora.booking.calendarHint';

/* Lot B.6a — EasyBook · Calendar (BookingCalendar): the state and the reads of the page. The screen
   is in modules/booking/src/ui (the same component as the gallery). A click on an appointment
   opens its detail and a click on a free slot opens a new appointment there: both routes come with
   their screens (BookingDetail, BookingNew; Decision 7, screens 2 and 3). */

const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

export function CalendarScreen({ initial }: { initial: CalendarPageData }) {
  const router = useRouter();
  const mode = useMode();
  const c = useCalendarTexts();
  const roles = useTranslations('roles');
  const { t } = c;

  const [view, setView] = useState<CalendarView | null>(null);
  const shown: CalendarView = view ?? (mode === 'desktop' ? 'res' : 'day');
  const [date, setDate] = useState(initial.today);
  const [staffId, setStaffId] = useState(initial.staff[0]?.id);
  const [range, setRange] = useState<CalendarRangeData>(initial.week);
  const [clock, setClock] = useState({ today: initial.today, now: initial.now });
  const [failed, setFailed] = useState(false);
  const [picking, setPicking] = useState(false);
  const [serviceId, setServiceId] = useState(initial.services[0]?.id);
  const [searching, setSearching] = useState(false);
  // the first-use hint, until „Am înțeles” (per viewer, in this browser)
  const [hint, setHint] = useState(false);
  useEffect(() => {
    queueMicrotask(() => {
      try {
        setHint(window.localStorage.getItem(HINT_KEY) !== '1');
      } catch {
        setHint(true);
      }
    });
  }, []);
  const dismissHint = () => {
    setHint(false);
    try {
      window.localStorage.setItem(HINT_KEY, '1');
    } catch {
      // private window or blocked storage: the hint just comes back next time
    }
  };
  const [found, setFound] = useState<{
    serviceId: string;
    date: string;
    time: string;
    staffId: string;
    staffName: string;
    busy: string[];
    minutes: number;
  } | null>(null);
  const [none, setNone] = useState<string | null>(null);
  const asked = useRef(0);

  const days = shown === 'week' ? weekDays(date) : [date];
  const key = `${days[0]}:${days[days.length - 1]}`;

  // read the shown days when they are not the ones already in hand
  useEffect(() => {
    const [from, to] = key.split(':') as [string, string];
    if (range.days[0] === from && range.days[range.days.length - 1] === to && !failed) return;
    if (range.days.includes(from) && range.days.includes(to) && !failed) return;
    const n = ++asked.current;
    void readCalendarRange(from, to).then((r) => {
      if (n !== asked.current) return;
      if (!r.ok) {
        setFailed(true);
        return;
      }
      setFailed(false);
      setRange(r.value);
      setClock({ today: r.value.today, now: r.value.now });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const retry = () => {
    const [from, to] = key.split(':') as [string, string];
    void readCalendarRange(from, to).then((r) => {
      if (!r.ok) return;
      setFailed(false);
      setRange(r.value);
      setClock({ today: r.value.today, now: r.value.now });
    });
  };

  const openOf = (iso: string) =>
    initial.business.find((b) => b.weekday === weekdayOf(iso))?.open ?? null;
  const staffById = useMemo(() => new Map(initial.staff.map((m) => [m.id, m])), [initial.staff]);
  const dayAppointments = range.appointments.filter((a) => a.date === date);
  const blockTitle = (b: CalendarBlock) => b.reason ?? t('block.default');
  const closed = (iso: string) => (openOf(iso) ? undefined : t('closedDay'));

  let columns: ScheduleColumn[];
  let columnOf: (item: { staffId: string; date: string }) => string | null;
  let minColumnWidth: number | undefined;
  if (shown === 'week') {
    columns = days.map((d) => ({
      id: dayColumn(d),
      label: c.dayColumnLabel(d),
      today: d === clock.today,
      closed: closed(d),
    }));
    // the whole team, side by side inside each day (preview.html BK_WEEK)
    columnOf = (x) =>
      staffById.has(x.staffId) && days.includes(x.date) ? dayColumn(x.date) : null;
    minColumnWidth = mode === 'desktop' ? 120 : 100;
  } else if (shown === 'res') {
    columns = initial.staff.map((m) => ({
      id: m.id,
      label: m.name,
      sub: roles.has(m.role) ? roles(m.role) : m.role,
      closed: closed(date),
    }));
    columnOf = (x) => (x.date === date && staffById.has(x.staffId) ? x.staffId : null);
  } else {
    const m = staffId ? staffById.get(staffId) : undefined;
    columns = m
      ? [
          {
            id: m.id,
            label: m.name,
            sub: c.daySub(
              roles.has(m.role) ? roles(m.role) : m.role,
              activeCount(dayAppointments.filter((a) => a.staffId === m.id)),
            ),
            person: m.name,
            closed: closed(date),
          },
        ]
      : [];
    columnOf = (x) => (x.date === date && x.staffId === m?.id ? x.staffId : null);
    minColumnWidth = 200;
  }
  const events = toEvents(range.appointments, range.blocks, columnOf, blockTitle);
  const hours = gridHours(
    days
      .map(openOf)
      .filter((o): o is { from: string; to: string } => o !== null)
      .reduce<{ from: string; to: string } | null>(
        (acc, o) =>
          acc
            ? { from: o.from < acc.from ? o.from : acc.from, to: o.to > acc.to ? o.to : acc.to }
            : o,
        null,
      ),
  );
  const holdsToday = days.includes(clock.today);
  const height = mode === 'desktop' ? 700 : mode === 'tablet' ? 980 : 1000;

  const service = initial.services.find((s) => s.id === (found?.serviceId ?? serviceId));
  const search = (from?: string) => {
    if (!serviceId) return;
    setSearching(true);
    void readFirstFree(serviceId, from).then((r) => {
      setSearching(false);
      setPicking(false);
      if (!r.ok) {
        setFailed(true);
        return;
      }
      if (!r.value) {
        setFound(null);
        setNone(serviceId);
        return;
      }
      setNone(null);
      setFound({
        serviceId,
        date: r.value.date,
        time: r.value.time,
        staffId: r.value.staffId,
        staffName: r.value.staffName,
        busy: r.value.busyStaffIds,
        minutes: r.value.minutes,
      });
      setDate(r.value.date);
      setStaffId(r.value.staffId);
    });
  };

  let firstFree: FirstFreeResult | null = null;
  if (found && service) {
    const weekday = c.weekdayInText(found.date);
    const busy = found.busy
      .filter((id) => id !== found.staffId)
      .map((id) => staffById.get(id)?.name)
      .filter((n): n is string => !!n)
      .map(firstName);
    const forText = t('ff.for', { service: service.name, minutes: found.minutes });
    firstFree = {
      title: t('ff.found', { weekday, time: found.time, staff: firstName(found.staffName) }),
      body:
        busy.length === 0
          ? forText
          : `${forText} ${t(busy.length === 1 ? 'ff.otherBusy' : 'ff.othersBusy', {
              names: c.names(busy),
              weekday,
            })}`,
      onBook: () =>
        router.push(
          `/booking/new?service=${found.serviceId}&staff=${found.staffId}&date=${found.date}&time=${found.time}`,
        ),
      onSearchMore: () => {
        if (found.date >= addDays(clock.today, 61)) return;
        search(addDays(found.date, 1));
      },
    };
  }

  let notice = null;
  if (hint && !failed && shown !== 'week' && initial.staff.length > 0) {
    // BookingStates „Calendar · indiciu la prima folosire”
    notice = <CalendarHint className={hs.hint} onDismiss={dismissHint} />;
  }
  if (failed) {
    notice = (
      <Notice
        tone="danger"
        title={t('err.load')}
        actions={
          <Button size="sm" variant="secondary" onPress={retry}>
            {t('err.retry')}
          </Button>
        }
      />
    );
  } else if (initial.staff.length === 0) {
    notice = <Notice tone="neutral" title={t('empty')} />;
  } else if (none) {
    const s = initial.services.find((x) => x.id === none);
    notice = (
      <Notice tone="neutral" icon="search" title={t('ff.none', { service: s?.name ?? '' })} />
    );
  }

  const move = (dir: -1 | 1) => {
    setFound(null);
    setNone(null);
    setDate((d) => stepDate(d, shown, dir));
  };

  return (
    <>
      <BookingCalendarView
        mode={mode}
        view={shown}
        onViewChange={(v) => setView(v)}
        date={date}
        description={
          found && service
            ? t('ff.desc', { service: service.name })
            : c.summary({
                appointments: activeCount(dayAppointments),
                staff: initial.staff.length,
                isToday: date === clock.today,
                open: openOf(date),
              })
        }
        columns={columns}
        events={events}
        from={hours.from}
        to={hours.to}
        now={holdsToday ? clock.now : undefined}
        nowColumn={shown === 'week' && holdsToday ? dayColumn(clock.today) : undefined}
        height={shown === 'day' ? height - 60 : height}
        minColumnWidth={minColumnWidth}
        staffOptions={initial.staff.map((m) => ({
          value: m.id,
          label: m.name,
          description: roles.has(m.role) ? roles(m.role) : m.role,
        }))}
        staffId={staffId}
        onStaffChange={setStaffId}
        onPrev={() => move(-1)}
        onToday={() => {
          setFound(null);
          setNone(null);
          setDate(clock.today);
        }}
        onNext={() => move(1)}
        onFirstFree={initial.services.length > 0 ? () => setPicking(true) : undefined}
        firstFree={firstFree}
        onEventClick={(e) => {
          if (e.id.startsWith('block:')) return;
          router.push(`/booking/appointments/${e.id}`);
        }}
        onSlotClick={
          shown === 'week'
            ? undefined
            : (col, time) => router.push(`/booking/new?staff=${col}&date=${date}&time=${time}`)
        }
        notice={notice}
      />
      <DialogTrigger isOpen={picking} onOpenChange={(o) => !o && setPicking(false)}>
        {picking ? (
          <FirstFreeDialog
            mode={mode}
            services={initial.services.map((s) => ({ value: s.id, label: s.name }))}
            serviceId={serviceId}
            onServiceChange={setServiceId}
            onSearch={() => search()}
            onCancel={() => setPicking(false)}
            busy={searching}
          />
        ) : (
          <span />
        )}
      </DialogTrigger>
    </>
  );
}
