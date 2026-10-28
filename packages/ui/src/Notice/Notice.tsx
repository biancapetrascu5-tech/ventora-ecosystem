'use client';

import { cn } from '../lib/cn';
import { Icon } from '../Icon/Icon';
import type { IconName } from '../Icon/Icon';
import styles from './Notice.module.css';

export type NoticeTone = 'danger' | 'attention' | 'done' | 'neutral';

const TONE_ICONS: Record<NoticeTone, IconName> = {
  danger: 'circle-alert',
  attention: 'triangle-alert',
  done: 'circle-check',
  neutral: 'info',
};

export interface NoticeProps {
  tone?: NoticeTone;
  icon?: IconName;
  title?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function Notice({
  tone = 'neutral',
  icon: iconProp,
  title,
  actions,
  children,
  className,
}: NoticeProps) {
  return (
    <div role="note" className={cn(styles.root, styles[tone], className)}>
      <Icon icon={iconProp ?? TONE_ICONS[tone]} size="sm" aria-hidden className={styles.icon} />
      <div className={styles.body}>
        {title && <p className={styles.title}>{title}</p>}
        {children && <p className={styles.desc}>{children}</p>}
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>
  );
}
