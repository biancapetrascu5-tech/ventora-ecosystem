'use client';

import { Avatar } from '../Avatar/Avatar';
import { Icon } from '../Icon/Icon';
import { cn } from '../lib/cn';
import styles from './Schedule.module.css';

export type ScheduleEventStatus =
  'done' | 'now' | 'confirmed' | 'unconfirmed' | 'cancelled' | 'noshow' | 'blocked';

export interface ScheduleColumn {
  id: string;
  label: string;
  sub?: string;
  /** Numele pentru Avatar din antet. */
  person?: string;
  today?: boolean;
  /** Textul coloanei închise (ex. „În concediu”); coloana devine hașurată. */
  closed?: string;
}

export interface ScheduleEvent {
  id: string;
  col: string;
  start: string;
  end: string;
  title: string;
  subtitle?: string;
  status?: ScheduleEventStatus;
}

/** Textele stărilor pentru cititorul de ecran (S.ev_*). */
export type ScheduleStatusLabels = Record<ScheduleEventStatus, string>;

export interface ScheduleProps {
  columns: ScheduleColumn[];
  events: ScheduleEvent[];
  from?: number;
  to?: number;
  /** Ora curentă („11:20”): linia peach și eticheta din coloana orelor. */
  now?: string;
  /** Linia plină doar în această coloană; în rest, punctată. */
  nowColumn?: string;
  height?: number | string;
  minColumnWidth?: number;
  activeId?: string;
  onEventClick?: (event: ScheduleEvent) => void;
  onSlotClick?: (colId: string, time: string) => void;
  statusLabels?: Partial<ScheduleStatusLabels>;
  className?: string;
}

