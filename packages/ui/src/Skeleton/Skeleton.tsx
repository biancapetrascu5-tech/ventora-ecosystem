'use client';

import { cn } from '../lib/cn';
import styles from './Skeleton.module.css';

export interface SkeletonProps {
  shape?: 'line' | 'block' | 'circle';
  width?: number | string;
  height?: number | string;
  className?: string;
}

export function Skeleton({
  width = '100%',
  height = 12,
  shape = 'line',
  className,
}: SkeletonProps) {
  return (
    <span
      className={cn(styles.root, styles[shape], className)}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

export interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <span className={cn(styles.text, className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '60%' : '100%'} height={12} />
      ))}
    </span>
  );
}
