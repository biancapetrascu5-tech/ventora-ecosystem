'use client';

import { cn } from '../lib/cn';
import styles from './AppShell.module.css';

export interface AppShellProps {
  spine?: React.ReactNode;
  contextBar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function AppShell({ spine, contextBar, children, className }: AppShellProps) {
  return (
    <div className={cn(styles.root, className)}>
      {contextBar && <div className={styles.contextBar}>{contextBar}</div>}
      <div className={styles.body}>
        {spine && <div className={styles.spine}>{spine}</div>}
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
