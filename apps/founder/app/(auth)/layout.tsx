import type { ReactNode } from 'react';
import { FounderAuthProvider } from '@/screens/FounderAuthProvider';
import styles from './auth-layout.module.css';

/* Ecranele de autentificare Founder ocupă toată fereastra. */
export default function AuthRouteLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <FounderAuthProvider>{children}</FounderAuthProvider>
    </div>
  );
}
