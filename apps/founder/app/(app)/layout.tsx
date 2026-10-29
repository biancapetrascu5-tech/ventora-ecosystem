import type { ReactNode } from 'react';
import { BackupCodesLeftNotice } from '@ventora/screens';
import { readFounderBackupCodesLeft } from '@/server/auth-actions';
import styles from './app-layout.module.css';

/* Paginile Founder după intrare ocupă toată fereastra (AppShell cu height 100%); după intrarea
   cu un cod de rezervă, toastul R-2F10 (S81) duce la FounderBackupCodes. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      {children}
      <BackupCodesLeftNotice
        readLeft={readFounderBackupCodesLeft}
        backupCodesHref="/backup-codes"
      />
    </div>
  );
}
