'use client';

import type { LucideProps } from 'lucide-react';
import { ICON_REGISTRY, type IconName } from './icons';
import styles from './Icon.module.css';
import { cn } from '../lib/cn';

export type { IconName };
export type IconSize = 'sm' | 'md' | 'lg';

const SIZE_PX: Record<IconSize, number> = { sm: 16, md: 20, lg: 24 };

export interface IconProps extends Omit<LucideProps, 'size' | 'ref'> {
  icon: IconName;
  size?: IconSize | number;
  label?: string;
  className?: string;
}

export function Icon({ icon, size = 'md', label, className, ...props }: IconProps) {
  const LucideIconComp = ICON_REGISTRY[icon];
  const px = typeof size === 'number' ? size : SIZE_PX[size];
  return (
    <LucideIconComp
      size={px}
      strokeWidth={1.75}
      aria-hidden={!label || undefined}
      aria-label={label}
      className={cn(styles.root, className)}
      focusable={false}
      {...props}
    />
  );
}
