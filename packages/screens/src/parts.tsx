'use client';

import type { ReactNode } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { AuthLayout, Icon, LanguageSwitcher, cn, type IconName } from '@ventora/ui';
import styles from './auth.module.css';

export type AuthBrand = 'hub' | 'founder';

/* Pagina de autentificare (R-2F9): AuthLayout cu panoul de brand.
   - Hub: selectorul de limbă, fraza „Afacerea ta. Într-un singur loc.”, subsolul;
   - Founder (S57, R-2F8): semnul Ventora + „Founder”, „Control Center”, sloganul; fără limbă. */
export function AuthFrame({
  brand = 'hub',
  locale = 'ro',
  onLocaleChange,
  wide,
  children,
}: {
  brand?: AuthBrand;
  locale?: string;
  onLocaleChange?: (code: string) => void;
  wide?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations();
  if (brand === 'founder')
    return (
      <AuthLayout
        brand="founder"
        statement={t('auth.2fa.founder.product')}
        tagline={t('auth.2fa.founder.tagline')}
        wide={wide}
      >
        {children}
      </AuthLayout>
    );
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
  icon: IconName;
  ok?: boolean;
  children: ReactNode;
}) {
  return (
    <p className={cn('body-small', styles.line, ok && styles.lineOk)}>
      <Icon icon={icon} size={16} />
      <span>{children}</span>
    </p>
  );
}

/** .auth-note: linia de sus și o notă cu iconiță. */
export function Note({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <div className={styles.note}>
      <Icon icon={icon} size={16} />
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
  icon?: IconName;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className={cn('v-link body-small', icon && styles.lk)} onClick={onClick}>
      {icon && <Icon icon={icon} size={16} />}
      {children}
    </button>
  );
}

/** Hub: 10 caractere; Founder: 12 (D4, ca backend-ul). */
export const MIN_PASSWORD = { hub: 10, founder: 12 } as const;

/** Cerințele parolei; litera mare = orice majusculă Unicode, inclusiv Ă Â Î Ș Ț (D5, ca serverul). */
export function passwordRules(minLength: number) {
  return {
    length: (p: string) => [...p].length >= minLength,
    digit: (p: string) => /\d/.test(p),
    upper: (p: string) => /\p{Lu}/u.test(p),
  };
}

export function passwordMeetsRules(p: string, minLength: number = MIN_PASSWORD.hub): boolean {
  return Object.values(passwordRules(minLength)).every((rule) => rule(p));
}

/** Cerințele, bifate pe loc (lime când sunt îndeplinite), anunțate pe măsură ce se bifează. */
export function PasswordRequirements({
  id,
  password,
  labels,
  minLength = MIN_PASSWORD.hub,
}: {
  id?: string;
  password: string;
  labels: { length: string; digit: string; upper: string };
  minLength?: number;
}) {
  const rules = passwordRules(minLength);
  return (
    <ul className={styles.reqs} id={id} aria-live="polite">
      {(Object.keys(rules) as (keyof typeof rules)[]).map((k) => {
        const ok = rules[k](password);
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

/** Ora (HH:MM) în limba și fusul paginii, pentru „după ora {time}”. */
export function useClock(): (d: Date) => string {
  const format = useFormatter();
  return (d) => format.dateTime(d, { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** D1: codurile de rezervă au 8 cifre, afișate în două grupe de 4. */
export function groupBackupCode(code: string): string {
  return /^\d{8}$/.test(code) ? `${code.slice(0, 4)} ${code.slice(4)}` : code;
}
