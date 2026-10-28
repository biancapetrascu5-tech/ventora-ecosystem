'use client';

import { useState } from 'react';
import { cn } from '../lib/cn';
import { fmtNumber } from '../lib/fmt';
import { ChartFrame, type ChartLabels } from '../Chart/ChartFrame';
import { compactTick, niceScale, seriesVar, useWidth, type ChartColor } from '../Chart/chart';
import styles from '../Chart/Chart.module.css';

export interface LineSeries {
  label: string;
  values: (number | null)[];
  color?: ChartColor;
}

export interface LineChartProps {
  title: string;
  description?: string;
  labels: string[];
  series: LineSeries[];
  unit?: string;
  format?: (v: number) => string;
  height?: number;
  /** Perioada în curs: ultimul segment punctat, punct în --chart-now. */
  nowIndex?: number;
  nowLabel?: string;
  /** Suprafața de sub seria principală. */
  area?: boolean;
  chartLabels: ChartLabels;
  locale?: string;
  actions?: React.ReactNode;
  className?: string;
}

/* LineChart din bundle.js — aceleași dimensiuni (padL 48, padB 28, padT 12, padR 16) */
export function LineChart({
  labels = [],
  series = [],
  format,
  height = 240,
  title,
  description,
  unit,
  nowIndex,
  nowLabel,
  area = true,
  chartLabels,
  locale,
  actions,
  className,
}: LineChartProps) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const fmt = format ?? ((v: number) => fmtNumber(v, locale) + (unit ? ` ${unit}` : ''));
  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  const { max, ticks } = niceScale(Math.max(...all, 0));
  const padL = 48;
  const padB = 28;
  const padT = 12;
  const padR = 16;
  const W = Math.max(w, 220);
  const H = height;
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const x = (i: number) => padL + (labels.length > 1 ? (i / (labels.length - 1)) * iw : iw / 2);
  const y = (v: number) => padT + ih - (v / max) * ih;
  const path = (vals: (number | null)[]) =>
    vals
      .map((v, i) =>
        v == null ? null : `${i === 0 || vals[i - 1] == null ? 'M' : 'L'}${x(i)},${y(v)}`,
      )
      .filter(Boolean)
      .join(' ');
  const main = series.find((s) => s.color !== 'compare') ?? series[0];
  const step = labels.length > 8 && W < 560 ? 2 : 1;
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - padL) / iw) * (labels.length - 1));
    setHover(Math.max(0, Math.min(labels.length - 1, i)));
  };
  const table = {
    head: ['', ...series.map((s) => s.label)],
    rows: labels.map((l, i) => [
      l,
      ...series.map((s) => {
        const v = s.values[i];
        return v == null ? '—' : fmt(v);
      }),
    ]),
  };
  const mainVals = main?.values ?? [];
  const last = mainVals.length - 1;

  return (
    <ChartFrame
      title={title}
      description={description}
      table={table}
      legend={series.map((s) => ({ label: s.label, color: s.color, line: true }))}
      labels={chartLabels}
      actions={actions}
      className={className}
    >
      <div className={styles.plot} ref={ref} style={{ height: H }}>
        {w > 0 && (
          <svg
            width={W}
            height={H}
            role="img"
            aria-label={title}
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          >
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
            {labels.map(
              (l, i) =>
                (labels.length - 1 - i) % step === 0 && (
                  <text
                    key={i}
                    x={x(i)}
                    y={H - 8}
                    textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}
                    className={cn(styles.tick, i === nowIndex && styles.tickNow)}
                  >
                    {l}
                  </text>
                ),
            )}
            {area && main && (
              <path
                d={`${path(mainVals)} L${x(last)},${padT + ih} L${x(0)},${padT + ih} Z`}
                fill={seriesVar(main.color)}
                opacity="0.1"
              />
            )}
            {series.map((s) => {
              const vals = s.values;
              const solidTo = s === main && nowIndex != null ? nowIndex - 1 : vals.length - 1;
              const a = nowIndex != null ? vals[nowIndex - 1] : null;
              const b = nowIndex != null ? vals[nowIndex] : null;
              return (
                <g key={s.label}>
                  <path
                    d={path(vals.slice(0, solidTo + 1))}
                    fill="none"
                    stroke={seriesVar(s.color)}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {s === main && nowIndex != null && a != null && b != null && (
                    <path
                      d={`M${x(nowIndex - 1)},${y(a)} L${x(nowIndex)},${y(b)}`}
                      fill="none"
                      stroke={seriesVar(s.color)}
                      strokeWidth="2"
                      strokeDasharray="2 4"
                      strokeLinecap="round"
                    />
                  )}
                </g>
              );
            })}
            {main && nowIndex != null && mainVals[nowIndex] != null && (
              <circle
                cx={x(nowIndex)}
                cy={y(mainVals[nowIndex]!)}
                r="5"
                fill="var(--chart-now)"
                stroke="var(--sheet)"
                strokeWidth="2"
              />
            )}
            {main && nowIndex == null && mainVals[last] != null && (
              <circle
                cx={x(last)}
                cy={y(mainVals[last]!)}
                r="4"
                fill={seriesVar(main.color)}
                stroke="var(--sheet)"
                strokeWidth="2"
              />
            )}
            {hover != null && (
              <g>
                <line
                  x1={x(hover)}
                  x2={x(hover)}
                  y1={padT}
                  y2={padT + ih}
                  stroke="var(--chart-axis)"
                  strokeWidth="1"
                />
                {series.map((s) => {
                  const v = s.values[hover];
                  return (
                    v != null && (
                      <circle
                        key={s.label}
                        cx={x(hover)}
                        cy={y(v)}
                        r="4"
                        fill={
                          hover === nowIndex && s === main ? 'var(--chart-now)' : seriesVar(s.color)
                        }
                        stroke="var(--sheet)"
                        strokeWidth="2"
                      />
                    )
                  );
                })}
              </g>
            )}
          </svg>
        )}
        {hover != null && w > 0 && (
          <div
            className={styles.tip}
            style={{ left: Math.min(Math.max(x(hover), 90), W - 90), top: 0 }}
          >
            <span className="caption">
              {labels[hover]}
              {hover === nowIndex && nowLabel ? ` · ${nowLabel}` : ''}
            </span>
            {series.map((s) => {
              const v = s.values[hover];
              return (
                v != null && (
                  <span key={s.label} className={cn(styles.tipRow, 'body-small')}>
                    <span
                      className={cn(styles.key, styles.keyLine)}
                      style={{ background: seriesVar(s.color) }}
                      aria-hidden="true"
                    />
                    {s.label}
                    <span className={cn('body-strong', styles.num)}>{fmt(v)}</span>
                  </span>
                )
              );
            })}
          </div>
        )}
      </div>
    </ChartFrame>
  );
}
