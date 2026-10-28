'use client';

import { cn } from '../lib/cn';
import { Icon, type IconName } from '../Icon/Icon';
import { fmtNumber } from '../lib/fmt';
import styles from './Stat.module.css';

export type StatTone = 'neutral' | 'attention';

export interface StatDelta {
  value: string;
  period?: string;
  /** Implicit: „down” dacă valoarea începe cu − sau -, altfel „up”. */
  direction?: 'up' | 'down';
  /** Implicit: creșterea e bună. */
  good?: boolean;
  /** Textul citit de cititoarele de ecran în locul valorii. */
  srValue?: string;
}

export interface StatProps {
  label: string;
  value: string | number;
  locale?: string;
  unit?: string;
  hint?: string;
  icon?: IconName;
  tone?: StatTone;
  onClick?: () => void;
  delta?: StatDelta;
  className?: string;
}

export function Stat({
  label,
  value,
  locale,
  unit,
  hint,
  icon,
  tone = 'neutral',
  delta,
  onClick,
  className,
}: StatProps) {
  const dir =
    delta &&
    (delta.direction ??
      (/^[−-]/.test(String(delta.value).trim()) ? ('down' as const) : ('up' as const)));
  const good = delta && (delta.good ?? dir === 'up');
  const foot = [delta?.period, hint].filter(Boolean).join(' · ');

  const inner = (
    <>
      <span className={cn(styles.label, 'body-small')}>
        {tone === 'attention' && <span className={styles.mark} aria-hidden="true" />}
        {icon && <Icon icon={icon} size="sm" aria-hidden />}
        {label}
      </span>
      <span className={styles.value}>
        {typeof value === 'number' ? fmtNumber(value, locale) : value}
        {unit && <span className={cn(styles.unit, 'body')}>{unit}</span>}
      </span>
      {(delta || hint) && (
        <span className={cn(styles.foot, 'body-small')}>
          {delta && (
            <span className={cn(styles.delta, good ? styles.good : styles.bad)}>
              <Icon
                icon={dir === 'down' ? 'arrow-down-right' : 'arrow-up-right'}
                size={14}
                strokeWidth={2}
                aria-hidden
              />
              <span className="body-strong" aria-hidden={delta.srValue ? true : undefined}>
                {delta.value}
              </span>
              {delta.srValue && <span className={styles.sr}>{delta.srValue}</span>}
            </span>
          )}
          {foot && <span>{foot}</span>}
        </span>
      )}
    </>
  );

  const rootClass = cn(styles.root, styles[tone], onClick && styles.clickable, className);

  if (onClick) {
    return (
      <button type="button" className={rootClass} onClick={onClick}>
        {inner}
      </button>
    );
  }
  return <div className={rootClass}>{inner}</div>;
}

/* .v-stats din bundle.css */
export function StatGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn(styles.group, className)}>{children}</div>;
}
