'use client';

import { cn } from '../lib/cn';
import { Icon } from '../Icon/Icon';
import { fmtNumber } from '../lib/fmt';
import styles from './Stat.module.css';

export type StatTone = 'attention' | 'done' | 'danger';

export interface StatDelta {
  value: string;
  period?: string;
  direction?: 'up' | 'down';
  good?: boolean;
}

export interface StatProps {
  label: string;
  value: string | number;
  locale?: string;
  unit?: string;
  hint?: string;
  tone?: StatTone;
  onClick?: () => void;
  delta?: StatDelta;
  className?: string;
}

function DeltaIcon({ direction }: { direction?: 'up' | 'down' }) {
  if (!direction) return null;
  return (
    <Icon
      icon={direction === 'up' ? 'arrow-up' : 'arrow-down'}
      size="sm"
      aria-hidden
      className={styles.deltaIcon}
    />
  );
}

function StatBody({
  label,
  value,
  locale,
  unit,
  hint,
  tone,
  delta,
  onClick,
  className,
}: StatProps) {
  const isPositiveDelta =
    delta?.good !== undefined
      ? delta.good
      : delta?.direction === 'up' || (delta?.value.startsWith('+') && delta?.direction !== 'down');

  const inner = (
    <>
      <span className={styles.label}>{label}</span>
      <span className={styles.valueRow}>
        <span className={styles.value}>
          {typeof value === 'number' ? fmtNumber(value, locale) : value}
        </span>
        {unit && <span className={styles.unit}>{unit}</span>}
      </span>
      {hint && <span className={styles.hint}>{hint}</span>}
      {delta && (
        <span className={cn(styles.delta, isPositiveDelta ? styles.deltaUp : styles.deltaDown)}>
          <DeltaIcon direction={delta.direction} />
          <span>{delta.value}</span>
          {delta.period && <span className={styles.deltaPeriod}>{delta.period}</span>}
        </span>
      )}
    </>
  );

  const baseClass = cn(styles.root, tone && styles[tone], onClick && styles.clickable, className);

  if (onClick) {
    return (
      <button type="button" className={baseClass} onClick={onClick}>
        {inner}
      </button>
    );
  }
  return <div className={baseClass}>{inner}</div>;
}

export function Stat(props: StatProps) {
  return <StatBody {...props} />;
}

export function StatGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn(styles.group, className)}>{children}</div>;
}
