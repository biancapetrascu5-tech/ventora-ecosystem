'use client';

import { cn } from '../lib/cn';
import { Icon } from '../Icon/Icon';
import type { IconName } from '../Icon/Icon';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  description?: string;
  size?: 'sm' | 'md';
  actions?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  size = 'md',
  actions,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn(styles.root, size === 'sm' && styles.sm, className)} role="status">
      {icon && (
        <span className={styles.iconWrap} aria-hidden>
          <Icon icon={icon} size={size === 'sm' ? 'md' : 'lg'} className={styles.icon} />
        </span>
      )}
      <p className={styles.title}>{title}</p>
      {description && <p className={styles.desc}>{description}</p>}
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
