'use client';

import { Icon } from '../Icon/Icon';
import ib from '../IconButton/IconButton.module.css';
import { cn } from '../lib/cn';
import { Menu, type MenuEntry } from '../Menu/Menu';

export interface RemindLabels {
  /** S.moreOptions — butonul „…”. */
  moreOptions: string;
  /** S.remindLater — titlul meniului. */
  remindLater: string;
  remindWeek: string;
  remindMonth: string;
  notInterested: string;
}

/* RemindMenu din bundle.js: „…” → Amintește-mi peste o săptămână / o lună (și „Nu mă interesează”). */
export function RemindMenu({
  onRemindLater,
  onDismiss,
  labels,
}: {
  onRemindLater?: (when: 'week' | 'month') => void;
  onDismiss?: () => void;
  labels: RemindLabels;
}) {
  const items: MenuEntry[] = [
    { id: 'week', label: labels.remindWeek, icon: 'clock' },
    { id: 'month', label: labels.remindMonth, icon: 'calendar' },
  ];
  if (onDismiss)
    items.push({ separator: true }, { id: 'dismiss', label: labels.notInterested, icon: 'x' });
  return (
    <Menu
      label={labels.moreOptions}
      header={labels.remindLater}
      items={items}
      onAction={(id) => {
        if (id === 'dismiss') onDismiss?.();
        else onRemindLater?.(id as 'week' | 'month');
      }}
    >
      <button
        type="button"
        className={cn(ib.root, ib.quiet, ib.sm)}
        aria-label={labels.moreOptions}
        title={labels.moreOptions}
      >
        <Icon icon="ellipsis" size={16} />
      </button>
    </Menu>
  );
}
