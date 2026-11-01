import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { readSupportBanner } from '@/server/support-actions';
import { readHubShell } from '@/server/shell-actions';
import { readBell } from '@/server/notification-actions';
import { SupportBannerHost } from '@/screens/support/SupportBannerHost';
import { HubShell } from '@/screens/shell/HubShell';
import { BackupCodesLeftNotice } from '@ventora/screens';
import { readBackupCodesLeft } from '@/server/codes-actions';
import styles from './hub-layout.module.css';

/* Paginile Hub-ului după intrare: bannerul sesiunii de suport stă deasupra întregii pagini (S85),
   dedesubt shell-ul Hub (Lot 2.8: Spine, ContextBar); după intrarea cu un cod de rezervă, toastul
   R-2F10 (câte coduri au rămas). Fără sesiune, pagina își face singură redirecționarea.
   Lot 4.4: clopoțelul pornește cu lista de la încărcare și o reîncarcă la fiecare deschidere. */
export default async function HubLayout({ children }: { children: ReactNode }) {
  const [banner, shell, bell] = await Promise.all([
    readSupportBanner(),
    readHubShell(),
    readBell(),
  ]);
  // Lot 2.9b (S112): afacerea din sesiune a fost suspendată între timp (D3-20 a)
  if (shell?.suspendedRedirect) redirect(shell.suspendedRedirect);
  return (
    <div className={styles.page}>
      <SupportBannerHost manager={banner?.manager ?? false} sessions={banner?.sessions ?? []}>
        {shell ? (
          <HubShell data={shell} bell={bell}>
            {children}
          </HubShell>
        ) : (
          children
        )}
        <BackupCodesLeftNotice readLeft={readBackupCodesLeft} backupCodesHref="/account" />
      </SupportBannerHost>
    </div>
  );
}
