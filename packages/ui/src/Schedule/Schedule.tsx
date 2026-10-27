'use client';

import { useRef } from 'react';
import { cn } from '../lib/cn';
import styles from './Schedule.module.css';

export type ScheduleEventStatus =
  'done' | 'now' | 'confirmed' | 'unconfirmed' | 'cancelled' | 'blocked';

export interface ScheduleColumn {
  id: string;
  label: string;
  sub?: string;
  person?: string;
  today?: boolean;
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

export interface ScheduleProps {
  columns: ScheduleColumn[];
  events: ScheduleEvent[];
  from?: number;
  to?: number;
  now?: string;
  nowColumn?: string;
  height?: number;
  minColumnWidth?: number;
  activeId?: string;
  onEventClick?: (event: ScheduleEvent) => void;
  onSlotClick?: (colId: string, time: string) => void;
  className?: string;
}

function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) + (m ?? 0) / 60;
}

function formatHour(h: number): string {
  return `${String(Math.floor(h)).padStart(2, '0')}:00`;
}

const LABEL_COL_W = 44; // px for the hour labels column

export function Schedule({
  columns,
  events,
  from = 8,
  to = 18,
  now,
  nowColumn,
  height = 480,
  minColumnWidth = 140,
  activeId,
  onEventClick,
  onSlotClick,
  className,
}: ScheduleProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hours = to - from;
  const pxPerHour = height / hours;

  function timeToPx(t: string): number {
    return (parseTime(t) - from) * pxPerHour;
  }

  function durationPx(start: string, end: string): number {
    return Math.max((parseTime(end) - parseTime(start)) * pxPerHour, 20);
  }

  const nowPos = now ? timeToPx(now) : null;

  const hourTicks = Array.from({ length: hours + 1 }, (_, i) => from + i);

  return (
    <div className={cn(styles.root, className)} aria-label="Program">
      {/* Column headers */}
      <div className={styles.headerRow}>
        <div className={styles.cornerCell} style={{ width: LABEL_COL_W }} />
        <div className={styles.headers} style={{ minWidth: `calc(100% - ${LABEL_COL_W}px)` }}>
          {columns.map((col) => (
            <div
              key={col.id}
              className={cn(styles.colHeader, col.today && styles.colHeaderToday)}
              style={{ minWidth: minColumnWidth }}
            >
              <span className={styles.colLabel}>{col.label}</span>
              {col.sub && <span className={styles.colSub}>{col.sub}</span>}
              {col.closed && <span className={styles.colClosed}>{col.closed}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className={styles.body} ref={scrollRef}>
        {/* Hour ticks */}
        <div className={styles.hourAxis} style={{ width: LABEL_COL_W, height }}>
          {hourTicks.map((h) => (
            <div key={h} className={styles.hourTick} style={{ top: (h - from) * pxPerHour }}>
              <span className={styles.hourLabel}>{formatHour(h)}</span>
            </div>
          ))}
        </div>

        {/* Grid + events */}
        <div className={styles.grid} style={{ height, minWidth: `calc(100% - ${LABEL_COL_W}px)` }}>
          {/* Hour grid lines */}
          {hourTicks.map((h) => (
            <div
              key={h}
              className={styles.gridLine}
              style={{ top: (h - from) * pxPerHour }}
              aria-hidden
            />
          ))}

          {/* Now indicator */}
          {nowPos !== null && nowPos >= 0 && nowPos <= height && (
            <div className={styles.nowLine} style={{ top: nowPos }} aria-hidden />
          )}

          {/* Columns */}
          {columns.map((col) => {
            const colEvents = events.filter((e) => e.col === col.id);
            const isNowCol = nowColumn === col.id || (!nowColumn && col.today);

            return (
              <div
                key={col.id}
                className={cn(styles.column, col.closed && styles.columnClosed)}
                style={{ minWidth: minColumnWidth, height }}
                onClick={(e) => {
                  if (!onSlotClick) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const y = e.clientY - rect.top;
                  const h = from + y / pxPerHour;
                  const hFloor = Math.floor(h);
                  const m = Math.round((h - hFloor) * 4) * 15;
                  onSlotClick(
                    col.id,
                    `${String(hFloor).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
                  );
                }}
              >
                {col.closed && (
                  <div className={styles.closedOverlay} aria-label={col.closed}>
                    <span className={styles.closedLabel}>{col.closed}</span>
                  </div>
                )}

                {/* Now line per column */}
                {isNowCol && nowPos !== null && nowPos >= 0 && nowPos <= height && (
                  <div className={styles.nowLineCol} style={{ top: nowPos }} aria-hidden />
                )}

                {colEvents.map((ev) => {
                  const top = timeToPx(ev.start);
                  const h = durationPx(ev.start, ev.end);
                  const isActive = ev.id === activeId;

                  return (
                    <button
                      key={ev.id}
                      type="button"
                      role="button"
                      aria-label={`${ev.title}${ev.subtitle ? ` — ${ev.subtitle}` : ''}, ${ev.start}–${ev.end}`}
                      className={cn(
                        styles.event,
                        ev.status && styles[`status-${ev.status}`],
                        isActive && styles.eventActive,
                      )}
                      style={{ top, height: h }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick?.(ev);
                      }}
                    >
                      <span className={styles.eventTitle}>{ev.title}</span>
                      {ev.subtitle && h > 40 && (
                        <span className={styles.eventSub}>{ev.subtitle}</span>
                      )}
                      {h > 52 && (
                        <span className={styles.eventTime}>
                          {ev.start}–{ev.end}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
