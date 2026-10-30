import type { ReactNode } from 'react';
import { HubAuthProvider } from '@/screens/auth/HubAuthProvider';
import styles from './auth-layout.module.css';

/* Ecranele de autentificare ocupă toată fereastra; AuthLayout umple înălțimea (min-height: 100%). */
export default function AuthRouteLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <HubAuthProvider>{children}</HubAuthProvider>
    </div>
  );
}