export const toMin = (s: string | number) => {
  if (typeof s === 'number') return s;
  const [h, m] = String(s).split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
export const fmtTime = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

type Laned = ScheduleEvent & { lane: number; lanes: number };

/* lanes din bundle.js: evenimentele care se suprapun stau unul lângă altul. */
function lanes(events: ScheduleEvent[]): Laned[] {
  const sorted = [...events].sort((a, b) => toMin(a.start) - toMin(b.start));
  const out: Laned[] = [];
  let group: ScheduleEvent[] = [];
  let groupEnd = -1;
  const flush = () => {
    const cols: number[] = [];
    group.forEach((e) => {
      let i = cols.findIndex((end) => end <= toMin(e.start));
      if (i < 0) {
        i = cols.length;
        cols.push(0);
      }
      cols[i] = toMin(e.end);
      out.push({ ...e, lane: i, lanes: 0 });
    });
    const n = cols.length;
    out.slice(-group.length).forEach((e) => (e.lanes = n));
    group = [];
  };
  sorted.forEach((e) => {
    if (toMin(e.start) >= groupEnd && group.length) flush();
    group.push(e);
    groupEnd = Math.max(groupEnd, toMin(e.end));
  });
  if (group.length) flush();
  return out;
}

/* Schedule din bundle.js: antet lipit cu Avatar, coloana orelor lipită la stânga, grilă cu
   jumătăți de oră punctate, evenimente pe stări, linia „acum” peach. */
export function Schedule({
  columns,
  events,
  from = 8,
  to = 20,
  now,
  nowColumn,
  onEventClick,
  onSlotClick,
  height,
  minColumnWidth = 120,
  activeId,
  statusLabels,
  className,
}: ScheduleProps) {
  const hours: number[] = [];
  for (let h = from; h <= to; h++) hours.push(h);
  const startM = from * 60;
  const endM = to * 60;
  const nowM = now != null ? toMin(now) : null;
  const showNow = nowM != null && nowM >= startM && nowM <= endM;
  const pct = (m: number) => ((m - startM) / (endM - startM)) * 100;

  return (
    <div
      className={cn(styles.sched, className)}
      style={
        {
          height,
          '--sched-cols': columns.length,
          '--sched-col-min': `${minColumnWidth}px`,
          '--sched-hours': to - from,
        } as React.CSSProperties
      }
    >
      <div className={styles.scroll}>
        <div className={styles.inner}>
          <div className={styles.head}>
            <div className={styles.gutter} />
            {columns.map((c) => (
              <div key={c.id} className={cn(styles.colhead, c.today && styles.isToday)}>
                {c.person && <Avatar name={c.person} size="sm" />}
                <span className={styles.collabel}>
                  <span className={c.today ? 'body-strong' : 'body'}>{c.label}</span>
                  {c.sub && <span className={cn('caption', styles.colsub)}>{c.sub}</span>}
                </span>
              </div>
            ))}
          </div>
          <div className={styles.body}>
            <div className={cn(styles.gutter, styles.times)}>
              {hours.slice(0, -1).map((h) => (
                <span
                  key={h}
                  className={cn('caption', styles.time)}
                  style={{ top: `${pct(h * 60)}%` }}
                >
                  {String(h).padStart(2, '0')}:00
                </span>
              ))}
              {showNow && (
                <span
                  className={cn(styles.nowlabel, 'caption', 'v-num')}
                  style={{ top: `${pct(nowM)}%` }}
                >
                  {fmtTime(nowM)}
                </span>
              )}
            </div>
            <div className={styles.grid}>
              {hours.slice(0, -1).map((h) => (
                <span
                  key={h}
                  className={styles.hour}
                  style={{ top: `${pct(h * 60)}%`, height: `${100 / (to - from)}%` }}
                />
              ))}
              {columns.map((c) => {
                const evs = lanes(events.filter((e) => e.col === c.id));
                return (
                  <div
                    key={c.id}
                    className={cn(styles.col, c.closed && styles.isClosed)}
                    onClick={
                      onSlotClick
                        ? (e) => {
                            if (e.target !== e.currentTarget) return;
                            const r = e.currentTarget.getBoundingClientRect();
                            const m =
                              startM +
                              Math.round(
                                (((e.clientY - r.top) / r.height) * (endM - startM)) / 15,
                              ) *
                                15;
                            onSlotClick(c.id, fmtTime(m));
                          }
                        : undefined
                    }
                  >
                    {c.closed && <span className={cn(styles.closed, 'caption')}>{c.closed}</span>}
                    {evs.map((e) => {
                      const s = toMin(e.start);
                      const en = toMin(e.end);
                      const st = e.status ?? 'confirmed';
                      const isButton = !!onEventClick && st !== 'blocked';
                      const cls = cn(
                        styles.ev,
                        styles[`ev-${st}`],
                        en - s <= 30 && styles.isShort,
                        en - s > 30 && en - s < 60 && styles.isMedium,
                        activeId === e.id && styles.isActive,
                        isButton && styles.evButton,
                      );
                      const style = {
                        top: `${pct(s)}%`,
                        height: `calc(${pct(en) - pct(s)}% - 2px)`,
                        left: `calc(${(e.lane / e.lanes) * 100}% + 2px)`,
                        width: `calc(${100 / e.lanes}% - 4px)`,
                      };
                      const content = (
                        <>
                          <span className={cn(styles.evTime, 'caption', 'v-num')}>
                            {e.start}–{e.end}
                            {st === 'done' && (
                              <Icon
                                icon="check"
                                size={12}
                                strokeWidth={2.5}
                                className={styles.evCheck}
                              />
                            )}
                          </span>
                          <span className={cn(styles.evTitle, 'body-small')}>{e.title}</span>
                          {e.subtitle && (
                            <span className={cn(styles.evSub, 'caption')}>{e.subtitle}</span>
                          )}
                        </>
                      );
                      return isButton ? (
                        <button
                          key={e.id}
                          type="button"
                          className={cls}
                          style={style}
                          onClick={() => onEventClick?.(e)}
                          aria-label={[`${e.title}, ${e.start}–${e.end}`, statusLabels?.[st]]
                            .filter(Boolean)
                            .join(', ')}
                        >
                          {content}
                        </button>
                      ) : (
                        <div key={e.id} className={cls} style={style}>
                          {content}
                        </div>
                      );
                    })}
                    {showNow && (nowColumn == null || nowColumn === c.id) && (
                      <span
                        className={styles.now}
                        style={{ top: `${pct(nowM)}%` }}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                );
              })}
              {showNow && nowColumn != null && (
                <span
                  className={styles.nowfaint}
                  style={{ top: `${pct(nowM)}%` }}
                  aria-hidden="true"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
