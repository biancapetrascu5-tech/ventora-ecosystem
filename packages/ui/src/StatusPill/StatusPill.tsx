'use client';

import { cn } from '../lib/cn';
import { Icon } from '../Icon/Icon';
import type { IconName } from '../Icon/Icon';
import styles from './StatusPill.module.css';

export type StatusPillTone = 'attention' | 'done' | 'danger' | 'neutral' | 'progress';

const TONE_ICON: Record<StatusPillTone, IconName | null> = {
  attention: 'circle-dot',
  done: 'circle-check',
  danger: 'circle-alert',
  neutral: null,
  progress: null,
};

export interface StatusPillProps {
  tone?: StatusPillTone;
  size?: 'sm' | 'md';
  /** `false` drops the icon and shows the dot. */
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
  const ic = icon === false ? null : (icon ?? TONE_ICON[tone]);
  return (
    <span
      className={cn(styles.root, styles[tone], size === 'sm' && styles.sm, 'caption', className)}
    >
      {ic ? (
        <Icon icon={ic} size={12} strokeWidth={2.25} />
      ) : (
        <span className={styles.dot} aria-hidden="true" />
      )}
      <span>{children}</span>
    </span>
  );
}
