'use client';

import { cn } from '../lib/cn';
import { Icon } from '../Icon/Icon';
import type { IconName } from '../Icon/Icon';
import styles from './Toast.module.css';

export type ToastTone = 'neutral' | 'done' | 'attention' | 'danger';

const TONE_ICONS: Record<ToastTone, IconName> = {
  neutral: 'info',
  done: 'circle-check',
  attention: 'warning',
  danger: 'error',
};

export interface ToastAction {
  label: string;
  onPress?: () => void;
}

export interface ToastProps {
  tone?: ToastTone;
  title: string;
  description?: string;
  loading?: boolean;
  action?: ToastAction;
  onUndo?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export function Toast({
  tone = 'neutral',
  title,
  description,
  loading,
  action,
  onUndo,
  onDismiss,
  className,
}: ToastProps) {
  return (
    <div role="status" aria-live="polite" className={cn(styles.root, styles[tone], className)}>
      <span className={styles.iconWrap} aria-hidden>
        {loading ? <span className={styles.spinner} /> : <Icon icon={TONE_ICONS[tone]} size="sm" />}
      </span>
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
        {description && <p className={styles.desc}>{description}</p>}
        {(action || onUndo) && (
          <div className={styles.actions}>
            {onUndo && (
              <button type="button" className={styles.actionBtn} onClick={onUndo}>
                Anulează
              </button>
            )}
            {action && (
              <button type="button" className={styles.actionBtn} onClick={action.onPress}>
                {action.label}
              </button>
            )}
          </div>
        )}
      </div>
      {onDismiss && (
        <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Închide">
          <Icon icon="x" size="sm" aria-hidden />
        </button>
      )}
    </div>
  );
}
