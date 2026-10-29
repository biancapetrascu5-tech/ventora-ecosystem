'use client';

import type { ReactNode } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { AuthLayout, Icon, cn, type IconName } from '@ventora/ui';
import { Glyph, type GlyphName } from '../glyphs';
import styles from './auth.module.css';

/* Copia pentru Founder a pieselor din apps/platform/src/screens/auth/parts.tsx (o aplicație nu
   importă din alta; pachetul comun e NECESITĂ DECIZIE). Diferența: AuthLayout cu brand="founder",
   fără selector de limbă și fără subsol (S57, R-2F8). */

export type AnyIconName = IconName | GlyphName;
const GLYPH_NAMES = new Set<string>(['key-round', 'laptop', 'mail-check', 'message-square']);

export function AnyIcon({ name, size = 16 }: { name: AnyIconName; size?: number }) {
  return GLYPH_NAMES.has(name) ? (
    <Glyph name={name as GlyphName} size={size} />
  ) : (
    <Icon icon={name as IconName} size={size} />
  );
}

/** Pagina de autentificare Founder: semnul Ventora + „Founder”, „Control Center”, sloganul. */
export function AuthFrame({ children }: { locale?: string; children: ReactNode }) {
  const t = useTranslations('auth.2fa.founder');
  return (
    <AuthLayout brand="founder" statement={t('product')} tagline={t('tagline')}>
      {children}
    </AuthLayout>
  );
}

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

export function Note({ icon, children }: { icon: AnyIconName; children: ReactNode }) {
  return (
    <div className={styles.note}>
      <AnyIcon name={icon} />
      {children}
    </div>
  );
}

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

export function useClock(): (d: Date) => string {
  const format = useFormatter();
  return (d) => format.dateTime(d, { hour: '2-digit', minute: '2-digit', hour12: false });
}
