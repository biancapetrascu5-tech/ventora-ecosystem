'use client';

import { type ElementType, type CSSProperties } from 'react';
import { cn } from '../lib/cn';
import styles from './BrandZone.module.css';

export interface BrandZoneProps {
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  children?: React.ReactNode;
  [key: string]: unknown;
}

export function BrandZone({
  as: Tag = 'div',
  className,
  style,
  children,
  ...rest
}: BrandZoneProps) {
  return (
    <Tag
      data-brand
      className={cn(styles.root, className)}
      style={style}
      {...rest}
    >
      {children}
    </Tag>
  );
}
