'use client';

import { useTranslations } from 'next-intl';
import { FounderShell } from '../shell/FounderShell';
import { BackupCodesPage } from './BackupCodesView';

/* „Coduri de rezervă” (S84). Câte coduri au rămas nu e expus, iar regenerarea cu codul din
   aplicație nu are încă un contract (Better Auth /two-factor/generate-backup-codes cere parola):
   pagina arată starea 1 fără număr și butonul inactiv — NECESITĂ DECIZIE. */
export function BackupCodesScreen({ user }: { user: { name: string } }) {
  const t = useTranslations('auth.2fa.codes');
  return (
    <FounderShell title={t('title')} user={user}>
      <BackupCodesPage state="left" code="" />
    </FounderShell>
  );
}
