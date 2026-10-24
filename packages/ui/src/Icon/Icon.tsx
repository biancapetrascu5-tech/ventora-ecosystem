import type { LucideIcon, LucideProps } from 'lucide-react';
import styles from './Icon.module.css';
import { cn } from '../lib/cn';

export type IconSize = 'sm' | 'md' | 'lg';

const SIZE_PX: Record<IconSize, number> = { sm: 16, md: 20, lg: 24 };

export interface IconProps extends Omit<LucideProps, 'size' | 'ref'> {
  icon: LucideIcon;
  size?: IconSize;
  label?: string;
  className?: string;
}

export function Icon({ icon: LucideIconComp, size = 'md', label, className, ...props }: IconProps) {
  return (
    <LucideIconComp
      size={SIZE_PX[size]}
      strokeWidth={1.75}
      aria-hidden={!label || undefined}
      aria-label={label}
      className={cn(styles.root, className)}
      focusable={false}
      {...props}
    />
  );
}
