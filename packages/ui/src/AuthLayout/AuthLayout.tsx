'use client';

import type { ReactNode } from 'react';
import { BrandZone } from '../BrandZone/BrandZone';
import { cn } from '../lib/cn';
import { Logo } from '../Logo/Logo';
import styles from './AuthLayout.module.css';

export interface AuthLayoutProps {
  children: ReactNode;
  /** LanguageSwitcher: în antetul foii; pe telefon, în banda de brand. */
  languageSelector?: ReactNode;
  footer?: ReactNode;
  theme?: 'light' | 'dark';
  brand?: 'hub' | 'founder';
  /** Hub: auth_line1 <br/> auth_line2 · Founder: auth_founder_product. */
  statement?: ReactNode;
  /** Doar Founder: auth_founder_tagline. */
  tagline?: ReactNode;
  /** Formular de 480px în loc de 400px. */
  wide?: boolean;
  className?: string;
}

/* AuthLayout din bundle.js (direcția B): panoul de brand (BrandZone) cu logo-ul, fraza și chevronii,
   foaia cu formularul; pe telefon (containerul ≤ 767px) panoul devine o bandă cu logo-ul și limba. */
export function AuthLayout({
  children,
  languageSelector,
  footer,
  theme,
  brand = 'hub',
  statement,
  tagline,
  wide = false,
  className,
}: AuthLayoutProps) {
  const founder = brand === 'founder';
  const mark = founder ? (
    <span className={styles.fx}>
      <Logo variant="mark" size={32} title="" />
      {/* eslint-disable-next-line i18next/no-literal-string -- numele produsului, ca în bundle */}
      <span className="heading">Founder</span>
    </span>
  ) : (
    <Logo size={40} />
  );
  const st = founder ? (
    statement || tagline ? (
      <>
        {statement && <span className={cn('display-xl', styles.product)}>{statement}</span>}
        {tagline && <span className={cn('body', styles.tag)}>{tagline}</span>}
      </>
    ) : null
  ) : statement ? (
    <span className="display-xl">{statement}</span>
  ) : null;
  return (
    <div className={cn(styles.auth, className)} data-theme={theme}>
      <div className={styles.split}>
        <BrandZone as="aside" className={styles.brand}>
          <div className={styles.top}>
            {mark}
            {languageSelector && <div className={styles.langband}>{languageSelector}</div>}
          </div>
          {st && <div className={styles.statement}>{st}</div>}
          <svg className={styles.chev} viewBox="0 0 176 240" aria-hidden="true">
            {[40, 72, 104].map((y) => (
              <polyline key={y} points={`32,${y} 88,${y + 80} 144,${y}`} />
            ))}
            <polyline points="48,168 88,224 128,168" />
          </svg>
          {/* eslint-disable-next-line i18next/no-literal-string -- textul fix din bundle */}
          <p className={cn('caption', styles.foot)}>© 2026 Ventora Systems</p>
        </BrandZone>
        <div className={styles.sheet}>
          {languageSelector && <header className={styles.head}>{languageSelector}</header>}
          <main className={styles.main}>
            <div className={cn(styles.form, wide && styles.wide)}>{children}</div>
          </main>
          {footer && <footer className={cn('caption', styles.footer)}>{footer}</footer>}
        </div>
      </div>
    </div>
  );
}
