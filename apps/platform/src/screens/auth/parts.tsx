'use client';

import type { ReactNode } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { AuthLayout, Icon, LanguageSwitcher, cn, type IconName } from '@ventora/ui';
import { Glyph, type GlyphName } from '../glyphs';
import styles from './auth.module.css';

export type AnyIconName = IconName | GlyphName;
const GLYPH_NAMES = new Set<string>(['key-round', 'laptop', 'mail-check', 'message-square']);

/** Icon din packages/ui sau, pentru numele care lipsesc din registrul lui, Glyph. */
export function AnyIcon({ name, size = 16 }: { name: AnyIconName; size?: number }) {
  return GLYPH_NAMES.has(name) ? (
    <Glyph name={name as GlyphName} size={size} />
  ) : (
    <Icon icon={name as IconName} size={size} />
  );
}

/* Pagina de autentificare a Hub-ului (R-2F9): AuthLayout cu panoul de brand, selectorul de limbă
   și subsolul. Limba schimbată se salvează de container (cookie + refresh). */
export function AuthFrame({
  locale,
  onLocaleChange,
  wide,
  children,
}: {
  locale: string;
  onLocaleChange?: (code: string) => void;
  wide?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations();
  return (
    <AuthLayout
      languageSelector={
        <LanguageSwitcher value={locale} onChange={onLocaleChange} label={t('ui.language')} />
      }
      statement={
        <>
          {t('auth.panel.line1')}
          <br />
          {t('auth.panel.line2')}
        </>
      }
      footer={t('auth.footer.links')}
      wide={wide}
    >
      {children}
    </AuthLayout>
  );
}

/** .auth-head: pasul (opțional), titlul display-hub și textele de sub el. */
export function Head({
  title,
  step,
  wide = true,
  children,
}: {
  title: ReactNode;
  step?: ReactNode;
  wide?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={cn(styles.head, wide && styles.headWide)}>
      {step && <p className={cn('caption', styles.step)}>{step}</p>}
      <h1 className="display-hub">{title}</h1>
      {children}
    </div>
  );
}

/** .pr-line: iconiță de 16px + o propoziție. */
export function Line({
  icon,
  ok,
  children,
}: {
  icon: AnyIconName;
  ok?: boolean;
  children: ReactNode;
}) {
  return (
    <p className={cn('body-small', styles.line, ok && styles.lineOk)}>
      <AnyIcon name={icon} />
      <span>{children}</span>
    </p>
  );
}

/** .auth-note: linia de sus și o notă cu iconiță. */
export function Note({ icon, children }: { icon: AnyIconName; children: ReactNode }) {
  return (
    <div className={styles.note}>
      <AnyIcon name={icon} />
      {children}
    </div>
  );
}

/** Buton care arată ca un link (.v-link body-small), cu iconiță opțională (.tfa-lk). */
export function TextLink({
  icon,
  onClick,
  children,
}: {
  icon?: AnyIconName;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className={cn('v-link body-small', icon && styles.lk)} onClick={onClick}>
      {icon && <AnyIcon name={icon} />}
      {children}
    </button>
  );
}

export const PASSWORD_RULES = {
  length: (p: string) => p.length >= 10,
  digit: (p: string) => /\d/.test(p),
  upper: (p: string) => /[A-ZĂÂÎȘȚ]/.test(p),
};

export function passwordMeetsRules(p: string): boolean {
  return Object.values(PASSWORD_RULES).every((rule) => rule(p));
}

/** Cerințele parolei, bifate pe loc (lime când sunt îndeplinite), anunțate pe măsură ce se bifează. */
export function PasswordRequirements({
  id,
  password,
  labels,
}: {
  id?: string;
  password: string;
  labels: { length: string; digit: string; upper: string };
}) {
  return (
    <ul className={styles.reqs} id={id} aria-live="polite">
      {(Object.keys(PASSWORD_RULES) as (keyof typeof PASSWORD_RULES)[]).map((k) => {
        const ok = PASSWORD_RULES[k](password);
        return (
          <li key={k} className={cn(styles.req, ok && styles.reqOk)}>
            <Icon icon={ok ? 'circle-check' : 'circle'} size={16} />
            <span className="body-small">{labels[k]}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Ora (HH:MM) în fusul și limba paginii, pentru „după ora {time}”. */
export function useClock(): (d: Date) => string {
  const format = useFormatter();
  return (d) => format.dateTime(d, { hour: '2-digit', minute: '2-digit', hour12: false });
}
