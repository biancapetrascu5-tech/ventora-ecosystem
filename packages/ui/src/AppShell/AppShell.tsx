'use client';

import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import styles from './AppShell.module.css';

export interface AppShellProps {
  /** Spine (meniul aplicației; sub 768px devine bara de jos). */
  spine?: ReactNode;
  /** ContextBar. */
  contextBar?: ReactNode;
  children?: ReactNode;
  /** Înălțimea (implicit 100vh). */
  height?: number | string;
  /** id-ul conținutului principal (ținta „Sari la conținut”). */
  mainId?: string;
  className?: string;
}

/* AppShell din bundle.js: .v-shell (containerul `shell` la care răspund Spine și ContextBar) →
   Spine + .v-shell__main (ContextBar + conținutul derulabil). */
export function AppShell({
  spine,
  contextBar,
  children,
  height,
  mainId = 'v-main',
  className,
}: AppShellProps) {
  return (
    <div
      className={cn(styles.root, className)}
      style={height != null ? { height } : undefined}
      data-shell=""
    >
      {spine}
      <div className={styles.main}>
        {contextBar}
        <main className={styles.content} id={mainId} tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
