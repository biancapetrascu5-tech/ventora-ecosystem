'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { AuthAppProvider } from '@ventora/screens';
import { founderAfterSignIn, readFounderBackupCodesLeft } from '@/server/auth-actions';

/* Founder: panoul Founder, fără limbă (S57), activarea la /setup-2fa, parola de cel puțin 12
   caractere (D4), „Generează coduri noi” → /backup-codes (S84). */
export function FounderAuthProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('founder.auth');
  return (
    <AuthAppProvider
      config={{
        brand: 'founder',
        routes: { twoFactorSetup: '/setup-2fa', backupCodes: '/backup-codes' },
        afterSignIn: founderAfterSignIn,
        readBackupCodesLeft: readFounderBackupCodesLeft,
        lengthLabel: t('reqLength'),
      }}
    >
      {children}
    </AuthAppProvider>
  );
}
