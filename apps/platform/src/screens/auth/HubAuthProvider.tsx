'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { AuthAppProvider } from '@ventora/screens';
import { rememberLocale } from '@/i18n/locale';
import { routeAfterSignIn } from '@/server/session-actions';
import { readBackupCodesLeft } from '@/server/codes-actions';

/* Hub: rutele implicite din @ventora/screens, limba din cookie (cu refresh), după intrare
   routeAfterSignIn (activarea 2FA a proprietarului, alegerea afacerii, launcher). */
export function HubAuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const locale = useLocale();
  return (
    <AuthAppProvider
      config={{
        brand: 'hub',
        afterSignIn: routeAfterSignIn,
        readBackupCodesLeft,
        locale,
        onLocaleChange: (code) => {
          rememberLocale(code);
          router.refresh();
        },
      }}
    >
      {children}
    </AuthAppProvider>
  );
}
