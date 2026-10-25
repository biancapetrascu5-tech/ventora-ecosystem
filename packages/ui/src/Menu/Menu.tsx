'use client';

import {
  Menu as RACMenu,
  MenuItem as RACMenuItem,
  MenuTrigger as RACMenuTrigger,
  Section as RACSection,
  Separator as RACSeparator,
  Popover,
  type Key,
} from 'react-aria-components';
import { Icon, type IconName } from '../Icon/Icon';
import { cn } from '../lib/cn';
import styles from './Menu.module.css';

export interface MenuItemDef {
  id: string;
  label: string;
  icon?: IconName;
  isDisabled?: boolean;
  isDanger?: boolean;
  shortcut?: string;
}

export interface MenuSectionDef {
  label?: string;
  items: MenuItemDef[];
}

export interface MenuProps {
  children: React.ReactElement;
  sections?: MenuSectionDef[];
  items?: MenuItemDef[];
  onAction?: (id: string) => void;
  className?: string;
}

export { RACMenuTrigger as MenuTrigger };

export function Menu({ children, sections, items, onAction, className }: MenuProps) {
  const handleAction = (key: Key) => {
    onAction?.(String(key));
  };

  const flatItems = items ? [{ items }] : (sections ?? []);

  return (
    <RACMenuTrigger>
      {children}
      <Popover placement="bottom start">
        <RACMenu onAction={handleAction} className={cn(styles.menu, className)}>
          {flatItems.map((section, si) => (
            <RACSection key={si}>
              {section.label && (
                <RACMenuItem id={`section-label-${si}`} isDisabled className={styles.sectionLabel}>
                  {section.label}
                </RACMenuItem>
              )}
              {section.items.map((item) => (
                <RACMenuItem
                  key={item.id}
                  id={item.id}
                  isDisabled={item.isDisabled}
                  className={cn(styles.item, item.isDanger && styles.danger)}
                >
                  {item.icon && (
                    <span className={styles.itemIcon}>
                      <Icon icon={item.icon} size="sm" />
                    </span>
                  )}
                  <span className={styles.itemLabel}>{item.label}</span>
                  {item.shortcut && <span className={styles.shortcut}>{item.shortcut}</span>}
                </RACMenuItem>
              ))}
              {si < flatItems.length - 1 && <RACSeparator className={styles.separator} />}
            </RACSection>
          ))}
        </RACMenu>
      </Popover>
    </RACMenuTrigger>
  );
}
