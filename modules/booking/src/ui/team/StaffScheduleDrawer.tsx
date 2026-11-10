'use client';

import { useTranslations } from 'next-intl';
import {
  Button,
  DataTable,
  Drawer,
  Notice,
  Toggle,
  type DataTableAction,
  type DataTableColumn,
} from '@ventora/ui';
import { useTableLabels } from '../services/texts';
import type { ScreenMode } from '../services/BookingServicesView';
import {
  breakOf,
  businessOf,
  defaultDay,
  intervalText,
  leaveDays,
  minToTime,
  secondInterval,
  WEEKDAYS,
  type BusinessDayData,
  type DayError,
  type DayForm,
  type IntervalData,
  type WeekForm,
} from './team-format';
import { useTeamTexts, type TeamTexts } from './team-texts';
import { dayErrorText, ErrorLine, Interval, type Bounds } from './TeamParts';
import sv from '../services/services.module.css';
import s from './team.module.css';

/* BookingTeamSchedule (S124): a member's schedule in a Drawer (full screen on a phone) — the week
   (at most two intervals a day, inside the business's hours), the exceptions on a date and the
   leaves. Controlled: the page keeps the week and its errors; `framed` draws it in a gallery frame. */

export type OverrideRow = {
  id: string;
  date: string;
  isWorking: boolean;
  intervals: IntervalData[];
};
export type TimeOffRow = { id: string; startsOn: string; endsOn: string; reason: string | null };

export type StaffScheduleDrawerProps = {
  mode: ScreenMode;
  name: string;
  business: readonly BusinessDayData[];
  week: WeekForm;
  onWeekChange?: (week: WeekForm) => void;
  errors?: Record<number, DayError>;
  overrides: OverrideRow[];
  timeOff: TimeOffRow[];
  /** S124: the reason of a leave only for the owner and the admins. */
  canSeeReason: boolean;
  busy?: boolean;
  onSave?: () => void;
  onCancel?: () => void;
  onAddException?: () => void;
  onEditException?: (id: string) => void;
  onRemoveException?: (id: string) => void;
  onAddLeave?: () => void;
  onEditLeave?: (id: string) => void;
  onCancelLeave?: (id: string) => void;
  framed?: boolean;
  isOpen?: boolean;
};

function DayRow({
  x,
  weekday,
  day,
  bounds,
  mob,
  error,
  onChange,
}: {
  x: TeamTexts;
  weekday: number;
  day: DayForm;
  bounds: Bounds;
  mob: boolean;
  error?: DayError;
  onChange: (day: DayForm) => void;
}) {
  const { t } = x;
  const brk = !error ? breakOf(day) : null;
  const meta = bounds
    ? [
        brk ? t('week.break', brk) : null,
        t('week.businessDay', {
          from: minToTime(bounds.opensAtMin),
          to: minToTime(bounds.closesAtMin),
        }),
      ]
        .filter(Boolean)
        .join(' · ')
    : null;
  return (
    <div className={`${s.day} ${mob ? s.m : ''} ${bounds ? '' : s.closed}`}>
      <div className={s.dayhead}>
        <Toggle
          isSelected={day.on && !!bounds}
          isDisabled={!bounds}
          onChange={(on) => onChange(on ? defaultDay(bounds) : { on: false, intervals: [] })}
        >
          {x.dayLabel(weekday)}
        </Toggle>
      </div>
      <div className={s.daybody}>
        {!bounds ? (
          <span className="body-small muted">{t('week.closed')}</span>
        ) : !day.on ? (
          <span className="body-small muted">{t('week.dayOff')}</span>
        ) : (
          <>
            <div className={s.ivs}>
              {day.intervals.map((iv, i) => (
                <Interval
                  key={i}
                  value={iv}
                  bounds={bounds}
                  error={error && error.i === i ? error : null}
                  removable={i === 1}
                  removeLabel={t('week.removeInterval')}
                  onChange={(v) =>
                    onChange({
                      ...day,
                      intervals: day.intervals.map((old, j) => (j === i ? v : old)),
                    })
                  }
                  onRemove={() => onChange({ ...day, intervals: day.intervals.slice(0, 1) })}
                />
              ))}
              {day.intervals.length < 2 ? (
                <Button
                  size="sm"
                  variant="quiet"
                  icon="plus"
                  onPress={() => onChange(secondInterval(day, bounds))}
                >
                  {t('week.addInterval')}
                </Button>
              ) : null}
            </div>
            {error ? <ErrorLine text={dayErrorText(x, error, weekday, bounds)} /> : null}
          </>
        )}
        {meta ? <p className={`caption muted ${s.meta}`}>{meta}</p> : null}
      </div>
    </div>
  );
}

