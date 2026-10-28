'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icon/Icon';
import { cn } from '../lib/cn';
import { forced, type ForcedState } from '../lib/forced';
import { ThemedPortal, useAnchor, useOutside } from '../lib/popover';
import control from '../Input/Input.module.css';
import select from '../Select/Select.module.css';
import styles from './DatePicker.module.css';

export type DatePickerMode = 'date' | 'range' | 'time';
export type DateRange = [Date | null, Date | null];
export type DatePickerValue = Date | DateRange | string | null;

export interface DatePickerLabels {
  /** S.chooseDate / S.chooseRange / S.chooseTime — textul gol al butonului. */
  chooseDate?: string;
  chooseRange?: string;
  chooseTime?: string;
  /** S.prevMonth / S.nextMonth — săgețile calendarului. */
  prevMonth?: string;
  nextMonth?: string;
  /** S.today — butonul din subsol. */
  today?: string;
  /** S.clearChoice — butonul din subsol când există o alegere. */
  clearChoice?: string;
}

/* Limbile platformei → localizarea Intl (LOCALES din bundle.js). */
const INTL: Record<string, string> = {
  ro: 'ro-RO',
  en: 'en-GB',
  fr: 'fr-FR',
  es: 'es-ES',
  de: 'de-DE',
  it: 'it-IT',
};
export const intlLocale = (code = 'ro') => INTL[code] ?? code;

const sameDay = (a?: Date | null, b?: Date | null) =>
  !!a &&
  !!b &&
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);

