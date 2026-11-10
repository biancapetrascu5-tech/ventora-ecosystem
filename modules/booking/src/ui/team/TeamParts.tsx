'use client';

import { DatePicker, Icon, IconButton } from '@ventora/ui';
import { minToTime, TEAM_LIMITS, type DayError } from './team-format';
import type { TeamTexts } from './team-texts';
import s from './team.module.css';

/* BookingTeamSchedule (S124): the pieces shared by the Drawer and the exception dialog
   (preview.html Time, Interval, the error line). */

const DASH = '–';

export type Bounds = { opensAtMin: number; closesAtMin: number } | null;

function Time({
  value,
  bad,
  bounds,
  onChange,
}: {
  value: string;
  bad?: boolean;
  bounds: Bounds;
  onChange?: (v: string) => void;
}) {
  return (
    <div className={s.time}>
      <DatePicker
        mode="time"
        size="sm"
        value={value}
        invalid={bad}
        step={TEAM_LIMITS.step}
        timeFrom={bounds ? minToTime(bounds.opensAtMin) : undefined}
        timeTo={bounds ? minToTime(bounds.closesAtMin) : undefined}
        onChange={(v) => typeof v === 'string' && onChange?.(v)}
      />
    </div>
  );
}

export function Interval({
  value,
  error,
  bounds,
  removable,
  removeLabel,
  onChange,
  onRemove,
}: {
  value: { from: string; to: string };
  error?: DayError | null;
  bounds: Bounds;
  removable?: boolean;
  removeLabel: string;
  onChange?: (v: { from: string; to: string }) => void;
  onRemove?: () => void;
}) {
  return (
    <div className={s.iv}>
      <span className={s.ivfield}>
        <Time
          value={value.from}
          bad={error?.at === 'from'}
          bounds={bounds}
          onChange={(from) => onChange?.({ ...value, from })}
        />
        <span className="muted" aria-hidden>
          {DASH}
        </span>
        <Time
          value={value.to}
          bad={error?.at === 'to'}
          bounds={bounds}
          onChange={(to) => onChange?.({ ...value, to })}
        />
      </span>
      {removable ? <IconButton icon="x" size="sm" label={removeLabel} onPress={onRemove} /> : null}
    </div>
  );
}

/** The text of a day's error (err.beforeOpen / err.afterClose name the day and the hour). */
export function dayErrorText(x: TeamTexts, err: DayError, weekday: number, bounds: Bounds): string {
  if (err.code === 'before_open' && bounds) {
    return x.t('err.beforeOpen', { day: x.dayLong(weekday), time: minToTime(bounds.opensAtMin) });
  }
  if (err.code === 'after_close' && bounds) {
    return x.t('err.afterClose', { day: x.dayLong(weekday), time: minToTime(bounds.closesAtMin) });
  }
  if (err.code === 'overlap') return x.t('err.overlap');
  if (!bounds) return x.t('week.closed');
  return x.t('err.order');
}

export function ErrorLine({ text }: { text: string }) {
  return (
    <p className={`${s.err} caption`} role="alert">
      <Icon icon="circle-alert" size={14} />
      {text}
    </p>
  );
}
