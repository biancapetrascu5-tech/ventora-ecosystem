'use client';

import {
  Tabs as RACTabs,
  TabList,
  Tab,
  TabPanel,
  type TabsProps as RACTabsProps,
} from 'react-aria-components';
import { Badge } from '../Badge/Badge';
import { Icon, type IconName } from '../Icon/Icon';
import { cn } from '../lib/cn';
import styles from './Tabs.module.css';

export interface TabItem {
  id: string;
  label: string;
  icon?: IconName;
  /** Numărul de lângă etichetă (Badge count). */
  count?: number;
  /** `attention` = numărul cere o acțiune (peach). */
  countTone?: 'neutral' | 'attention';
  /** Conținutul panoului (.v-tabs__panel); fără el, Tabs e doar lista de taburi. */
  children?: React.ReactNode;
  isDisabled?: boolean;
}

export interface TabsProps extends Omit<RACTabsProps, 'children' | 'className'> {
  items: TabItem[];
  /** Eticheta listei de taburi (aria-label). */
  label?: string;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  className?: string;
  /** Clasa listei de taburi (ex. spațiul lateral într-un panou). */
  listClassName?: string;
}

/* Tabs din bundle.js: .v-tabs__list cu linie jos, tabul ales cu bară primary de 2px. */
export function Tabs({
  items,
  label,
  size = 'md',
  fullWidth,
  className,
  listClassName,
  ...props
}: TabsProps) {
  const hasPanels = items.some((it) => it.children != null);
  return (
    <RACTabs className={cn(styles.root, size === 'sm' && styles.sm, className)} {...props}>
      <TabList
        className={cn(styles.tablist, fullWidth && styles.full, listClassName)}
        aria-label={label}
      >
        {items.map((item) => (
          <Tab key={item.id} id={item.id} isDisabled={item.isDisabled} className={styles.tab}>
            {({ isSelected }) => (
              <>
                {item.icon && <Icon icon={item.icon} size={16} />}
                <span className={isSelected ? 'body-strong' : 'body'}>{item.label}</span>
                {item.count != null && (
                  <Badge
                    count={item.count}
                    tone={item.countTone === 'attention' ? 'attention' : 'neutral'}
                  />
                )}
              </>
            )}
          </Tab>
        ))}
      </TabList>
      {hasPanels &&
        items.map((item) => (
          <TabPanel key={item.id} id={item.id} className={styles.panel}>
            {item.children}
          </TabPanel>
        ))}
    </RACTabs>
  );
}
