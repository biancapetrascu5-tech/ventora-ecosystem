import type { ReactNode } from 'react';
import { readSupportBanner } from '@/server/support-actions';
import { readHubShell } from '@/server/shell-actions';
import { SupportBannerHost } from '@/screens/support/SupportBannerHost';
import { HubShell } from '@/screens/shell/HubShell';
import { BackupCodesLeftNotice } from '@ventora/screens';
import { readBackupCodesLeft } from '@/server/codes-actions';
import styles from './hub-layout.module.css';

/* Paginile Hub-ului după intrare: bannerul sesiunii de suport stă deasupra întregii pagini (S85),
   dedesubt shell-ul Hub (Lot 2.8: Spine, ContextBar); după intrarea cu un cod de rezervă, toastul
   R-2F10 (câte coduri au rămas). Fără sesiune, pagina își face singură redirecționarea. */
export default async function HubLayout({ children }: { children: ReactNode }) {
  const [banner, shell] = await Promise.all([readSupportBanner(), readHubShell()]);
  return (
    <div className={styles.page}>
      <SupportBannerHost manager={banner?.manager ?? false} sessions={banner?.sessions ?? []}>
        {shell ? <HubShell data={shell}>{children}</HubShell> : children}
        <BackupCodesLeftNotice readLeft={readBackupCodesLeft} backupCodesHref="/account" />
      </SupportBannerHost>
    </div>
  );
}
