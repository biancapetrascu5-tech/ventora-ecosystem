'use client';

import { useTranslations } from 'next-intl';
import {
  Button,
  DatePicker,
  Dialog,
  FormField,
  Input,
  Notice,
  SegmentedControl,
} from '@ventora/ui';
import type { ScreenMode } from '../services/BookingServicesView';
import {
  breakOf,
  localDate,
  minToTime,
  pickerDate,
  secondInterval,
  TEAM_LIMITS,
  type DayError,
  type DayForm,
} from './team-format';
import { useTeamTexts } from './team-texts';
import { dayErrorText, ErrorLine, Interval, type Bounds } from './TeamParts';
import sv from '../services/services.module.css';
import s from './team.module.css';

/* BookingTeamSchedule (S124): the exception on a date and the leave. Plain Dialogs: in the
   application the page puts them in a DialogTrigger; in the gallery `framed` draws them inline.
   On a phone a dialog is a bottom sheet. The appointments in that day or period (the peach Notice)
   come with B.4: until then only the gallery passes them. */

type Common = { mode: ScreenMode; framed?: boolean; onCancel?: () => void; busy?: boolean };

function common(p: Common) {
  return { inline: p.framed, sheet: p.mode === 'mobile', onClose: p.onCancel };
}

function Footer({ p, save }: { p: Common & { onSubmit?: () => void }; save: string }) {
  const x = useTeamTexts();
  return (
    <>
      <Button variant="quiet" onPress={p.onCancel}>
        {x.t('cancel')}
      </Button>
      <Button variant="primary" icon="check" onPress={p.onSubmit} isPending={p.busy}>
        {save}
      </Button>
    </>
  );
}

/** B.4: the appointments in the day / period of an exception or a leave. */
export type BookingsInRange = { count: number; date?: string; from?: string; to?: string };

export function ExceptionDialog(
  p: Common & {
    name: string;
    /** „YYYY-MM-DD” */
    date: string;
    today: string;
    onDateChange?: (date: string) => void;
    day: DayForm;
    onDayChange?: (day: DayForm) => void;
    /** That day's business hours (null: the business is closed). */
    bounds: Bounds;
    weekday: number;
    error?: DayError | null;
    bookings?: BookingsInRange | null;
    onBookings?: () => void;
    onSubmit?: () => void;
  },
) {
  const x = useTeamTexts();
  const { t } = x;
  const ui = useTranslations('ui');
  const other = p.day.on;
  const brk = !p.error ? breakOf(p.day) : null;
  const meta = p.bounds
    ? [
        brk ? t('week.break', brk) : null,
        t('week.businessDay', {
          from: minToTime(p.bounds.opensAtMin),
          to: minToTime(p.bounds.closesAtMin),
        }),
      ]
        .filter(Boolean)
        .join(' · ')
    : t('week.closed');
  const bookingsTitle = p.bookings
    ? p.bookings.count === 1
      ? t('exc.bookingsOne', { name: p.name, date: p.bookings.date ?? '' })
      : t('exc.bookingsMany', { name: p.name, n: p.bookings.count, date: p.bookings.date ?? '' })
    : null;
  return (
    <Dialog
      {...common(p)}
      closeLabel={ui('close')}
      title={t('exc.dialogTitle')}
      description={t('exc.dialogLead', { name: p.name })}
      footer={<Footer p={p} save={t('exc.save')} />}
    >
      <div className={sv.stack}>
        <FormField label={t('exc.date')} required>
          <DatePicker
            value={pickerDate(p.date)}
            today={pickerDate(p.today) ?? undefined}
            locale={x.locale}
            onChange={(v) => v instanceof Date && p.onDateChange?.(localDate(v))}
          />
        </FormField>
        <div className={s.start}>
          <SegmentedControl
            aria-label={t('exc.kind')}
            value={other ? 'other' : 'off'}
            onChange={(v) =>
              p.onDayChange?.(
                v === 'other'
                  ? {
                      on: true,
                      intervals: p.bounds
                        ? [
                            {
                              from: minToTime(p.bounds.opensAtMin),
                              to: minToTime(p.bounds.closesAtMin),
                            },
                          ]
                        : [{ from: '09:00', to: '17:00' }],
                    }
                  : { on: false, intervals: [] },
              )
            }
            options={[
              { value: 'off', label: t('exc.off') },
              { value: 'other', label: t('exc.other') },
            ]}
          />
        </div>
        {other ? (
          <div className={sv.stack}>
            <div className={s.ivs}>
              {p.day.intervals.map((iv, i) => (
                <Interval
                  key={i}
                  value={iv}
                  bounds={p.bounds}
                  error={p.error && p.error.i === i ? p.error : null}
                  removable={i === 1}
                  removeLabel={t('week.removeInterval')}
                  onChange={(v) =>
                    p.onDayChange?.({
                      ...p.day,
                      intervals: p.day.intervals.map((old, j) => (j === i ? v : old)),
                    })
                  }
                  onRemove={() =>
                    p.onDayChange?.({ ...p.day, intervals: p.day.intervals.slice(0, 1) })
                  }
                />
              ))}
              {p.day.intervals.length < 2 ? (
                <Button
                  size="sm"
                  variant="quiet"
                  icon="plus"
                  onPress={() => p.onDayChange?.(secondInterval(p.day, p.bounds))}
                >
                  {t('week.addInterval')}
                </Button>
              ) : null}
            </div>
            {p.error ? <ErrorLine text={dayErrorText(x, p.error, p.weekday, p.bounds)} /> : null}
            <p className="caption muted">{meta}</p>
          </div>
        ) : null}
        {!other && bookingsTitle ? (
          <Notice
            className={sv.notice}
            tone="attention"
            icon="calendar-clock"
            title={bookingsTitle}
          >
            <Button size="sm" variant="secondary" icon="arrow-right" onPress={p.onBookings}>
              {t('inactive.future.action')}
            </Button>
          </Notice>
        ) : null}
      </div>
    </Dialog>
  );
}

