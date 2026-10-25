'use client';

import { cn } from '../lib/cn';
import styles from './PageHeader.module.css';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  backHref?: string;
  className?: string;
}

export function PageHeader({ title, subtitle, actions, backHref, className }: PageHeaderProps) {
  return (
    <div className={cn(styles.root, className)}>
      <div className={styles.inner}>
        <div className={styles.left}>
          {backHref && (
            <a href={backHref} className={styles.backBtn} aria-label="Înapoi">
              ‹
            </a>
          )}
          <div>
            <h1 className={styles.title}>{title}</h1>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>
  );
}
