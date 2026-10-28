'use client';

import type React from 'react';
import { cn } from '@ventora/ui';
import f from './frames.module.css';

type Theme = 'light' | 'dark';

/* Q_Fr din preview.html — cadrul marcat pentru scripts/visual-check.mjs */
export function QFrame({
  theme,
  title,
  children,
}: {
  theme: Theme;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={f.qf} data-gallery-frame data-theme={theme}>
      <p className={`caption ${f.qft}`}>{title}</p>
      {children}
    </section>
  );
}

/* C3Themes din preview.html: c3pair (o coloană sub 2×360px) sau c3stack */
export function C3Pair({
  stack,
  render,
  style,
}: {
  stack?: boolean;
  render: (theme: Theme) => React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div className={f.base}>
      <div className={f.c3wrap}>
        <div className={f.d}>
          <div className={stack ? f.c3stack : f.c3pair}>
            {(['light', 'dark'] as const).map((th) => (
              <div key={th} className={f.c3f} data-gallery-frame data-theme={th} style={style}>
                {/* eslint-disable-next-line i18next/no-literal-string */}
                <p className={`caption ${f.c3lab}`}>{th === 'dark' ? 'Dark' : 'Light'}</p>
                {render(th)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* Row din preview.html: eticheta caption de 88px + conținutul */
export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={f.r}>
      <span className={`${f.l} caption`}>{label}</span>
      {children}
    </div>
  );
}

/* Frame din preview.html (Badge, Avatar…): .d > thgrid > thf, titlul caption semibold.
   `titleClass` = „heading” la previzualizările care folosesc titlu de secțiune. */
export function ThPair({
  render,
  titleClass = 'caption',
  as: Tag = 'section',
  min = 520,
}: {
  render: (theme: Theme) => React.ReactNode;
  titleClass?: string;
  as?: 'section' | 'div';
  /** Lățimea minimă a coloanei din grila preview-ului (thgrid 520, thg 420). */
  min?: number;
}) {
  return (
    <div className={f.base}>
      <div className={f.d}>
        <div
          className={f.thgrid}
          style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))` }}
        >
          {(['light', 'dark'] as const).map((th) => (
            <Tag key={th} className={f.thf} data-gallery-frame data-theme={th}>
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <p className={titleClass === 'heading' ? 'heading' : `${titleClass} ${f.thl}`}>
                {th === 'dark' ? 'Dark' : 'Light'}
              </p>
              {render(th)}
            </Tag>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Cadre thf unul sub altul: Frames({ stack: true }) (.d > thstack, titlu „heading”)
   sau Frame direct în .d (titlu „caption thl”, ex. BarChart). */
export function ThStack({
  render,
  titleClass = 'heading',
  bare,
}: {
  render: (theme: Theme) => React.ReactNode;
  titleClass?: 'heading' | 'caption';
  /** Cadrele stau direct în .d, fără .thstack. */
  bare?: boolean;
}) {
  const frames = (['light', 'dark'] as const).map((th) => (
    <section key={th} className={f.thf} data-gallery-frame data-theme={th}>
      {/* eslint-disable-next-line i18next/no-literal-string */}
      <p className={titleClass === 'heading' ? 'heading' : `caption ${f.thl}`}>
        {th === 'dark' ? 'Dark' : 'Light'}
      </p>
      {render(th)}
    </section>
  ));
  return (
    <div className={f.base}>
      <div className={f.d}>{bare ? frames : <div className={f.thstack}>{frames}</div>}</div>
    </div>
  );
}

/* Frames din preview.html (c2): .pv > section.pv-frame, cadrele unul sub altul.
   Reproducem doar Light și Dark — primele cadre cu data-theme. */
export function PvFrames({ render }: { render: (theme: Theme) => React.ReactNode }) {
  return (
    <div className={f.base}>
      <div className={f.pv}>
        {(['light', 'dark'] as const).map((th) => (
          <section key={th} className={f.pvFrame} data-gallery-frame data-theme={th}>
            {/* eslint-disable-next-line i18next/no-literal-string */}
            <p className="heading">{th === 'dark' ? 'Dark' : 'Light'}</p>
            {render(th)}
          </section>
        ))}
      </div>
    </div>
  );
}

export function PvCell({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div className={f.pvCell} style={style}>
      <p className={`caption ${f.pvLab}`}>{label}</p>
      {children}
    </div>
  );
}

/* OffsetNote: în preview.html cadrul vine după alte exemple și poate începe la o poziție
   fracționară (ex. y = 624,75). Captura pe element rotunjește marginile la pixeli întregi, deci
   aceeași înălțime (300,375px) iese 302px acolo și 301px la y = 16. offsetY mută cadrul cu
   aceeași fracțiune (desktop = 1280, phone = 390); conținutul cadrului nu se schimbă. */
export type OffsetY = { desktop: number; phone: number };

export function offsetStyle(o: OffsetY): React.CSSProperties {
  return {
    '--offset-desktop': `${o.desktop}px`,
    '--offset-phone': `${o.phone}px`,
  } as React.CSSProperties;
}

/* Q_Pair din preview.html: două coloane egale (și la 390px), Light apoi Dark */
export function QPair({
  cols,
  light,
  dark,
  children,
  offsetY,
}: {
  cols?: 1;
  /** Partea fracționară a poziției cadrului în preview.html (vezi OffsetNote). */
  offsetY?: OffsetY;
  light?: React.ReactNode;
  dark?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className={f.base}>
      <div className={f.qwrap}>
        <div
          className={cn(f.qfr, cols === 1 && f.qfr1, offsetY && f.offset)}
          style={offsetY ? offsetStyle(offsetY) : undefined}
        >
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <QFrame theme="light" title="Light">
            {light ?? children}
          </QFrame>
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <QFrame theme="dark" title="Dark">
            {dark ?? children}
          </QFrame>
        </div>
      </div>
    </div>
  );
}
