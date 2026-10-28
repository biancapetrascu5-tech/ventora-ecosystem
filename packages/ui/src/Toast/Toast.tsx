'use client';

import { cn } from '../lib/cn';
import { Icon } from '../Icon/Icon';
import type { IconName } from '../Icon/Icon';
import { Button } from '../Button/Button';
import styles from './Toast.module.css';

export type ToastTone = 'neutral' | 'done' | 'attention' | 'danger';

const TONE_ICON: Record<ToastTone, IconName> = {
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
  title: React.ReactNode;
  description?: React.ReactNode;
  loading?: boolean;
  action?: ToastAction;
  onUndo?: () => void;
  /** Translated "undo" label (e.g. „Anulează”). */
  undoLabel?: string;
  onDismiss?: () => void;
  /** Translated "close" label, used as aria-label and title. */
  dismissLabel?: string;
  className?: string;
}

export function Toast({
  tone = 'neutral',
  title,
  description,
  loading = false,
  action,
  onUndo,
  undoLabel,
  onDismiss,
  dismissLabel,
  className,
}: ToastProps) {
  return (
    <div
      className={cn(styles.root, styles[tone], className)}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <span className={styles.icon} aria-hidden="true">
        {loading ? (
          <span className={styles.spinner}>
            <Icon icon="loader-circle" size={16} />
          </span>
        ) : (
          <Icon icon={TONE_ICON[tone]} size={16} />
        )}
      </span>
      <div className={styles.text}>
        <p className="body-strong">{title}</p>
        {description && <p className={cn(styles.desc, 'body-small')}>{description}</p>}
      </div>
      {onUndo && (
        <Button variant="quiet" size="sm" icon="undo-2" className={styles.action} onPress={onUndo}>
          {undoLabel}
        </Button>
      )}
      {action && (
        <Button variant="quiet" size="sm" className={styles.action} onPress={action.onClick}>
          {action.label}
        </Button>
      )}
      {onDismiss && (
        <button
          type="button"
          className={styles.dismiss}
          aria-label={dismissLabel}
          title={dismissLabel}
          onClick={onDismiss}
        >
          <Icon icon="x" size={14} />
        </button>
      )}
    </div>
  );
}
