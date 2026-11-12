'use client';

import type { ReactNode } from 'react';
import {
  Button,
  IconButton,
  Notice,
  PageHeader,
  Schedule,
  SegmentedControl,
  Select,
  type ScheduleColumn,
  type ScheduleEvent,
} from '@ventora/ui';
import type { ScreenMode } from '../services/BookingServicesView';
import type { CalendarView } from './calendar-format';
import { useCalendarTexts } from './calendar-texts';
import s from './calendar.module.css';

/* BookingCalendar (B.6a, preview.html of BookingCalendar): the calendar with Schedule — the day of one
   member (the member picked above the grid on tablets and phones), the week, and „Resurse” (one
   column per member). Date navigation, „Azi”, „Primul loc liber” and the view switch sit above the
   grid; the grid scrolls inside itself. Only props: the page of the application and the gallery
   draw this same component. */

export type StaffOption = { value: string; label: string; description?: string };

export type FirstFreeResult = {
  /** „Următorul loc liber: joi, 14:30, la Ioana.” */
  title: string;
  /** „Pentru Tratament facial (45 min). Mara și Radu nu au loc joi.” */
  body: string;
  onBook?: () => void;
  onSearchMore?: () => void;
};

export type BookingCalendarViewProps = {
  mode: ScreenMode;
  view: CalendarView;
  onViewChange?: (view: CalendarView) => void;
  /** The day shown („YYYY-MM-DD”); in the week view, any day of the week. */
  date: string;
  /** Under the title (not on phones): the day's summary, or what „Primul loc liber” looks for. */
  description?: string;
  columns: ScheduleColumn[];
  events: ScheduleEvent[];
  from: number;
  to: number;
  /** The business's time now („11:20”), only when the shown day (week) holds today. */
  now?: string;
  /** Week view: the full line only in today's column. */
  nowColumn?: string;
  height: number | string;
  minColumnWidth?: number;
  activeId?: string;
  /** The member picker of the day view (tablets and phones). */
  staffOptions?: StaffOption[];
  staffId?: string;
  onStaffChange?: (id: string) => void;
  onPrev?: () => void;
  onToday?: () => void;
  onNext?: () => void;
  /** „Primul loc liber”; hidden while a result is shown. */
  onFirstFree?: () => void;
  firstFree?: FirstFreeResult | null;
  onEventClick?: (event: ScheduleEvent) => void;
  onSlotClick?: (columnId: string, time: string) => void;
  /** A Notice above the grid (a load error, nobody in the calendar). */
  notice?: ReactNode;
};

export function BookingCalendarView({
  mode,
  view,
  onViewChange,
  date,
  description,
  columns,
  events,
  from,
  to,
  now,
  nowColumn,
  height,
  minColumnWidth,
  activeId,
  staffOptions,
  staffId,
  onStaffChange,
  onPrev,
  onToday,
  onNext,
  onFirstFree,
  firstFree,
  onEventClick,
  onSlotClick,
  notice,
}: BookingCalendarViewProps) {
  const c = useCalendarTexts();
  const { t } = c;
  const mobile = mode === 'mobile';
  const week = view === 'week';
  const dateText = week ? c.weekRange(date) : mobile ? c.dateShort(date) : c.dateLong(date);
  const showFirstFree = !firstFree && onFirstFree !== undefined;

  const bar = (
    <div className={s.calbar}>
      <div className={s.nav}>
        <IconButton
          icon="chevron-left"
          label={t(week ? 'prevWeek' : 'prevDay')}
          variant="secondary"
          onPress={onPrev}
        />
        <Button onPress={onToday}>{t('today')}</Button>
        <IconButton
          icon="chevron-right"
          label={t(week ? 'nextWeek' : 'nextDay')}
          variant="secondary"
          onPress={onNext}
        />
        {showFirstFree && !mobile && (
          <Button variant="quiet" icon="search" onPress={onFirstFree}>
            {t('firstFree')}
          </Button>
        )}
        <span className={`heading ${s.date}`}>{dateText}</span>
      </div>
      <SegmentedControl
        aria-label={t('viewLabel')}
        value={view}
        onChange={(v) => onViewChange?.(v as CalendarView)}
        size={mobile ? 'sm' : 'md'}
        options={[
          { value: 'day', label: t('view.day') },
          { value: 'week', label: t('view.week') },
          { value: 'res', label: t('view.res') },
        ]}
      />
    </div>
  );

  const picker = view === 'day' &&
    mode !== 'desktop' &&
    staffOptions &&
    staffOptions.length > 0 && (
      <div className={s.staffpick}>
        <Select
          aria-label={t('staffPick')}
          value={staffId}
          onChange={onStaffChange}
          options={staffOptions}
        />
      </div>
    );

  return (
    <>
      <PageHeader
        title={t('title')}
        description={mobile ? undefined : description}
        actions={
          mobile && showFirstFree ? (
            <Button size="sm" variant="secondary" icon="search" onPress={onFirstFree}>
              {t('firstFree')}
            </Button>
          ) : null
        }
      />
      <div className={mobile ? s.mobile : undefined}>
        {notice}
        {firstFree && (
          <div className={s.notice}>
            <Notice
              tone="neutral"
              icon="search"
              title={firstFree.title}
              actions={
                <>
                  <Button size="sm" variant="primary" icon="check" onPress={firstFree.onBook}>
                    {t('ff.book')}
                  </Button>
                  <Button size="sm" variant="quiet" onPress={firstFree.onSearchMore}>
                    {t('ff.more')}
                  </Button>
                </>
              }
            >
              {firstFree.body}
            </Notice>
          </div>
        )}
        {bar}
        {picker}
        <Schedule
          columns={columns}
          events={events}
          from={from}
          to={to}
          now={now}
          nowColumn={nowColumn}
          height={height}
          minColumnWidth={minColumnWidth}
          activeId={activeId}
          onEventClick={onEventClick}
          onSlotClick={onSlotClick}
          statusLabels={c.statusLabels()}
        />
      </div>
    </>
  );
}
