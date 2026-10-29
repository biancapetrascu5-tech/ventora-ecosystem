import type { ReactNode } from 'react';
import { readSupportBanner } from '@/server/support-actions';
import { SupportBannerHost } from '@/screens/support/SupportBannerHost';

/* Paginile Hub-ului după intrare: bannerul sesiunii de suport stă deasupra întregii pagini (S85). */
export default async function HubLayout({ children }: { children: ReactNode }) {
  const banner = await readSupportBanner();
  return (
    <SupportBannerHost manager={banner?.manager ?? false} sessions={banner?.sessions ?? []}>
      {children}
    </SupportBannerHost>
  );
}
