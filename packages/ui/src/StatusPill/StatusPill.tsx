'use client';

import { cn } from '../lib/cn';
import { Icon } from '../Icon/Icon';
import type { IconName } from '../Icon/Icon';
import styles from './StatusPill.module.css';

export type StatusPillTone = 'attention' | 'done' | 'danger' | 'neutral';

const DEFAULT_ICONS: Record<StatusPillTone, IconName> = {
  attention: 'warning',
  done: 'check',
  danger: 'error',
  neutral: 'minus',
};

export interface StatusPillProps {
  tone?: StatusPillTone;
  size?: 'sm' | 'md';
  icon?: IconName | false;
  children?: React.ReactNode;
  className?: string;
}

export function StatusPill({
  tone = 'neutral',
  size = 'md',
  icon,
  children,
  className,
}: StatusPillProps) {
  const resolvedIcon: IconName | false = icon === false ? false : (icon ?? DEFAULT_ICONS[tone]);
  return (
    <span className={cn(styles.root, styles[tone], size === 'sm' && styles.sm, className)}>
      {resolvedIcon !== false && (
        <Icon icon={resolvedIcon} size="sm" aria-hidden className={styles.icon} />
      )}
      {children}
    </span>
  );
}
