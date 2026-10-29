'use client';

import { cn } from '../lib/cn';
import styles from './StatusDot.module.css';

export type StatusDotTone = 'attention' | 'done' | 'danger' | 'neutral' | 'offline';

export interface StatusDotProps {
  tone?: StatusDotTone;
  label?: string;
  /** Keeps the label for screen readers only (e.g. inside an Avatar). */
  hideLabel?: boolean;
  className?: string;
}

export function StatusDot({
  tone = 'neutral',
  label,
  hideLabel = false,
  className,
}: StatusDotProps) {
  return (
    <span className={cn(styles.root, styles[tone], className)}>
      <span className={styles.dot} aria-hidden="true" />
      {label && <span className={cn('body-small', hideLabel && styles.sr)}>{label}</span>}
    </span>
  );
}
