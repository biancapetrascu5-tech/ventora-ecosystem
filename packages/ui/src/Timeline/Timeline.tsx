'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '../lib/cn';
import { Icon } from '../Icon/Icon';
import styles from './Timeline.module.css';

export interface TimelinePeriod {
  label: string;
  current?: boolean;
}

export type TimelineStatus = 'planned' | 'active' | 'late' | 'done';

export interface TimelineRow {
  id: string;
  label: string;
  sub?: string;
  group?: boolean;
  /** Început și sfârșit, în perioade (0 = începutul primei perioade). */
  start?: number;
  end?: number;
  status?: TimelineStatus;
  /** 0–100, doar pentru etapele care nu sunt gata. */
  progress?: number;
  statusLabel?: string;
  range?: string;
  /** Reper (romb) în locul barei, în perioade. */
  milestone?: number;
  milestoneLabel?: string;
}

export interface TimelineProps {
  /** Antetul coloanei de etape și eticheta tabelului („Etapă”). */
  label: string;
  periods: TimelinePeriod[];
  rows: TimelineRow[];
  /** Poziția liniei „Azi”, în perioade. */
  today?: number;
  /** Textul de pe linia „Azi”. */
  todayLabel?: string;
  minPeriodWidth?: number;
  className?: string;
}

/* Timeline din bundle.js (1.1.0). P-2/S71: când perioadele nu încap, se deschide derulat cu
   ziua de azi la o treime din lățimea vizibilă; eticheta „azi” rămâne mereu pe ecran. */
export function Timeline({
  periods,
  rows,
  today,
  todayLabel,
  label,
  minPeriodWidth = 72,
  className,
}: TimelineProps) {
  const n = periods.length;
  const pct = (x: number) => (x / n) * 100;
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLSpanElement>(null);
  const [offset, setOffset] = useState<number | null>(null);

  useLayoutEffect(() => {
    const s = scrollRef.current;
    if (!s || today == null || !n) return;
    const geo = () => {
      const lab = s.querySelector<HTMLElement>(`.${styles.label}`);
      const lw = lab ? lab.offsetWidth : 0;
      const tw = (s.firstElementChild as HTMLElement).scrollWidth - lw;
      return { lw, x: lw + (today / n) * tw };
    };
    const g = geo();
    if (s.scrollWidth > s.clientWidth) {
      s.scrollLeft = Math.max(
        0,
        Math.min(s.scrollWidth - s.clientWidth, g.x - g.lw - (s.clientWidth - g.lw) / 3),
      );
    }
    const place = () => {
      const l = todayRef.current;
      if (!l) return;
      const { lw, x } = geo();
      const w = l.offsetWidth;
      const lo = s.scrollLeft + lw;
      const hi = s.scrollLeft + s.clientWidth;
      setOffset(Math.round(Math.max(lo + 4, Math.min(hi - w - 4, x - w / 2)) - x));
    };
    place();
    s.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
    return () => {
      s.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
    };
  }, [today, n]);

  return (
    <div
      className={cn(styles.root, className)}
      style={{ '--tl-periods': n, '--tl-period-min': `${minPeriodWidth}px` } as React.CSSProperties}
      role="table"
      aria-label={label}
    >
      <div ref={scrollRef} className={styles.scroll}>
        <div className={styles.inner}>
          <div className={cn(styles.row, styles.head)} role="row">
            <div className={cn(styles.label, 'caption')} role="columnheader">
              {label}
            </div>
            <div className={styles.track} role="columnheader">
              {periods.map((p, i) => (
                <span
                  key={i}
                  className={cn('caption', styles.period, p.current && styles.current)}
                  style={{ left: `${pct(i)}%`, width: `${pct(1)}%` }}
                >
                  {p.label}
                </span>
              ))}
            </div>
          </div>
          {rows.map((r) => {
            const st = r.status ?? 'planned';
            const start = r.start ?? 0;
            const end = r.end ?? start;
            return (
              <div key={r.id} className={styles.row} role="row">
                <div className={styles.label} role="rowheader">
                  <span className={r.group ? 'body-strong' : 'body'}>{r.label}</span>
                  {r.sub && <span className={cn('caption', styles.sub)}>{r.sub}</span>}
                </div>
                <div className={styles.track} role="cell">
                  {periods.map((_, i) => (
                    <span
                      key={i}
                      className={styles.grid}
                      style={{ left: `${pct(i)}%` }}
                      aria-hidden="true"
                    />
                  ))}
                  {r.milestone != null ? (
                    <span
                      className={styles.milestone}
                      style={{ left: `${pct(r.milestone)}%` }}
                      title={r.milestoneLabel}
                    >
                      <span className={styles.diamond} aria-hidden="true" />
                      {r.milestoneLabel && (
                        <span className={cn('caption', styles.mlabel)}>{r.milestoneLabel}</span>
                      )}
                    </span>
                  ) : (
                    <>
                      <span
                        className={cn(styles.bar, styles[`bar-${st}`])}
                        style={{
                          left: `${pct(start)}%`,
                          width: `calc(${pct(end - start)}% - 4px)`,
                        }}
                        aria-label={[r.label, r.range, r.statusLabel].filter(Boolean).join(', ')}
                      >
                        {r.progress != null && st !== 'done' && (
                          <span
                            className={styles.fill}
                            style={{ width: `${r.progress}%` }}
                            aria-hidden="true"
                          />
                        )}
                      </span>
                      <span
                        className={cn('caption', styles.barlabel, styles[`label-${st}`])}
                        style={{ left: `calc(${pct(end)}% + 4px)` }}
                        aria-hidden="true"
                      >
                        {st === 'done' && <Icon icon="check" size={12} strokeWidth={2.5} />}
                        {st === 'late' && <Icon icon="clock" size={12} strokeWidth={2.25} />}
                        {r.statusLabel || r.range}
                      </span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {today != null && (
            <div className={styles.todaywrap} aria-hidden="true">
              <span className={styles.today} style={{ left: `${pct(today)}%` }}>
                {todayLabel && (
                  <span
                    ref={todayRef}
                    className="caption"
                    style={offset == null ? undefined : { transform: `translateX(${offset}px)` }}
                  >
                    {todayLabel}
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
