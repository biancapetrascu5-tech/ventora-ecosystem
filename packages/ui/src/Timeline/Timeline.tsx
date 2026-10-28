'use client';

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

/* Timeline din bundle.js. „Azi la o treime” (P-2/S71) nu e încă în bundle — vine cu exportul următor. */
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

  return (
    <div
      className={cn(styles.root, className)}
      style={{ '--tl-periods': n, '--tl-period-min': `${minPeriodWidth}px` } as React.CSSProperties}
      role="table"
      aria-label={label}
    >
      <div className={styles.scroll}>
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
                {todayLabel && <span className="caption">{todayLabel}</span>}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
