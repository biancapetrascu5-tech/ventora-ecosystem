'use client';

import { Fragment, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Avatar, LanguageSwitcher, ProgressBar } from '@ventora/ui';
import type { ScreenMode } from '../services/BookingServicesView';
import s from './public.module.css';

/* The public booking page, the frame shared by BookingPublic and BookingDeposit (preview.html
   PubShell / Summary / Actions, 1:1): the business's header with the language switcher, the card
   with the step and the title, the summary on the side (desktop), the EasyBook line at the bottom.
   Props only: the public page (B.11) and the gallery draw the same component. */

export type PublicBusiness = { name: string; address: string };

export function PublicShell(p: {
  mode: ScreenMode;
  business: PublicBusiness;
  lang: string;
  onLang?: (lang: string) => void;
  /** „Pasul 4 din 4” */
  step?: { n: number; total: number };
  title?: string;
  aside?: ReactNode;
  foot?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations('booking.public');
  const ui = useTranslations('ui');
  const mob = p.mode === 'mobile';
  return (
    <div className={`${s.pb} ${mob ? s.m : ''}`} lang={p.lang}>
      <header className={s.head}>
        <div className={s.brand}>
          <Avatar name={p.business.name} shape="square" size={mob ? 'md' : 'lg'} />
          <div>
            <p className={mob ? 'subheading' : 'heading'}>{p.business.name}</p>
            <p className={`caption ${s.muted}`}>{p.business.address}</p>
          </div>
        </div>
        <LanguageSwitcher
          value={p.lang}
          onChange={p.onLang}
          variant={mob ? 'icon' : 'button'}
          label={ui('language')}
        />
      </header>
      <div className={s.main}>
        <main className={s.card}>
          {p.step && (
            <div className={s.step}>
              <ProgressBar
                value={Math.round((p.step.n / p.step.total) * 100)}
                size="sm"
                label={t('step', { n: p.step.n, total: p.step.total })}
              />
            </div>
          )}
          {p.title && (
            <h1 className={`${mob ? 'display-m' : 'display-l'} ${s.title}`}>{p.title}</h1>
          )}
          {p.children}
        </main>
        {p.aside && !mob ? <aside className={s.aside}>{p.aside}</aside> : null}
      </div>
      {p.foot !== false && <p className={`caption ${s.muted} ${s.foot}`}>{t('foot')}</p>}
    </div>
  );
}

/** The summary: service, person, when, price (and the deposit); `compact` = the phone's box. */
export function PublicSummary(p: {
  rows: [string, string][];
  compact?: boolean;
  /** „Anulare gratuită cu cel puțin 24 de ore înainte.” */
  policy?: string;
}) {
  const t = useTranslations('booking.public');
  return (
    <div className={`${s.sum} ${p.compact ? s.c : ''}`}>
      {!p.compact && <p className="subheading">{t('summary')}</p>}
      <dl className={s.kv}>
        {p.rows.map(([k, v]) => (
          <Fragment key={k}>
            <dt className="caption">{k}</dt>
            <dd className="body">{v}</dd>
          </Fragment>
        ))}
      </dl>
      {!p.compact && p.policy && <p className={`caption ${s.muted}`}>{p.policy}</p>}
    </div>
  );
}

/** „Înapoi” and the main button: side by side, stacked on a phone. */
export function PublicActions({ mode, children }: { mode: ScreenMode; children: ReactNode }) {
  return <div className={`${s.acts} ${mode === 'mobile' ? s.m : ''}`}>{children}</div>;
}
