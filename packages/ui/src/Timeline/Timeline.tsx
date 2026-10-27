'use client';

import { cn } from '../lib/cn';
import styles from './Timeline.module.css';

export interface TimelinePeriod {
  label: string;
  current?: boolean;
}

export type TimelineRowStatus = 'done' | 'active' | 'late' | 'planned';

export interface TimelineRow {
  id: string | number;
  label: string;
  sub?: string;
  start?: number;
  end?: number;
  status?: TimelineRowStatus;
  progress?: number;
  statusLabel?: string;
  milestone?: number;
  milestoneLabel?: string;
}

export interface TimelineProps {
  label?: string;
  periods: TimelinePeriod[];
  rows: TimelineRow[];
  today?: number;
  className?: string;
}

const LABEL_COL_W = 180;
const STATUS_COL_W = 80;

export function Timeline({ label = 'Activitate', periods, rows, today, className }: TimelineProps) {
  const n = periods.length;

  function pct(pos: number) {
    return `${(pos / Math.max(n - 1, 1)) * 100}%`;
  }

  return (
    <div className={cn(styles.root, className)} role="grid" aria-label={label}>
      {/* Header row */}
      <div className={styles.header} role="row">
        <div className={styles.labelCell} role="columnheader" style={{ minWidth: LABEL_COL_W }}>
          <span className={styles.headerText}>{label}</span>
        </div>
        <div className={styles.periods} role="presentation">
          {periods.map((p, i) => (
            <div
              key={i}
              className={cn(styles.period, p.current && styles.periodCurrent)}
              role="columnheader"
            >
              {p.label}
            </div>
          ))}
        </div>
        <div className={styles.statusCell} role="columnheader" style={{ minWidth: STATUS_COL_W }}>
          <span className={styles.headerText}>Stare</span>
        </div>
      </div>

      {/* Today marker layer */}
      {today !== undefined && (
        <div className={styles.todayLayer} aria-hidden>
          <div
            className={styles.todayLine}
            style={{
              left: `calc(${LABEL_COL_W}px + ${(today / Math.max(n - 1, 1)) * 100}% * (100% - ${LABEL_COL_W + STATUS_COL_W}px) / 100%)`,
            }}
          />
        </div>
      )}

      {/* Rows */}
      {rows.map((row) => (
        <div key={row.id} className={styles.row} role="row">
          <div className={styles.labelCell} style={{ minWidth: LABEL_COL_W }} role="gridcell">
            <span className={styles.rowLabel}>{row.label}</span>
            {row.sub && <span className={styles.rowSub}>{row.sub}</span>}
          </div>

          <div className={styles.barArea} role="gridcell" aria-label={row.statusLabel ?? ''}>
            {row.milestone !== undefined ? (
              <div
                className={styles.milestone}
                style={{ left: pct(row.milestone) }}
                title={row.milestoneLabel}
              >
                <span className={styles.milestoneDiamond} aria-hidden />
                {row.milestoneLabel && (
                  <span className={styles.milestoneLabel}>{row.milestoneLabel}</span>
                )}
              </div>
            ) : row.start !== undefined && row.end !== undefined ? (
              <div
                className={cn(styles.bar, row.status && styles[`bar-${row.status}`])}
                style={{
                  left: pct(row.start),
                  width: `calc(${pct(row.end)} - ${pct(row.start)})`,
                }}
              >
                {row.progress !== undefined && row.status === 'active' && (
                  <div className={styles.barProgress} style={{ width: `${row.progress}%` }} />
                )}
              </div>
            ) : null}
          </div>

          <div className={styles.statusCell} style={{ minWidth: STATUS_COL_W }} role="gridcell">
            {row.statusLabel && (
              <span
                className={cn(styles.statusBadge, row.status && styles[`status-${row.status}`])}
              >
                {row.statusLabel}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
