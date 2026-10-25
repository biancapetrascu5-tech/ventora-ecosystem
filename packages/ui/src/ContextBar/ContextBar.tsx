'use client';

import { cn } from '../lib/cn';
import styles from './ContextBar.module.css';

export interface ContextBarProps {
  logo?: React.ReactNode;
  title?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function ContextBar({ logo, title, actions, className }: ContextBarProps) {
  return (
    <header className={cn(styles.root, className)} role="banner">
      <div className={styles.inner}>
        {(logo || title) && (
          <div className={styles.brand}>
            {logo && <div className={styles.logo}>{logo}</div>}
            {title && <span className={styles.title}>{title}</span>}
          </div>
        )}
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </header>
  );
}
