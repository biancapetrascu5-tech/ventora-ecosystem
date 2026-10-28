'use client';

import { cn } from '../lib/cn';
import { Icon } from '../Icon/Icon';
import type { IconName } from '../Icon/Icon';
import { Button } from '../Button/Button';
import styles from './AttentionList.module.css';

export interface AttentionAction {
  label: string;
  primary?: boolean;
  quiet?: boolean;
  onPress?: () => void;
}

export interface AttentionItem {
  id: string | number;
  icon?: IconName;
  tone?: 'attention' | 'danger' | 'neutral';
  title: string;
  meta?: string;
  time?: string;
  actions?: AttentionAction[];
}

export interface AttentionListProps {
  items: AttentionItem[];
  className?: string;
}

export function AttentionList({ items, className }: AttentionListProps) {
  return (
    <ul className={cn(styles.list, className)} role="list">
      {items.map((item) => (
        <li key={item.id} className={styles.item}>
          <span className={cn(styles.iconWrap, item.tone && styles[`tone-${item.tone}`])}>
            <Icon icon={item.icon ?? 'error'} size="sm" aria-hidden />
          </span>
          <div className={styles.body}>
            <div className={styles.top}>
              <span className={styles.title}>{item.title}</span>
              {item.time && <span className={styles.time}>{item.time}</span>}
            </div>
            {item.meta && <span className={styles.meta}>{item.meta}</span>}
            {item.actions && item.actions.length > 0 && (
              <div className={styles.actions}>
                {item.actions.map((a, i) => (
                  <Button
                    key={i}
                    size="sm"
                    variant={a.primary ? 'primary' : a.quiet ? 'quiet' : 'secondary'}
                    onPress={a.onPress ? () => a.onPress!() : undefined}
                  >
                    {a.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