function monthGrid(view: Date) {
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

function timeSlots(step: number, from = '00:00', to = '23:59') {
  const toMin = (s: string) => {
    const [h, m] = s.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const out: string[] = [];
  for (let m = toMin(from); m <= toMin(to); m += step)
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  return out;
}

const cap = (s: string, loc: string) => s.charAt(0).toLocaleUpperCase(loc) + s.slice(1);

export interface CalendarProps {
  mode?: 'date' | 'range';
  value?: Date | DateRange | null;
  onChange?: (v: Date | DateRange) => void;
  min?: Date;
  max?: Date;
  isDisabled?: (d: Date) => boolean;
  today?: Date;
  initialMonth?: Date;
  locale?: string;
  labels?: Pick<DatePickerLabels, 'prevMonth' | 'nextMonth'>;
}

/* Calendar din bundle.js: lună cu săptămâna de luni, azi cu inel peach, interval cu fundal selected. */
export function Calendar({
  mode = 'date',
  value,
  onChange,
  min,
  max,
  isDisabled,
  today: todayProp,
  initialMonth,
  locale = 'ro',
  labels,
}: CalendarProps) {
  const loc = intlLocale(locale);
  const today = startOfDay(todayProp ?? new Date());
  const [a, b] = mode === 'range' ? ((value as DateRange | null) ?? [null, null]) : [null, null];
  const anchor = (mode === 'range' ? a : (value as Date | null)) ?? today;
  const start = initialMonth ?? anchor;
  const [view, setView] = useState(new Date(start.getFullYear(), start.getMonth(), 1));
  const [focus, setFocus] = useState(startOfDay(anchor));
  const [hover, setHover] = useState<Date | null>(null);
  const grid = useMemo(() => monthGrid(view), [view]);
  const gridRef = useRef<HTMLDivElement>(null);
  const monthFmt = new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric' });
  const dayFmt = new Intl.DateTimeFormat(loc, { weekday: 'short' });
  const fullFmt = new Intl.DateTimeFormat(loc, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    dayFmt.format(new Date(2024, 0, 1 + i)).replace('.', ''),
  );
  const disabled = (d: Date) =>
    (min && d < startOfDay(min)) || (max && d > startOfDay(max)) || isDisabled?.(d) || false;
  const rangeEnd = a && !b && hover ? hover : b;
  const inRange = (d: Date) =>
    !!a && !!rangeEnd && d > (a < rangeEnd ? a : rangeEnd) && d < (a < rangeEnd ? rangeEnd : a);
  const pick = (d: Date) => {
    if (disabled(d)) return;
    if (mode === 'range') onChange?.(!a || (a && b) ? [d, null] : d < a ? [d, a] : [a, d]);
    else onChange?.(d);
  };

  useEffect(() => {
    if (focus.getMonth() !== view.getMonth() || focus.getFullYear() !== view.getFullYear())
      setView(new Date(focus.getFullYear(), focus.getMonth(), 1));
    // doar când se mută focusul
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);
  useEffect(() => {
    const el = gridRef.current?.querySelector<HTMLElement>('[data-focus="true"]');
    if (el && gridRef.current?.contains(document.activeElement)) el.focus();
  }, [focus, view]);

  const onKey = (e: React.KeyboardEvent) => {
    const map: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (map[e.key] != null) {
      e.preventDefault();
      setFocus(addDays(focus, map[e.key]!));
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      const dm = e.key === 'PageUp' ? -1 : 1;
      setFocus(new Date(focus.getFullYear(), focus.getMonth() + dm, Math.min(focus.getDate(), 28)));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setFocus(addDays(focus, -((focus.getDay() + 6) % 7)));
    } else if (e.key === 'End') {
      e.preventDefault();
      setFocus(addDays(focus, 6 - ((focus.getDay() + 6) % 7)));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(focus);
    }
  };
  const title = monthFmt.format(view);

  return (
    <div className={styles.cal}>
      <div className={styles.head}>
        <button
          type="button"
          className={styles.nav}
          aria-label={labels?.prevMonth}
          title={labels?.prevMonth}
          onClick={() => setView(addMonths(view, -1))}
        >
          <Icon icon="chevron-left" size={16} />
        </button>
        <span className={cn(styles.title, 'subheading')} aria-live="polite">
          {cap(title, loc)}
        </span>
        <button
          type="button"
          className={styles.nav}
          aria-label={labels?.nextMonth}
          title={labels?.nextMonth}
          onClick={() => setView(addMonths(view, 1))}
        >
          <Icon icon="chevron-right" size={16} />
        </button>
      </div>
      <div role="grid" className={styles.grid} ref={gridRef} onKeyDown={onKey} aria-label={title}>
        <div role="row" className={styles.row}>
          {weekdays.map((w, i) => (
            <span role="columnheader" key={i} className={cn(styles.wd, 'caption')}>
              {cap(w, loc).slice(0, 3)}
            </span>
          ))}
        </div>
        {Array.from({ length: 6 }, (_, r) => (
          <div role="row" className={styles.row} key={r}>
            {grid.slice(r * 7, r * 7 + 7).map((d) => {
              const out = d.getMonth() !== view.getMonth();
              const sel =
                mode === 'range' ? sameDay(d, a) || sameDay(d, b) : sameDay(d, value as Date);
              const dis = disabled(d);
              const isFocus = sameDay(d, focus);
              const isToday = sameDay(d, today);
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  role="gridcell"
                  aria-selected={sel}
                  aria-disabled={dis || undefined}
                  aria-current={isToday ? 'date' : undefined}
                  aria-label={fullFmt.format(d)}
                  tabIndex={isFocus ? 0 : -1}
                  data-focus={isFocus}
                  className={cn(
                    styles.day,
                    'body',
                    out && styles.isOutside,
                    isToday && styles.isToday,
                    inRange(d) && styles.isInrange,
                    sel && styles.isSelected,
                    dis && styles.isDisabled,
                  )}
                  onClick={() => {
                    setFocus(d);
                    pick(d);
                  }}
                  onMouseEnter={() => mode === 'range' && setHover(d)}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export interface DatePickerProps {
  mode?: DatePickerMode;
  /** Ziua de azi (inelul peach); implicit data curentă. */
  today?: Date;
  value?: DatePickerValue;
  defaultValue?: DatePickerValue;
  onChange?: (value: DatePickerValue) => void;
  defaultOpen?: boolean;
  open?: boolean;
  min?: Date;
  max?: Date;
  /** Zilele care nu se pot alege. */
  isDisabled?: (d: Date) => boolean;
  disabled?: boolean;
  invalid?: boolean;
  required?: boolean;
  size?: 'sm' | 'md';
  placeholder?: string;
  /** Pasul listei de ore, în minute (mode="time"). */
  step?: number;
  timeFrom?: string;
  timeTo?: string;
  locale?: string;
  labels?: DatePickerLabels;
  /** Stare vizuală forțată (galerii, documentație). */
  state?: ForcedState;
  id?: string;
  'aria-describedby'?: string;
  className?: string;
  style?: React.CSSProperties;
}

/* DatePicker din bundle.js: buton .v-control.v-select cu iconiță calendar/ceas, listă în portal. */
export function DatePicker({
  mode = 'date',
  value,
  defaultValue,
  onChange,
  placeholder,
  min,
  max,
  isDisabled,
  step = 15,
  timeFrom = '07:00',
  timeTo = '21:00',
  invalid,
  disabled,
  size = 'md',
  id,
  state,
  className,
  style: styleProp,
  today,
  'aria-describedby': describedBy,
  required,
  open: openProp,
  defaultOpen = false,
  locale = 'ro',
  labels,
}: DatePickerProps) {
  const loc = intlLocale(locale);
  const [inner, setInner] = useState<DatePickerValue>(
    defaultValue !== undefined ? defaultValue : mode === 'range' ? [null, null] : null,
  );
  const v = value !== undefined ? value : inner;
  const set = (n: DatePickerValue) => {
    if (value === undefined) setInner(n);
    onChange?.(n);
  };
  const [openState, setOpen] = useState(defaultOpen);
  const open = openProp !== undefined ? openProp : openState;
  const btn = useRef<HTMLButtonElement>(null);
  const { popRef, style } = useAnchor(btn, open, { placement: 'bottom-start' });
  useOutside([btn, popRef], () => setOpen(false), open && openProp === undefined);

  useEffect(() => {
    if (!open || openProp !== undefined) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      btn.current?.focus();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [open, openProp]);

  const dfmt = new Intl.DateTimeFormat(loc, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const range = mode === 'range' ? ((v as DateRange | null) ?? [null, null]) : null;
  const label =
    mode === 'time'
      ? (v as string | null)
      : range
        ? range[0]
          ? `${dfmt.format(range[0])} – ${range[1] ? dfmt.format(range[1]) : '…'}`
          : null
        : v
          ? dfmt.format(v as Date)
          : null;
  const ph =
    placeholder ??
    (mode === 'time'
      ? labels?.chooseTime
      : mode === 'range'
        ? labels?.chooseRange
        : labels?.chooseDate);
  const slots = useMemo(() => timeSlots(step, timeFrom, timeTo), [step, timeFrom, timeTo]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && mode === 'time' && listRef.current) {
      listRef.current.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'center' });
    }
    // doar la deschidere
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const hasChoice = mode === 'range' ? !!range?.[0] : !!v;

  return (
    <>
      <button
        ref={btn}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-required={required || undefined}
        disabled={disabled}
        style={styleProp}
        className={cn(
          control.control,
          control[size],
          styles.trigger,
          invalid && control.isError,
          disabled && control.isDisabled,
          open && styles.isOpen,
          forced(control, state),
          className,
        )}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon icon={mode === 'time' ? 'clock' : 'calendar'} size={16} className={control.icon} />
        <span className={cn(select.triggerValue, 'body', !label && select.isPlaceholder)}>
          {label || ph}
        </span>
        <Icon
          icon="chevron-down"
          size={16}
          className={cn(select.triggerIcon, open && styles.chevOpen)}
        />
      </button>
      {open && (
        <ThemedPortal>
          <div
            ref={popRef}
            style={style}
            className={cn(styles.pop, mode === 'time' && styles.popTime)}
            role="dialog"
            aria-label={ph}
          >
            {mode === 'time' ? (
              <div
                className={styles.timelist}
                role="listbox"
                ref={listRef}
                aria-label={labels?.chooseTime}
              >
                {slots.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="option"
                    aria-selected={s === v}
                    className={cn(select.option, s === v && select.optionSelected)}
                    onClick={() => {
                      set(s);
                      setOpen(false);
                      btn.current?.focus();
                    }}
                  >
                    <span className="body">{s}</span>
                    {s === v && <Icon icon="check" size={16} className={select.optionTick} />}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <Calendar
                  mode={mode}
                  value={v as Date | DateRange | null}
                  today={today}
                  min={min}
                  max={max}
                  isDisabled={isDisabled}
                  locale={locale}
                  labels={labels}
                  onChange={(n) => {
                    set(n);
                    if (
                      (mode === 'date' || (mode === 'range' && (n as DateRange)[1])) &&
                      openProp === undefined
                    )
                      setOpen(false);
                  }}
                />
                <div className={styles.foot}>
                  <button
                    type="button"
                    className={styles.footBtn}
                    onClick={() => {
                      const d = startOfDay(today ?? new Date());
                      set(mode === 'range' ? [d, d] : d);
                      setOpen(false);
                    }}
                  >
                    <span className="body-strong">{labels?.today}</span>
                  </button>
                  {hasChoice && (
                    <button
                      type="button"
                      className={styles.footBtn}
                      onClick={() => set(mode === 'range' ? [null, null] : null)}
                    >
                      <span className="body-strong">{labels?.clearChoice}</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </ThemedPortal>
      )}
    </>
  );
}
