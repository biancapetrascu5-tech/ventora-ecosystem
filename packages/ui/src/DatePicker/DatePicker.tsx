'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '../lib/cn';
import { Icon } from '../Icon/Icon';
import styles from './DatePicker.module.css';

// Locale-aware day/month labels (Romanian defaults)
const DAYS_SHORT = ['Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm', 'Dum'];
const MONTHS = [
  'Ianuarie',
  'Februarie',
  'Martie',
  'Aprilie',
  'Mai',
  'Iunie',
  'Iulie',
  'August',
  'Septembrie',
  'Octombrie',
  'Noiembrie',
  'Decembrie',
];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function formatDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDisplay(d: Date) {
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function parseDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function daysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Returns 0=Mon..6=Sun for a given date
function weekdayMon(d: Date) {
  return (d.getDay() + 6) % 7;
}

interface CalendarGridProps {
  viewing: Date;
  selected?: Date | null;
  rangeStart?: Date | null;
  rangeEnd?: Date | null;
  today: Date;
  min?: Date;
  max?: Date;
  isDisabled?: (d: Date) => boolean;
  mode: 'single' | 'range';
  hovered?: Date | null;
  onHover?: (d: Date | null) => void;
  onSelect: (d: Date) => void;
}

function CalendarGrid({
  viewing,
  selected,
  rangeStart,
  rangeEnd,
  today,
  min,
  max,
  isDisabled,
  mode,
  hovered,
  onHover,
  onSelect,
}: CalendarGridProps) {
  const first = startOfMonth(viewing);
  const totalDays = daysInMonth(viewing);
  const startOffset = weekdayMon(first);
  const cells: (Date | null)[] = Array(startOffset).fill(null);
  for (let i = 1; i <= totalDays; i++) {
    cells.push(new Date(viewing.getFullYear(), viewing.getMonth(), i));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const inRange = (d: Date) => {
    const s = rangeStart;
    const e = rangeEnd ?? hovered;
    if (!s || !e) return false;
    const lo = s <= e ? s : e;
    const hi = s <= e ? e : s;
    return d >= lo && d <= hi;
  };

  return (
    <div
      className={styles.grid}
      role="grid"
      aria-label={`${MONTHS[viewing.getMonth()]} ${viewing.getFullYear()}`}
    >
      <div className={styles.weekdays} role="row">
        {DAYS_SHORT.map((d) => (
          <div key={d} className={styles.weekday} role="columnheader" aria-label={d}>
            {d}
          </div>
        ))}
      </div>
      {Array.from({ length: cells.length / 7 }, (_, wi) => (
        <div key={wi} className={styles.week} role="row">
          {cells.slice(wi * 7, wi * 7 + 7).map((d, di) => {
            if (!d) {
              return <div key={`e${di}`} className={styles.dayEmpty} role="gridcell" aria-hidden />;
            }
            const disabled = !!(
              (min && d < min) ||
              (max && d > max) ||
              (isDisabled && isDisabled(d))
            );
            const isToday = isSameDay(d, today);
            const isSel = selected
              ? isSameDay(d, selected)
              : rangeStart
                ? isSameDay(d, rangeStart)
                : false;
            const isRangeEnd = rangeEnd ? isSameDay(d, rangeEnd) : false;
            const isInRange = mode === 'range' && inRange(d);

            return (
              <button
                key={d.getDate()}
                type="button"
                role="gridcell"
                aria-label={`${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`}
                aria-pressed={isSel || isRangeEnd}
                aria-disabled={disabled}
                disabled={disabled}
                className={cn(
                  styles.day,
                  isToday && styles.today,
                  (isSel || isRangeEnd) && styles.selected,
                  isInRange && !isSel && !isRangeEnd && styles.inRange,
                )}
                onMouseEnter={() => onHover?.(d)}
                onMouseLeave={() => onHover?.(null)}
                onClick={() => !disabled && onSelect(d)}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export type DatePickerMode = 'date' | 'range' | 'time';

export interface DatePickerProps {
  mode?: DatePickerMode;
  today?: Date;
  value?: Date | [Date, Date] | string;
  defaultValue?: Date | [Date, Date] | string;
  onChange?: (value: Date | [Date, Date] | string | null) => void;
  defaultOpen?: boolean;
  min?: Date;
  max?: Date;
  isDisabled?: (d: Date) => boolean;
  disabled?: boolean;
  required?: boolean;
  size?: 'sm' | 'md';
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function DatePicker({
  mode = 'date',
  today: todayProp,
  value: valueProp,
  defaultValue,
  onChange,
  defaultOpen = false,
  min,
  max,
  isDisabled: isDisabledFn,
  disabled = false,
  required,
  size = 'md',
  placeholder,
  className,
  style,
}: DatePickerProps) {
  const today = todayProp ?? new Date();
  const controlled = valueProp !== undefined;

  const toInternal = (v: typeof defaultValue) => {
    if (!v) return null;
    if (mode === 'time') return typeof v === 'string' ? v : null;
    if (mode === 'range') {
      if (Array.isArray(v)) return v as [Date, Date];
      return null;
    }
    if (v instanceof Date) return v;
    if (typeof v === 'string') return parseDate(v);
    return null;
  };

  const [internalValue, setInternalValue] = useState<Date | [Date, Date] | string | null>(() =>
    toInternal(defaultValue),
  );
  const [open, setOpen] = useState(defaultOpen);
  const [viewing, setViewing] = useState<Date>(() => {
    const init = toInternal(defaultValue ?? valueProp);
    if (init instanceof Date) return startOfMonth(init);
    if (Array.isArray(init)) return startOfMonth(init[0]);
    return startOfMonth(today);
  });
  const [rangeStep, setRangeStep] = useState<'start' | 'end'>('start');
  const [rangeStart, setRangeStart] = useState<Date | null>(null);
  const [hovered, setHovered] = useState<Date | null>(null);
  const [timeValue, setTimeValue] = useState<string>(() => {
    const init = toInternal(defaultValue ?? valueProp);
    return typeof init === 'string' ? init : '';
  });

  const currentValue = controlled ? toInternal(valueProp) : internalValue;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (
        !popoverRef.current?.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handle(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open, close]);

  const commit = useCallback(
    (v: Date | [Date, Date] | string | null) => {
      if (!controlled) setInternalValue(v);
      onChange?.(v);
    },
    [controlled, onChange],
  );

  const handleSelectDate = (d: Date) => {
    if (mode === 'range') {
      if (rangeStep === 'start' || !rangeStart) {
        setRangeStart(d);
        setRangeStep('end');
      } else {
        const s = rangeStart <= d ? rangeStart : d;
        const e = rangeStart <= d ? d : rangeStart;
        commit([s, e]);
        setRangeStart(null);
        setRangeStep('start');
        setOpen(false);
      }
    } else {
      commit(d);
      setOpen(false);
    }
  };

  const displayText = () => {
    if (mode === 'time') return timeValue || '';
    if (mode === 'range') {
      if (Array.isArray(currentValue)) {
        return `${formatDisplay(currentValue[0])} – ${formatDisplay(currentValue[1])}`;
      }
      if (rangeStart) return `${formatDisplay(rangeStart)} – …`;
      return '';
    }
    if (currentValue instanceof Date) return formatDisplay(currentValue);
    return '';
  };

  const prevMonth = () => setViewing((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1));
  const nextMonth = () => setViewing((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1));

  const inputValue = displayText();
  const ph =
    placeholder ??
    (mode === 'time' ? 'HH:MM' : mode === 'range' ? 'De la – Până la' : 'ZZ Lună AAAA');

  if (mode === 'time') {
    return (
      <input
        type="time"
        value={timeValue}
        onChange={(e) => {
          setTimeValue(e.target.value);
          if (!controlled) setInternalValue(e.target.value);
          onChange?.(e.target.value);
        }}
        disabled={disabled}
        required={required}
        className={cn(styles.timeInput, size === 'sm' && styles.sm, className)}
        style={style}
      />
    );
  }

  return (
    <div className={cn(styles.root, className)} style={style}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(styles.trigger, size === 'sm' && styles.sm)}
        onClick={() => !disabled && setOpen((o) => !o)}
      >
        <span className={cn(styles.triggerText, !inputValue && styles.placeholder)}>
          {inputValue || ph}
        </span>
        <Icon icon="calendar" size="sm" aria-hidden className={styles.triggerIcon} />
      </button>

      {open && (
        <div ref={popoverRef} className={styles.popover} role="dialog" aria-modal>
          <div className={styles.calNav}>
            <button
              type="button"
              className={styles.navBtn}
              onClick={prevMonth}
              aria-label="Luna anterioară"
            >
              <Icon icon="chevron-left" size="sm" aria-hidden />
            </button>
            <span className={styles.calTitle}>
              {MONTHS[viewing.getMonth()]} {viewing.getFullYear()}
            </span>
            <button
              type="button"
              className={styles.navBtn}
              onClick={nextMonth}
              aria-label="Luna următoare"
            >
              <Icon icon="chevron-right" size="sm" aria-hidden />
            </button>
          </div>

          <CalendarGrid
            viewing={viewing}
            selected={mode === 'date' ? (currentValue instanceof Date ? currentValue : null) : null}
            rangeStart={
              mode === 'range' ? (Array.isArray(currentValue) ? currentValue[0] : rangeStart) : null
            }
            rangeEnd={mode === 'range' && Array.isArray(currentValue) ? currentValue[1] : null}
            today={today}
            min={min}
            max={max}
            isDisabled={isDisabledFn}
            mode={mode === 'range' ? 'range' : ('single' as const)}
            hovered={hovered}
            onHover={setHovered}
            onSelect={handleSelectDate}
          />

          {mode === 'date' && (
            <div className={styles.calFooter}>
              <button
                type="button"
                className={styles.todayBtn}
                onClick={() => {
                  commit(today);
                  setViewing(startOfMonth(today));
                  setOpen(false);
                }}
              >
                Azi
              </button>
              <button type="button" className={styles.closeBtn} onClick={close}>
                Închide
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Hidden native input for form compatibility
export function DatePickerField({
  name,
  value,
  required,
}: {
  name?: string;
  value?: Date | null;
  required?: boolean;
}) {
  return (
    <input
      type="hidden"
      name={name}
      value={value ? formatDate(value) : ''}
      required={required}
      aria-hidden
    />
  );
}
