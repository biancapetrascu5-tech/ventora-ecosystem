'use client';

import { cn } from '../lib/cn';
import { fmtNumber } from '../lib/fmt';
import styles from './Badge.module.css';

export type BadgeTone = 'attention' | 'primary' | 'neutral';

export interface BadgeProps {
  tone?: BadgeTone;
  count?: number;
  /** Above `max` the count reads "max+". */
  max?: number;
  dot?: boolean;
  label?: string;
  locale?: string;
  children?: React.ReactNode;
  className?: string;
}

export function Badge({
  tone = 'neutral',
  count,
  max = 99,
  dot = false,
  label,
  locale,
  children,
  className,
}: BadgeProps) {
  if (dot) {
    return (
      <span
        className={cn(styles.root, styles.dot, styles[tone], className)}
        role={label ? 'img' : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
      />
    );
  }
  const text =
    count != null
      ? count > max
        ? `${fmtNumber(max, locale)}+`
        : fmtNumber(count, locale)
      : children;
  return (
    <span
      className={cn(styles.root, count != null && styles.count, styles[tone], 'caption', className)}
      aria-label={label}
    >
      {text}
    </span>
  );
}
