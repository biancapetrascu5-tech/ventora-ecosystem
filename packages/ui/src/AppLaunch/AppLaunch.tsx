'use client';

import { useLayoutEffect, useRef } from 'react';
import { AppIcon, APPS, type AppName } from '../AppIcon/AppIcon';
import { cn } from '../lib/cn';
import styles from './AppLaunch.module.css';

type Box = { left: number; top: number; width: number; height: number };

export interface AppLaunchProps {
  app: AppName;
  /** Numele afișat (implicit numele din APPS). */
  name?: string;
  /** Iconul și fișa din AppDock (coordonate de ecran, getBoundingClientRect). */
  from?: Box;
  fromCard?: Box;
  /** Iconul în coordonatele containerului (în locul lui `from`). */
  fromLocal?: Box;
  /** Iconul din dock, care crește și dispare când pornește foaia. */
  iconEl?: Element | null;
  onDone?: () => void;
  /** În interiorul unui container (position: absolute), nu peste toată fereastra. */
  contained?: boolean;
  /** 0–1: animația oprită într-un punct (documentație, capturi). */
  progress?: number;
  /** Aplicația se încarcă greu: iconul rămâne în centru, cu numele dedesubt. */
  waiting?: boolean;
  /** S.launch_opening, ex. (app) => `Se deschide ${app}`. */
  openingLabel: (app: string) => string;
}

const LAUNCH_EASE = 'cubic-bezier(0.2, 0, 0, 1)';
const LAUNCH_SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const LAUNCH_T = 850;

/* AppLaunch din bundle.js: aplicația crește din fișa din dock până la ecranul întreg, iconul trece
   prin centru și se așază în bara aplicației; conținutul apare. */
export function AppLaunch({
  app,
  name,
  from,
  fromLocal,
  fromCard,
  iconEl,
  onDone,
  contained = false,
  progress,
  waiting = false,
  openingLabel,
}: AppLaunchProps) {
  const ref = useRef<HTMLDivElement>(null);
  const nm = name ?? APPS[app]?.name ?? app;

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const fr = root.getBoundingClientRect();
    const W = fr.width;
    const H = fr.height;
    const q = (k: string) => root.querySelector<HTMLElement>(`[data-launch="${k}"]`)!;
    const sheet = q('sheet');
    const icon = q('icon');
    const appEl = q('app');
    const title = q('title');
    const nmEl = q('name');
    const loc = (r?: Box) =>
      r
        ? fromLocal
          ? { x: r.left, y: r.top, w: r.width, h: r.height }
          : { x: r.left - fr.left, y: r.top - fr.top, w: r.width, h: r.height }
        : null;
    const I = loc(fromLocal ?? from) ?? { x: W / 2 - 28, y: H / 2 - 28, w: 56, h: 56 };
    const C = loc(fromCard) ?? { x: I.x - 24, y: I.y - 20, w: I.w + 48, h: I.h + 56 };
    const Sz = 72;
    const T = { x: 20, y: 14, w: 28 };
    const M = 88;
    const mx = W / 2 - M / 2;
    const my = H / 2 - M / 2 - 24;
    const big = 1.12;
    const ix = I.x - (I.w * (big - 1)) / 2;
    const iy = I.y - (I.h * (big - 1)) / 2;
    const A: Animation[] = [];
    const reduce =
      progress == null && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const clip = `inset(${C.y}px ${W - C.x - C.w}px ${H - C.y - C.h}px ${C.x}px round 18px)`;
    const end = waiting ? { x: mx, y: my, w: M } : T;
    if (reduce) {
      icon.style.transform = `translate(${end.x}px,${end.y}px) scale(${end.w / Sz})`;
      if (waiting) nmEl.style.opacity = '1';
      A.push(root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, fill: 'both' }));
    } else {
      if (iconEl && progress == null) {
        A.push(
          iconEl.animate([{ transform: 'scale(1)' }, { transform: `scale(${big})` }], {
            duration: 160,
            easing: LAUNCH_SPRING,
            fill: 'forwards',
          }),
        );
        A.push(
          iconEl.animate([{ opacity: 1 }, { opacity: 0 }], {
            delay: 150,
            duration: 1,
            fill: 'forwards',
          }),
        );
      }
      A.push(
        sheet.animate(
          [
            { clipPath: clip, opacity: 0 },
            { clipPath: clip, opacity: 1, offset: 0.08 },
            { clipPath: 'inset(0px 0px 0px 0px round 0px)', opacity: 1 },
          ],
          { delay: 150, duration: 420, easing: LAUNCH_EASE, fill: 'both' },
        ),
      );
      const frames: Keyframe[] = [
        { transform: `translate(${ix}px,${iy}px) scale(${(I.w * big) / Sz})`, easing: LAUNCH_EASE },
        {
          transform: `translate(${mx}px,${my}px) scale(${M / Sz})`,
          offset: waiting ? 1 : 0.6,
          easing: LAUNCH_EASE,
        },
      ];
      if (!waiting)
        frames.push({ transform: `translate(${end.x}px,${end.y}px) scale(${end.w / Sz})` });
      A.push(icon.animate(frames, { delay: 150, duration: waiting ? 420 : 700, fill: 'both' }));
      if (waiting) {
        A.push(
          nmEl.animate([{ opacity: 0 }, { opacity: 1 }], {
            delay: 420,
            duration: 220,
            fill: 'both',
          }),
        );
      } else {
        A.push(
          appEl.animate(
            [
              { opacity: 0, transform: 'translateY(16px)' },
              { opacity: 1, transform: 'none' },
            ],
            { delay: 560, duration: 300, easing: LAUNCH_EASE, fill: 'both' },
          ),
        );
        A.push(
          title.animate([{ opacity: 0 }, { opacity: 1 }], {
            delay: 620,
            duration: 200,
            fill: 'both',
          }),
        );
      }
    }
    if (progress != null) {
      for (const a of A) {
        a.pause();
        a.currentTime = progress * LAUNCH_T;
      }
      return () => A.forEach((a) => a.cancel());
    }
    if (waiting) return () => A.forEach((a) => a.cancel());
    const k = setTimeout(() => onDone?.(), reduce ? 120 : 900);
    return () => {
      clearTimeout(k);
      A.forEach((a) => a.cancel());
    };
    // Ca în bundle: animația pornește o dată și se reia doar la alt progres sau la „waiting”.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, waiting]);

  const sk = (w: number | string, h: number, r?: number) => (
    <span className={styles.sk} style={{ width: w, height: h, borderRadius: r }} />
  );
  return (
    <div
      ref={ref}
      className={cn(styles.launch, contained && styles.contained, waiting && styles.isWaiting)}
    >
      <div className={styles.sheet} data-launch="sheet">
        <div className={styles.bar}>
          <span className={cn('body-strong', styles.title)} data-launch="title">
            {nm}
          </span>
          <span className={styles.barsk}>
            {sk(180, 32, 8)}
            {sk(32, 32, 16)}
          </span>
        </div>
        <div className={styles.app} data-launch="app">
          <div className={styles.head}>
            {sk('34%', 28)}
            {sk(120, 36, 8)}
          </div>
          <div className={styles.grid}>
            {Array.from({ length: 15 }, (_, i) => (
              <span key={i} className={styles.cell} />
            ))}
          </div>
        </div>
        <span className={cn('display-m', styles.name)} data-launch="name">
          {nm}
        </span>
      </div>
      <span className={styles.icon} data-launch="icon">
        <AppIcon app={app} size={72} />
      </span>
      <span className={styles.sr}>
        <span aria-live="polite">{openingLabel(nm)}</span>
      </span>
    </div>
  );
}