export function TimeOffDialog(
  p: Common & {
    name: string;
    from: string;
    to: string;
    today: string;
    onFromChange?: (d: string) => void;
    onToChange?: (d: string) => void;
    /** Only the owner and the admins see and write the reason (S124, C1). */
    canSeeReason: boolean;
    reason: string;
    onReasonChange?: (r: string) => void;
    error?: { field: 'startsOn' | 'endsOn'; code: 'required' | 'leave_order' | 'too_long' } | null;
    days: number;
    bookings?: BookingsInRange | null;
    onBookings?: () => void;
    onSubmit?: () => void;
  },
) {
  const x = useTeamTexts();
  const { t } = x;
  const ui = useTranslations('ui');
  const mob = p.mode === 'mobile';
  const fromError = p.error?.field === 'startsOn' ? t('err.leaveFrom') : undefined;
  const toError =
    p.error?.field === 'endsOn'
      ? p.error.code === 'leave_order'
        ? t('err.leaveOrder')
        : t('err.failed')
      : undefined;
  return (
    <Dialog
      {...common(p)}
      closeLabel={ui('close')}
      title={t('leave.dialogTitle')}
      description={p.name}
      footer={<Footer p={p} save={t('leave.save')} />}
    >
      <div className={sv.stack}>
        <div className={`${sv.g2f} ${mob ? sv.m : ''}`}>
          <FormField label={t('leave.from')} required error={fromError}>
            <DatePicker
              value={pickerDate(p.from)}
              today={pickerDate(p.today) ?? undefined}
              locale={x.locale}
              invalid={!!fromError}
              onChange={(v) => v instanceof Date && p.onFromChange?.(localDate(v))}
            />
          </FormField>
          <FormField label={t('leave.to')} required error={toError}>
            <DatePicker
              value={pickerDate(p.to)}
              today={pickerDate(p.today) ?? undefined}
              locale={x.locale}
              invalid={!!toError}
              onChange={(v) => v instanceof Date && p.onToChange?.(localDate(v))}
            />
          </FormField>
        </div>
        {!p.error && p.days > 0 ? <p className="caption muted">{x.leaveDays(p.days)}</p> : null}
        {p.canSeeReason ? (
          <FormField
            label={t('leave.reason')}
            isOptional
            optionalLabel={ui('optional')}
            hint={t('leave.reasonHelp')}
          >
            <Input
              value={p.reason}
              maxLength={TEAM_LIMITS.reason}
              onChange={(e) => p.onReasonChange?.(e.target.value)}
            />
          </FormField>
        ) : null}
        {!p.error && p.bookings ? (
          <Notice
            className={sv.notice}
            tone="attention"
            icon="calendar-clock"
            title={t('leave.bookingsMany', {
              name: p.name,
              n: p.bookings.count,
              from: p.bookings.from ?? '',
              to: p.bookings.to ?? '',
            })}
          >
            <Button size="sm" variant="secondary" icon="arrow-right" onPress={p.onBookings}>
              {t('inactive.future.action')}
            </Button>
          </Notice>
        ) : null}
      </div>
    </Dialog>
  );
}
