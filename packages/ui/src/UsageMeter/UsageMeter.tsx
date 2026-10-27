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
  warnAt?: number;
  onUpgrade?: () => void;
  className?: string;
  /** Override text for "n remaining" (receives formatted remaining count) */
  remainingLabel?: (n: string) => string;
  nearLimitLabel?: string;
  atLimitLabel?: string;
  atLimitHint?: string;
  upgradeLabel?: string;
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
  unit = '',
  format,
  compact,
  warnAt = 0.8,
  onUpgrade,
  className,
  remainingLabel = (n) => `Mai ai ${n}`,
  nearLimitLabel = 'Te apropii de limita planului',
  atLimitLabel = 'Ai atins limita planului',
  atLimitHint = 'Ce ai deja rămâne neatins. Ca să adaugi altele, mărește planul.',
  upgradeLabel = 'Mărește planul',
}: UsageMeterProps) {
  const hasMeter = limit !== undefined && limit > 0;
  const pct = hasMeter ? Math.min(100, Math.round((used / limit!) * 100)) : 0;
  const isAtLimit = hasMeter && pct >= 100;
  const isWarn = hasMeter && !isAtLimit && pct / 100 >= warnAt;
  const remaining = hasMeter ? limit! - used : 0;

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
      {hasMeter && !isAtLimit && isWarn && <p className={styles.warnMsg}>{nearLimitLabel}</p>}
      {hasMeter && !isAtLimit && !isWarn && remaining > 0 && (
        <p className={styles.remaining}>{remainingLabel(fmt(remaining, format))}</p>
      )}
      {isAtLimit && (
        <div className={styles.limitPanel}>
          <p className={styles.limitTitle}>{atLimitLabel}</p>
          <p className={styles.limitHint}>{atLimitHint}</p>
          {onUpgrade && (
            <button type="button" className={styles.upgrade} onClick={onUpgrade}>
              <Icon icon="star" size="sm" aria-hidden />
              {upgradeLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
