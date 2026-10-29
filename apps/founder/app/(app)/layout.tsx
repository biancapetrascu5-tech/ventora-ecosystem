import type { ReactNode } from 'react';
import styles from './app-layout.module.css';

/* Paginile Founder după intrare ocupă toată fereastra (AppShell cu height 100%). */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <div className={styles.page}>{children}</div>;
}
