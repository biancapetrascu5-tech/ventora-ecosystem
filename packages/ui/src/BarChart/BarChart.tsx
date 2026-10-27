'use client';

import { useMemo } from 'react';
import { cn } from '../lib/cn';
import styles from './BarChart.module.css';

export interface BarChartDataItem {
  label: string;
  value: number;
  compare?: number;
  now?: boolean;
  nowLabel?: string;
  share?: string;
}

export interface BarChartProps {
  title: string;
  description?: string;
  data: BarChartDataItem[];
  unit?: string;
  compareLabel?: string;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

function fmtValue(n: number, unit?: string) {
  let s: string;
  if (n >= 1_000_000) s = `${(n / 1_000_000).toFixed(1)}M`;
  else if (n >= 1_000) s = `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  else s = String(n);
  return unit ? `${s} ${unit}` : s;
}

export function BarChart({
  title,
  description,
  data,
  unit,
  compareLabel,
  orientation = 'vertical',
  className,
}: BarChartProps) {
  const allValues = useMemo(() => data.flatMap((d) => [d.value, d.compare ?? 0]), [data]);
  const max = Math.max(...allValues, 1);
  const isHorizontal = orientation === 'horizontal';

  return (
    <div
      className={cn(styles.root, isHorizontal && styles.horizontal, className)}
      role="img"
      aria-label={`${title}${description ? `. ${description}` : ''}`}
    >
      <div className={styles.header}>
        <span className={styles.title}>{title}</span>
        {description && <span className={styles.desc}>{description}</span>}
        {compareLabel && (
          <span className={styles.legend}>
            <span className={styles.legendPrimary} aria-hidden />
            <span className={styles.legendCompare} aria-hidden />
            <span className={styles.legendLabel}>{compareLabel}</span>
          </span>
        )}
      </div>

      {isHorizontal ? (
        <div className={styles.hBars} aria-hidden>
          {data.map((item) => {
            const pct = Math.round((item.value / max) * 100);
            return (
              <div key={item.label} className={styles.hRow}>
                <span className={styles.hLabel}>{item.label}</span>
                <div className={styles.hTrack}>
                  <div className={styles.hFill} style={{ width: `${pct}%` }} />
                </div>
                <span className={styles.hVal}>{item.share ?? fmtValue(item.value, unit)}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={styles.vBars} aria-hidden>
          {data.map((item) => {
            const pct = Math.round((item.value / max) * 100);
            const cmpPct =
              item.compare !== undefined ? Math.round((item.compare / max) * 100) : undefined;
            return (
              <div key={item.label} className={cn(styles.vCol, item.now && styles.vColNow)}>
                <div className={styles.vStack}>
                  {cmpPct !== undefined && (
                    <div className={styles.vBarCompare} style={{ height: `${cmpPct}%` }} />
                  )}
                  <div className={styles.vBar} style={{ height: `${pct}%` }} />
                </div>
                <span className={styles.vLabel}>
                  {item.label}
                  {item.now && item.nowLabel && (
                    <span className={styles.vNowLabel}>{item.nowLabel}</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
