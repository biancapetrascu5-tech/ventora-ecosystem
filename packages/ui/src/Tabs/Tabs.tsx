'use client';

import {
  Tabs as RACTabs,
  TabList,
  Tab,
  TabPanel,
  type TabsProps as RACTabsProps,
} from 'react-aria-components';
import { cn } from '../lib/cn';
import styles from './Tabs.module.css';

export interface TabItem {
  id: string;
  label: string;
  children: React.ReactNode;
  isDisabled?: boolean;
}

export interface TabsProps extends Omit<RACTabsProps, 'children' | 'className'> {
  items: TabItem[];
  fullWidth?: boolean;
  className?: string;
}

export function Tabs({ items, fullWidth, className, ...props }: TabsProps) {
  return (
    <RACTabs className={cn(styles.root, className)} {...props}>
      <TabList
        className={cn(styles.tablist, fullWidth && styles.full)}
        aria-label="Navigare tab-uri"
      >
        {items.map((item) => (
          <Tab key={item.id} id={item.id} isDisabled={item.isDisabled} className={styles.tab}>
            {item.label}
          </Tab>
        ))}
      </TabList>
      {items.map((item) => (
        <TabPanel key={item.id} id={item.id} className={styles.panel}>
          {item.children}
        </TabPanel>
      ))}
    </RACTabs>
  );
}
