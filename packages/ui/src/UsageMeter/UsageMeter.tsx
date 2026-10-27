'use client';

import { cn } from '../lib/cn';
import { Icon } from '../Icon/Icon';
import styles from './UsageMeter.module.css';

export interface UsageMeterProps {
  label: string;
  used: number;
  limit?: number;
  unit?: string;
  format?: (n: number) => string;
  compact?: boolean;
  onUpgrade?: () => void;
  className?: string;
}

function fmt(n: number, format?: (n: number) => string): string {
  if (format) return format(n);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

function toneClass(pct: number): string {
  if (pct >= 100) return styles.fillFull;
  if (pct >= 85) return styles.fillWarning;
  return '';
}

export function UsageMeter({
  label,
  used,
  limit,
  unit,
  format,
  compact,
  onUpgrade,
  className,
}: UsageMeterProps) {
  const hasMeter = limit !== undefined && limit > 0;
  const pct = hasMeter ? Math.min(100, Math.round((used / limit!) * 100)) : 0;
  const isAtLimit = hasMeter && pct >= 100;

  if (compact) {
    return (
      <div className={cn(styles.compact, className)}>
        <div className={styles.compactRow}>
          <span className={styles.compactLabel}>{label}</span>
          {hasMeter && (
            <span className={cn(styles.compactCount, isAtLimit && styles.countFull)}>
              {fmt(used, format)}/{fmt(limit!, format)}
              {unit ? ` ${unit}` : ''}
            </span>
          )}
        </div>
        {hasMeter && (
          <div className={styles.track}>
            <div className={cn(styles.fill, toneClass(pct))} style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn(styles.root, className)}>
      <div className={styles.row}>
        <span className={styles.label}>{label}</span>
        <span className={cn(styles.count, isAtLimit && styles.countFull)}>
          {hasMeter
            ? `${fmt(used, format)}/${fmt(limit!, format)}${unit ? ` ${unit}` : ''}`
            : fmt(used, format)}
        </span>
      </div>
      {hasMeter && (
        <div className={styles.track}>
          <div className={cn(styles.fill, toneClass(pct))} style={{ width: `${pct}%` }} />
        </div>
      )}
      {isAtLimit && onUpgrade && (
        <button type="button" className={styles.upgrade} onClick={onUpgrade}>
          <Icon icon="star" size="sm" aria-hidden />
          Upgrade
        </button>
      )}
    </div>
  );
}
