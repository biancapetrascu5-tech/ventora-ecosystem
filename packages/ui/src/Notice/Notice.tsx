'use client';

import { cn } from '../lib/cn';
import { Icon } from '../Icon/Icon';
import type { IconName } from '../Icon/Icon';
import styles from './Notice.module.css';

export type NoticeTone = 'danger' | 'attention' | 'done' | 'neutral';

const NOTICE_ICON: Record<NoticeTone, IconName> = {
  neutral: 'info',
  attention: 'triangle-alert',
  done: 'circle-check',
  danger: 'circle-alert',
};

export interface NoticeProps {
  tone?: NoticeTone;
  icon?: IconName;
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function Notice({
  tone = 'neutral',
  icon,
  title,
  actions,
  children,
  className,
}: NoticeProps) {
  return (
    <div
      className={cn(styles.root, styles[tone], className)}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <Icon icon={icon ?? NOTICE_ICON[tone]} size={16} className={styles.icon} />
      <div className={styles.text}>
        {title && <p className="body-strong">{title}</p>}
        {children && <div className={cn('body-small', styles.body)}>{children}</div>}
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>
  );
}
