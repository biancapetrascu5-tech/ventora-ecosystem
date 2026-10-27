'use client';

import { cn } from '../lib/cn';
import { Icon } from '../Icon/Icon';
import type { IconName } from '../Icon/Icon';
import styles from './Toast.module.css';

export type ToastTone = 'neutral' | 'done' | 'attention' | 'danger';

const TONE_ICONS: Record<ToastTone, IconName> = {
  neutral: 'info',
  done: 'circle-check',
  attention: 'triangle-alert',
  danger: 'circle-alert',
};

export interface ToastAction {
  label: string;
  onClick?: () => void;
}

export interface ToastProps {
  tone?: ToastTone;
  title: string;
  description?: string;
  loading?: boolean;
  action?: ToastAction;
  onUndo?: () => void;
  undoLabel?: string;
  onDismiss?: () => void;
  dismissLabel?: string;
  className?: string;
}

export function Toast({
  tone = 'neutral',
  title,
  description,
  loading,
  action,
  onUndo,
  undoLabel,
  onDismiss,
  dismissLabel,
  className,
}: ToastProps) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(styles.root, styles[tone], className)}
    >
      <span className={styles.iconWrap} aria-hidden>
        {loading ? (
          <span className={styles.spinner}>
            <Icon icon="loader-circle" size={16} aria-hidden />
          </span>
        ) : (
          <Icon icon={TONE_ICONS[tone]} size={16} />
        )}
      </span>
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
        {description && <p className={styles.desc}>{description}</p>}
      </div>
      {onUndo && (
        <button type="button" className={styles.action} onClick={onUndo}>
          <Icon icon="undo-2" size={16} aria-hidden />
          {undoLabel && <span>{undoLabel}</span>}
        </button>
      )}
      {!onUndo && action && (
        <button type="button" className={styles.action} onClick={action.onClick}>
          <span>{action.label}</span>
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          className={styles.dismiss}
          onClick={onDismiss}
          aria-label={dismissLabel ?? 'Închide'}
        >
          <Icon icon="x" size={14} aria-hidden />
        </button>
      )}
    </div>
  );
}
