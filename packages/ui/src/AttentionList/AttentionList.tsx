'use client';

import { cn } from '../lib/cn';
import { Icon } from '../Icon/Icon';
import type { IconName } from '../Icon/Icon';
import { Button } from '../Button/Button';
import styles from './AttentionList.module.css';

export interface AttentionAction {
  label: string;
  icon?: IconName;
  primary?: boolean;
  quiet?: boolean;
  onPress?: () => void;
}

export interface AttentionItem {
  id: string | number;
  icon?: IconName;
  /** neutral by default; attention only for "needs you now", danger for error or loss. */
  tone?: 'attention' | 'danger' | 'neutral';
  title: React.ReactNode;
  meta?: React.ReactNode;
  time?: React.ReactNode;
  actions?: AttentionAction[];
}

export interface AttentionListProps {
  items: AttentionItem[];
  /** Rendered instead of the list when there are no items. */
  empty?: React.ReactNode;
  className?: string;
}

export function AttentionList({ items, empty, className }: AttentionListProps) {
  if (!items.length) return <>{empty ?? null}</>;
  return (
    <ul className={cn(styles.list, className)}>
      {items.map((it) => (
        <li key={it.id} className={styles.item}>
          <span
            className={cn(
              styles.icon,
              it.tone === 'danger' && styles.danger,
              it.tone === 'attention' && styles.attention,
            )}
            aria-hidden="true"
          >
            <Icon icon={it.icon ?? 'circle-dot'} size={16} />
          </span>
          <span className={styles.main}>
            <span className="body-strong">{it.title}</span>
            {it.meta && <span className={cn('body-small', styles.meta)}>{it.meta}</span>}
            {it.actions && it.actions.length > 0 && (
              <span className={styles.actions}>
                {it.actions.map((a) => (
                  <Button
                    key={a.label}
                    size="sm"
                    icon={a.icon}
                    variant={a.primary ? 'primary' : a.quiet ? 'quiet' : 'secondary'}
                    onPress={a.onPress}
                  >
                    {a.label}
                  </Button>
                ))}
              </span>
            )}
          </span>
          {it.time && <span className={cn('caption v-num', styles.time)}>{it.time}</span>}
        </li>
      ))}
    </ul>
  );
}
