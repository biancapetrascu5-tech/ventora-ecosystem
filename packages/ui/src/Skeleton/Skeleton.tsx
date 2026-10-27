'use client';

import { cn } from '../lib/cn';
import styles from './Skeleton.module.css';

export interface SkeletonProps {
  shape?: 'block' | 'circle' | 'text';
  width?: number | string;
  height?: number | string;
  style?: React.CSSProperties;
  className?: string;
}

export function Skeleton({ shape = 'block', width, height, style, className }: SkeletonProps) {
  return (
    <span
      className={cn(styles.root, styles[shape], className)}
      style={{
        width: width != null ? (typeof width === 'number' ? `${width}px` : width) : undefined,
        height: height != null ? (typeof height === 'number' ? `${height}px` : height) : undefined,
        ...style,
      }}
      aria-hidden
    />
  );
}

export interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <span className={cn(styles.textBlock, className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          shape="text"
          style={{ width: i === lines - 1 && lines > 1 ? '65%' : '100%' } as React.CSSProperties}
        />
      ))}
    </span>
  );
}
