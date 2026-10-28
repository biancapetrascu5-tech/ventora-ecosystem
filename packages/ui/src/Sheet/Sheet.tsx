'use client';

import type { ElementType, ReactNode } from 'react';
import { cn } from '../lib/cn';
import styles from './Sheet.module.css';

export interface SheetProps {
  children: ReactNode;
  /** Spațiu interior de 24px (implicit); `false` lasă conținutul să-și aleagă marginile. */
  padded?: boolean;
  as?: ElementType;
  className?: string;
}

export interface SheetSectionProps {
  children?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  /** Butoanele din dreapta titlului. */
  actions?: ReactNode;
  className?: string;
}

/* Sheet din bundle.js: suprafața de lucru (.v-sheet), separată de canvas printr-o linie, nu umbră. */
export function Sheet({ children, padded = true, as: Tag = 'section', className }: SheetProps) {
  return <Tag className={cn(styles.sheet, padded && styles.padded, className)}>{children}</Tag>;
}

/* SheetSection: titlu heading + descriere + acțiuni; secțiunile consecutive au linie între ele. */
export function SheetSection({
  children,
  title,
  description,
  actions,
  className,
}: SheetSectionProps) {
  return (
    <div className={cn(styles.section, className)}>
      {(title || actions) && (
        <div className={styles.head}>
          <div>
            {title && <h2 className="heading">{title}</h2>}
            {description && <p className={cn(styles.desc, 'body-small')}>{description}</p>}
          </div>
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
