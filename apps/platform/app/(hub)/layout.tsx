import type { ReactNode } from 'react';
import { readSupportBanner } from '@/server/support-actions';
import { SupportBannerHost } from '@/screens/support/SupportBannerHost';
import { BackupCodesLeftNotice } from '@ventora/screens';
import { readBackupCodesLeft } from '@/server/codes-actions';

/* Paginile Hub-ului după intrare: bannerul sesiunii de suport stă deasupra întregii pagini (S85);
   după intrarea cu un cod de rezervă, toastul R-2F10 (câte coduri au rămas). */
export default async function HubLayout({ children }: { children: ReactNode }) {
  const banner = await readSupportBanner();
  return (
    <SupportBannerHost manager={banner?.manager ?? false} sessions={banner?.sessions ?? []}>
      {children}
      <BackupCodesLeftNotice readLeft={readBackupCodesLeft} backupCodesHref="/account" />
    </SupportBannerHost>
  );
}
