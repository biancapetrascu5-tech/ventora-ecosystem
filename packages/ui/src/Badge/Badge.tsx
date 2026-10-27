'use client';

import { cn } from '../lib/cn';
import styles from './Badge.module.css';

export type BadgeTone = 'attention' | 'primary' | 'neutral';

export interface BadgeProps {
  tone?: BadgeTone;
  count?: number;
  dot?: boolean;
  label?: string;
  children?: React.ReactNode;
  className?: string;
}

export function Badge({ tone = 'neutral', count, dot, label, children, className }: BadgeProps) {
  if (dot) {
    return (
      <span
        className={cn(styles.dot, styles[`dot-${tone}`], className)}
        role={label ? 'img' : undefined}
        aria-label={label}
      />
    );
  }

  if (count !== undefined) {
    const display = count > 99 ? '99+' : String(count);
    return (
      <span className={cn(styles.count, styles[tone], className)} aria-label={label ?? `${count}`}>
        {display}
      </span>
    );
  }

  return <span className={cn(styles.label, styles[tone], className)}>{children}</span>;
}
