'use client';

import { useState } from 'react';
import { cn } from '../lib/cn';
import { fmtNumber } from '../lib/fmt';
import { ChartFrame, type ChartLabels } from '../Chart/ChartFrame';
import { compactTick, niceScale, seriesVar, useWidth, type ChartColor } from '../Chart/chart';
import styles from '../Chart/Chart.module.css';

export interface BarChartDataItem {
  label: string;
  value: number;
  compare?: number;
  /** Perioada în curs (bara în --chart-now, eticheta îngroșată). */
  now?: boolean;
  nowLabel?: string;
  /** Doar orizontal: „34%” după valoare. */
  share?: string;
  color?: ChartColor;
}

export interface BarChartProps {
  title: string;
  description?: string;
  data: BarChartDataItem[];
  unit?: string;
  compareLabel?: string;
  orientation?: 'horizontal' | 'vertical';
  color?: ChartColor;
  format?: (v: number) => string;
  height?: number;
  chartLabels: ChartLabels;
  locale?: string;
  actions?: React.ReactNode;
  className?: string;
}

/* BarChart din bundle.js — aceleași dimensiuni (padL 44, padB 28, padT 8, padR 4) */
export function BarChart({
  data,
  orientation = 'vertical',
  color = 1,
  format,
  height = 240,
  title,
  description,
  unit,
  compareLabel,
  chartLabels,
  locale,
  actions,
  className,
}: BarChartProps) {
  const [vref, vw] = useWidth<HTMLDivElement>();
  const [href] = useWidth<HTMLUListElement>();
  const [hover, setHover] = useState<number | null>(null);
  const fmt = format ?? ((v: number) => fmtNumber(v, locale) + (unit ? ` ${unit}` : ''));
  const { max, ticks } = niceScale(
    Math.max(...data.map((d) => Math.max(d.value, d.compare || 0)), 0),
  );
  const table = { head: ['', title], rows: data.map((d) => [d.label, fmt(d.value)]) };

  if (orientation === 'horizontal') {
    return (
      <ChartFrame
        title={title}
        description={description}
        table={table}
        labels={chartLabels}
        actions={actions}
        className={className}
      >
        <ul className={styles.hbars} ref={href}>
          {data.map((d, i) => (
            <li
              key={d.label}
              className={styles.hrow}
              tabIndex={0}
              data-chart-band=""
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            >
              <span className={cn('body', styles.hlabel)}>{d.label}</span>
              <span className={styles.htrack}>
                <span
                  className={cn(styles.hbar, hover === i && styles.bandHover)}
                  style={{
                    width: `${(d.value / max) * 100}%`,
                    background: seriesVar(d.now ? 'now' : d.color || color),
                  }}
                />
              </span>
              <span className={cn('body-strong', styles.hvalue)}>
                {fmt(d.value)}
                {d.share && <span className={cn('body-small', styles.hshare)}> · {d.share}</span>}
              </span>
            </li>
          ))}
        </ul>
      </ChartFrame>
    );
  }

  const padL = 44;
  const padB = 28;
  const padT = 8;
  const padR = 4;
  const W = Math.max(vw, 200);
  const H = height;
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const band = iw / Math.max(data.length, 1);
  const hasCompare = data.some((d) => d.compare != null);
  const bw = Math.min(24, band * (hasCompare ? 0.32 : 0.56));
  const y = (v: number) => padT + ih - (v / max) * ih;
  const col = (x: number, v: number, fill: string, key: string) => {
    const h = Math.max((v / max) * ih, 0);
    if (h <= 0) return null;
    const top = y(v);
    const rr = Math.min(4, h, bw / 2);
    const d = `M${x},${padT + ih} V${top + rr} Q${x},${top} ${x + rr},${top} H${x + bw - rr} Q${x + bw},${top} ${x + bw},${top + rr} V${padT + ih} Z`;
    return <path key={key} d={d} fill={fill} />;
  };
  const hovered = hover != null ? data[hover] : undefined;

  return (
    <ChartFrame
      title={title}
      description={description}
      table={
        hasCompare
          ? {
              head: ['', title, compareLabel ?? ''],
              rows: data.map((d) => [d.label, fmt(d.value), fmt(d.compare ?? 0)]),
            }
          : table
      }
      legend={
        hasCompare
          ? [
              { label: title, color },
              { label: compareLabel ?? '', color: 'compare' },
            ]
          : null
      }
      labels={chartLabels}
      actions={actions}
      className={className}
    >
      <div className={styles.plot} ref={vref} style={{ height: H }}>
        {vw > 0 && (
          <svg width={W} height={H} role="img" aria-label={title}>
            {ticks.map((tv, i) => (
              <g key={i}>
                <line
                  x1={padL}
                  x2={W - padR}
                  y1={y(tv)}
                  y2={y(tv)}
                  stroke={i === 0 ? 'var(--chart-axis)' : 'var(--chart-grid)'}
                  strokeWidth="1"
                />
                <text x={padL - 8} y={y(tv)} dy="0.32em" textAnchor="end" className={styles.tick}>
                  {compactTick(tv, locale, chartLabels.millions)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx0 = padL + band * i + band / 2;
              const x = hasCompare ? cx0 - bw - 1 : cx0 - bw / 2;
              return (
                <g
                  key={d.label}
                  className={cn(hover === i && styles.bandHover)}
                  data-chart-band=""
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                >
                  <rect x={padL + band * i} y={padT} width={band} height={ih} fill="transparent" />
                  {hasCompare && col(cx0 + 1, d.compare || 0, 'var(--chart-compare)', 'c')}
                  {col(x, d.value, seriesVar(d.now ? 'now' : color), 'v')}
                  <text
                    x={cx0}
                    y={H - 8}
                    textAnchor="middle"
                    className={cn(styles.tick, d.now && styles.tickNow)}
                  >
                    {d.label}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
        {hovered && hover != null && vw > 0 && (
          <div
            className={styles.tip}
            style={{
              left: Math.min(Math.max(padL + band * hover + band / 2, 80), W - 80),
              top: Math.max(y(Math.max(hovered.value, hovered.compare || 0)) - 8, 0),
            }}
          >
            <span className="caption">
              {hovered.label}
              {hovered.now ? ` · ${hovered.nowLabel}` : ''}
            </span>
            <span className={cn('body-strong', styles.num)}>{fmt(hovered.value)}</span>
            {hasCompare && (
              <span className={cn('caption', styles.num)}>
                {compareLabel}: {fmt(hovered.compare ?? 0)}
              </span>
            )}
          </div>
        )}
      </div>
    </ChartFrame>
  );
}
