'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { fmtNumber } from '../lib/fmt';

/* niceStep / niceScale / compact / seriesVar / useWidth — 1:1 cu bundle.js */

export type ChartColor = 1 | 2 | 3 | 4 | 5 | 'compare' | 'now';

export function niceStep(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

export function niceScale(v: number, n = 4): { max: number; ticks: number[] } {
  const step = niceStep(v / n);
  const max = Math.max(step, Math.ceil(v / step) * step);
  const ticks: number[] = [];
  for (let t = 0; t <= max + step / 2; t += step) ticks.push(t);
  return { max, ticks };
}

/** Eticheta de pe axă: peste un milion, „1,2 <millions>” (dacă e dată eticheta). */
export function compactTick(n: number, locale?: string, millions?: string): string {
  return Math.abs(n) >= 1e6 && millions
    ? `${fmtNumber(Math.round(n / 1e5) / 10, locale)} ${millions}`
    : fmtNumber(n, locale);
}

export function seriesVar(c?: ChartColor): string {
  return c === 'compare'
    ? 'var(--chart-compare)'
    : c === 'now'
      ? 'var(--chart-now)'
      : `var(--chart-${c || 1})`;
}

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const set = () => setW(ref.current ? ref.current.clientWidth : 0);
    set();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(set);
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}