export function StaffScheduleDrawer(p: StaffScheduleDrawerProps) {
  const x = useTeamTexts();
  const { t } = x;
  const ui = useTranslations('ui');
  const labels = useTableLabels();
  const mob = p.mode === 'mobile';
  const errors = p.errors ?? {};
  const errorDays = Object.keys(errors).length;

  const excColumns: DataTableColumn<OverrideRow>[] = [
    { key: 'date', header: t('exc.date'), primary: true, render: (r) => x.dateLong(r.date) },
    {
      key: 'what',
      header: t('exc.kind'),
      secondary: true,
      render: (r) => (r.isWorking ? r.intervals.map(intervalText).join(', ') : t('exc.off')),
    },
  ];
  const excActions = (r: OverrideRow): DataTableAction[] => [
    { label: t('exc.edit'), icon: 'pencil', onClick: () => p.onEditException?.(r.id) },
    { separator: true },
    {
      label: t('exc.remove'),
      icon: 'trash-2',
      destructive: true,
      onClick: () => p.onRemoveException?.(r.id),
    },
  ];
  const leaveColumns: DataTableColumn<TimeOffRow>[] = [
    {
      key: 'when',
      header: `${t('leave.from')} – ${t('leave.to')}`,
      primary: true,
      render: (r) => x.rangeLong(r.startsOn, r.endsOn),
    },
    {
      key: 'days',
      header: '',
      secondary: true,
      render: (r) => x.leaveDays(leaveDays(r.startsOn, r.endsOn)),
    },
    ...(p.canSeeReason
      ? [
          {
            key: 'reason',
            header: t('leave.reason'),
            secondary: true,
            render: (r: TimeOffRow) => r.reason ?? '',
          },
        ]
      : []),
  ];
  const leaveActions = (r: TimeOffRow): DataTableAction[] => [
    { label: t('exc.edit'), icon: 'pencil', onClick: () => p.onEditLeave?.(r.id) },
    { separator: true },
    {
      label: t('leave.cancel'),
      icon: 'x',
      destructive: true,
      onClick: () => p.onCancelLeave?.(r.id),
    },
  ];

  const footer = (
    <div className={`${sv.foot} ${mob ? sv.m : ''}`}>
      <span className={sv.grow} />
      <Button variant="quiet" onPress={p.onCancel}>
        {t('cancel')}
      </Button>
      <Button variant="primary" icon="check" onPress={p.onSave} isPending={p.busy}>
        {t('save')}
      </Button>
    </div>
  );

  return (
    <Drawer
      contained={p.framed}
      isOpen={p.framed ? undefined : p.isOpen}
      onOpenChange={(o) => !o && p.onCancel?.()}
      onClose={p.onCancel}
      layout={mob ? 'full' : 'auto'}
      width={640}
      title={p.name}
      subtitle={t('drawer.subtitle')}
      closeLabel={ui('close')}
      backLabel={ui('back')}
      footer={footer}
    >
      <div className={`${sv.stack} ${s.drawer}`}>
        {errorDays > 0 ? (
          <Notice
            className={sv.notice}
            tone="danger"
            icon="circle-alert"
            title={t('err.summary', { n: errorDays })}
          />
        ) : null}
        <section className={s.sec}>
          <h3 className="subheading">{t('week.title')}</h3>
          <p className="body-small muted">{t('week.lead')}</p>
          <div className={s.week}>
            {WEEKDAYS.map((w) => (
              <DayRow
                key={w}
                x={x}
                weekday={w}
                day={p.week[w] ?? { on: false, intervals: [] }}
                bounds={businessOf(p.business, w)}
                mob={mob}
                error={errors[w]}
                onChange={(day) => p.onWeekChange?.({ ...p.week, [w]: day })}
              />
            ))}
          </div>
        </section>
        <section className={s.sec}>
          <div className={s.sechead}>
            <div>
              <h3 className="subheading">{t('exc.title')}</h3>
              <p className="body-small muted">{t('exc.lead')}</p>
            </div>
            <Button size="sm" icon="plus" onPress={p.onAddException}>
              {t('exc.add')}
            </Button>
          </div>
          {p.overrides.length > 0 ? (
            <DataTable
              caption={t('exc.title')}
              columns={excColumns}
              rows={p.overrides}
              rowActions={excActions}
              labels={labels}
            />
          ) : (
            <p className="body-small muted">{t('exc.empty')}</p>
          )}
        </section>
        <section className={s.sec}>
          <div className={s.sechead}>
            <div>
              <h3 className="subheading">{t('leave.title')}</h3>
              <p className="body-small muted">{t('leave.lead')}</p>
            </div>
            <Button size="sm" icon="plus" onPress={p.onAddLeave}>
              {t('leave.add')}
            </Button>
          </div>
          {p.timeOff.length > 0 ? (
            <DataTable
              caption={t('leave.title')}
              columns={leaveColumns}
              rows={p.timeOff}
              rowActions={leaveActions}
              labels={labels}
            />
          ) : (
            <p className="body-small muted">{t('leave.empty')}</p>
          )}
        </section>
      </div>
    </Drawer>
  );
}
