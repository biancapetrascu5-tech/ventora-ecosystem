'use client';

import {
  ProgressBar as RACProgressBar,
  type ProgressBarProps as RACProgressBarProps,
} from 'react-aria-components';
import { cn } from '../lib/cn';
import styles from './ProgressBar.module.css';

export interface ProgressBarProps extends Omit<RACProgressBarProps, 'className' | 'style'> {
  label?: string;
  value?: number;
  showValue?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function ProgressBar({
  label,
  value,
  showValue,
  size = 'md',
  className,
  ...props
}: ProgressBarProps) {
  const isIndeterminate = value === undefined;
  const pct = isIndeterminate ? undefined : Math.min(100, Math.max(0, value));

  return (
    <RACProgressBar
      {...props}
      value={pct}
      minValue={0}
      maxValue={100}
      isIndeterminate={isIndeterminate}
      aria-label={label ?? 'progress'}
      className={cn(styles.root, className)}
    >
      {() => (
        <>
          {(label || showValue) && (
            <div className={styles.header}>
              {label && <span className={styles.label}>{label}</span>}
              {showValue && pct !== undefined && (
                <span className={styles.value}>{Math.round(pct)}%</span>
              )}
            </div>
          )}
          <div className={cn(styles.track, size === 'sm' && styles.trackSm)}>
            <div
              className={cn(
                styles.fill,
                isIndeterminate && styles.indeterminate,
                pct === 100 && styles.complete,
              )}
              style={isIndeterminate ? undefined : { width: `${pct}%` }}
            />
          </div>
        </>
      )}
    </RACProgressBar>
  );
}
