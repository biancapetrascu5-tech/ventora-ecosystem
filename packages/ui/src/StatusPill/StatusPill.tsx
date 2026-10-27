'use client';

import { cn } from '../lib/cn';
import { Icon } from '../Icon/Icon';
import type { IconName } from '../Icon/Icon';
import styles from './StatusPill.module.css';

export type StatusPillTone = 'attention' | 'done' | 'danger' | 'neutral';

const DEFAULT_ICONS: Record<StatusPillTone, IconName | null> = {
  attention: 'circle-dot',
  done: 'circle-check',
  danger: 'circle-alert',
  neutral: null,
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
  const resolvedIcon: IconName | null | false =
    icon === false ? false : (icon ?? DEFAULT_ICONS[tone]);
  return (
    <span className={cn(styles.root, styles[tone], size === 'sm' && styles.sm, className)}>
      {resolvedIcon === false ? null : resolvedIcon !== null ? (
        <Icon
          icon={resolvedIcon}
          size={12}
          strokeWidth={2.25}
          aria-hidden
          className={styles.icon}
        />
      ) : (
        <span className={styles.dot} aria-hidden />
      )}
      {children}
    </span>
  );
}
