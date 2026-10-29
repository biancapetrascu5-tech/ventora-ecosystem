'use client';

import { cn } from '../lib/cn';
import styles from './ProgressBar.module.css';

export interface ProgressBarProps {
  /** Omit for an indeterminate bar. */
  value?: number;
  label?: string;
  showValue?: boolean;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'default' | 'done';
  className?: string;
}

export function ProgressBar({
  value,
  label,
  showValue = false,
  size = 'md',
  tone = 'default',
  className,
}: ProgressBarProps) {
  const indeterminate = value == null;
  const v = Math.max(0, Math.min(100, value ?? 0));
  const done = tone === 'done' || v >= 100;
  return (
    <div className={cn(styles.wrap, className)}>
      {(label || showValue) && (
        <div className={styles.top}>
          {label && <span className="caption">{label}</span>}
          {showValue && !indeterminate && <span className="caption v-num">{Math.round(v)}%</span>}
        </div>
      )}
      <div
        className={cn(
          styles.bar,
          styles[size],
          indeterminate && styles.indeterminate,
          done && styles.done,
        )}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : Math.round(v)}
      >
        <span className={styles.fill} style={indeterminate ? undefined : { width: `${v}%` }} />
      </div>
    </div>
  );
}
