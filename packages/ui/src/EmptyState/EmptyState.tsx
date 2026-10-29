'use client';

import { cn } from '../lib/cn';
import { Icon } from '../Icon/Icon';
import type { IconName } from '../Icon/Icon';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  icon?: IconName;
  title?: React.ReactNode;
  description?: React.ReactNode;
  size?: 'sm' | 'md';
  actions?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon = 'inbox',
  title,
  description,
  actions,
  size = 'md',
  className,
}: EmptyStateProps) {
  return (
    <div className={cn(styles.root, size === 'sm' && styles.sm, className)}>
      <span className={styles.mark} aria-hidden="true">
        <Icon icon={icon} size={size === 'sm' ? 20 : 24} />
      </span>
      {title && <p className={size === 'sm' ? 'subheading' : 'heading'}>{title}</p>}
      {description && <p className={cn(styles.desc, 'body')}>{description}</p>}
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
