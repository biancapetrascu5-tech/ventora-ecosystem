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

/* BrandZone din bundle.js: suprafața navy a Hub-ului; interiorul ia tema dark, cu tokenii
   suprafeței (--bz-*) calculați din tema locului. */
export function BrandZone({
  as: Tag = 'div',
  className,
  style,
  children,
  ...rest
}: BrandZoneProps) {
  return (
    <Tag data-brand className={cn(styles.root, className)} style={style} {...rest}>
      <div className={styles.in} data-theme="dark">
        {children}
      </div>
    </Tag>
  );
}
