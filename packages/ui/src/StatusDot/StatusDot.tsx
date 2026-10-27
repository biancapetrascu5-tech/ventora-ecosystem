'use client';

import { cn } from '../lib/cn';
import styles from './StatusDot.module.css';

export type StatusDotTone = 'attention' | 'done' | 'danger' | 'neutral' | 'offline';

export interface StatusDotProps {
  tone: StatusDotTone;
  label?: string;
  className?: string;
}

export function StatusDot({ tone, label, className }: StatusDotProps) {
  return (
    <span
      className={cn(styles.root, styles[tone], className)}
      role={label ? 'img' : undefined}
      aria-label={label}
    />
  );
}
