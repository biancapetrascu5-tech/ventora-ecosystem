'use client';

import type { ReactNode } from 'react';
import { Icon } from '../Icon/Icon';
import { cn } from '../lib/cn';
import styles from './PageHeader.module.css';

export interface Breadcrumb {
  label: string;
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export interface PageHeaderProps {
  title: string;
  /** Propoziția de sub titlu (.v-pageheader__desc). */
  description?: ReactNode;
  /** @deprecated folosește `description`. */
  subtitle?: string;
  /** Firimiturile; ultima e pagina curentă. */
  breadcrumbs?: Breadcrumb[];
  /** Eticheta navigației de firimituri (S.breadcrumbs, ex. „Unde ești”). */
  breadcrumbsLabel?: string;
  /** Stări sub descriere (StatusPill…). */
  meta?: ReactNode;
  actions?: ReactNode;
  /** Tabs sub titlu. */
  tabs?: ReactNode;
  className?: string;
}

/* PageHeader din bundle.js: firimituri, titlu „title”, descriere muted (72ch), stări, acțiuni, taburi. */
export function PageHeader({
  title,
  description,
  subtitle,
  breadcrumbs,
  breadcrumbsLabel,
  meta,
  actions,
  tabs,
  className,
}: PageHeaderProps) {
  const desc = description ?? subtitle;
  return (
    <div className={cn(styles.root, className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label={breadcrumbsLabel} className={styles.crumbs}>
          <ol>
            {breadcrumbs.map((b, i) => (
              <li key={i} className="body-small">
                {i < breadcrumbs.length - 1 ? (
                  <a href={b.href} onClick={b.onClick} className={styles.link}>
                    {b.label}
                  </a>
                ) : (
                  <span aria-current="page">{b.label}</span>
                )}
                {i < breadcrumbs.length - 1 && (
                  <Icon icon="chevron-right" size={14} className={styles.sep} />
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className={styles.row}>
        <div className={styles.titles}>
          <h1 className="title">{title}</h1>
          {desc && <p className={cn(styles.desc, 'body')}>{desc}</p>}
          {meta && <div className={styles.meta}>{meta}</div>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      {tabs && <div className={styles.tabs}>{tabs}</div>}
    </div>
  );
}
