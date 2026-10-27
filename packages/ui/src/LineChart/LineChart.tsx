'use client';

import { useMemo } from 'react';

import { cn } from '../lib/cn';
import styles from './LineChart.module.css';

export interface LineSeries {
  label: string;
  values: number[];
  color: number | 'compare';
}

export interface LineChartProps {
  title: string;
  description?: string;
  labels: string[];
  nowIndex?: number;
  nowLabel?: string;
  series: LineSeries[];
  unit?: string;
  className?: string;
}

const SVG_W = 600;
const SVG_H = 160;
const PAD_L = 48;
const PAD_R = 12;
const PAD_T = 8;
const PAD_B = 28;
const CHART_W = SVG_W - PAD_L - PAD_R;
const CHART_H = SVG_H - PAD_T - PAD_B;

function pts(values: number[], min: number, range: number, count: number): string {
  return values
    .map((v, i) => {
      const x = PAD_L + (i / Math.max(count - 1, 1)) * CHART_W;
      const y = PAD_T + CHART_H - ((v - min) / (range || 1)) * CHART_H;
      return `${x},${y}`;
    })
    .join(' ');
}

function fmtY(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

export function LineChart({
  title,
  description,
  labels,
  nowIndex,
  nowLabel,
  series,
  unit,
  className,
}: LineChartProps) {
  const { min, range, yTicks } = useMemo(() => {
    const allVals = series.flatMap((s) => s.values).filter(Number.isFinite);
    const minV = Math.min(...allVals, 0);
    const maxV = Math.max(...allVals, 1);
    const rawRange = maxV - minV;
    const step =
      Math.pow(10, Math.floor(Math.log10(rawRange || 1))) *
      (rawRange > 5 * Math.pow(10, Math.floor(Math.log10(rawRange || 1))) ? 2 : 1);
    const roundedMin = Math.floor(minV / step) * step;
    const roundedMax = Math.ceil(maxV / step) * step;
    const ticks: number[] = [];
    const tickCount = 4;
    const tickStep = (roundedMax - roundedMin) / tickCount;
    for (let i = 0; i <= tickCount; i++) {
      ticks.push(Math.round(roundedMin + tickStep * i));
    }
    return { min: roundedMin, range: roundedMax - roundedMin, yTicks: ticks };
  }, [series]);

  const count = labels.length;

  const SERIES_COLORS = ['var(--primary)', 'var(--done)', 'var(--attention)', 'var(--danger)'];

  function seriesColor(color: number | 'compare'): string {
    if (color === 'compare') return 'var(--ink-muted)';
    return SERIES_COLORS[(color - 1) % SERIES_COLORS.length] ?? 'var(--primary)';
  }

  return (
    <div
      className={cn(styles.root, className)}
      role="img"
      aria-label={`${title}${description ? `. ${description}` : ''}`}
    >
      <div className={styles.header}>
        <span className={styles.title}>{title}</span>
        {description && <span className={styles.desc}>{description}</span>}
      </div>

      {series.length > 1 && (
        <div className={styles.legend} aria-hidden>
          {series.map((s) => (
            <span key={s.label} className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: seriesColor(s.color) }} />
              {s.label}
            </span>
          ))}
        </div>
      )}

      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className={styles.svg}
        aria-hidden
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Y grid lines and labels */}
        {yTicks.map((tick) => {
          const y = PAD_T + CHART_H - ((tick - min) / (range || 1)) * CHART_H;
          return (
            <g key={tick}>
              <line x1={PAD_L} y1={y} x2={SVG_W - PAD_R} y2={y} className={styles.gridLine} />
              <text x={PAD_L - 4} y={y + 4} className={styles.axisLabel} textAnchor="end">
                {fmtY(tick)}
                {unit && tick === yTicks[yTicks.length - 1] ? ` ${unit}` : ''}
              </text>
            </g>
          );
        })}

        {/* Now marker */}
        {nowIndex !== undefined && (
          <line
            x1={PAD_L + (nowIndex / Math.max(count - 1, 1)) * CHART_W}
            y1={PAD_T}
            x2={PAD_L + (nowIndex / Math.max(count - 1, 1)) * CHART_W}
            y2={PAD_T + CHART_H}
            className={styles.nowLine}
            strokeDasharray="4 3"
          />
        )}

        {/* Series lines */}
        {series.map((s) => {
          const color = seriesColor(s.color);
          const isDashed = s.color === 'compare';
          return (
            <polyline
              key={s.label}
              points={pts(s.values, min, range, count)}
              fill="none"
              stroke={color}
              strokeWidth={isDashed ? 1.5 : 2}
              strokeDasharray={isDashed ? '4 3' : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={styles.line}
            />
          );
        })}

        {/* X axis labels */}
        {labels.map((lbl, i) => {
          const show = count <= 12 || i === 0 || i === count - 1 || i % Math.ceil(count / 6) === 0;
          if (!show) return null;
          const x = PAD_L + (i / Math.max(count - 1, 1)) * CHART_W;
          const isNow = i === nowIndex;
          return (
            <text
              key={lbl}
              x={x}
              y={SVG_H - 4}
              className={cn(styles.axisLabel, isNow && styles.axisLabelNow)}
              textAnchor="middle"
            >
              {lbl}
              {isNow && nowLabel ? ` (${nowLabel})` : ''}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
