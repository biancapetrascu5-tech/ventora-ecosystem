'use client';

import { useTranslations } from 'next-intl';
import { PageHeader, Sheet, SheetSection } from '@ventora/ui';
import { SecurityEmailsRow, SecuritySection } from './SecurityView';

/* Contul tău · Securitate, cu datele care există azi în API.
   - „Schimbă parola”: formularul (parola actuală + cea nouă) nu e desenat → NECESITĂ DECIZIE;
   - „Generează coduri noi”: designul cere confirmarea cu codul din aplicație, Better Auth
     (/two-factor/generate-backup-codes) cere parola → NECESITĂ DECIZIE (contract nou în identity);
   - câte coduri au rămas și când s-a schimbat parola nu sunt expuse → rândurile fără ele.
   Butoanele fără acțiune posibilă sunt inactive, nu ascunse, ca pagina să rămână cea din design. */
export function AccountSecurityScreen({
  owner,
  twoFactorEnabled,
}: {
  owner: boolean;
  twoFactorEnabled: boolean;
}) {
  const t = useTranslations('account');
  return (
    <>
      <PageHeader title={t('title')} description={t('lead')} />
      <Sheet>
        <SheetSection title={t('notifications.title')} description={t('notifications.lead')}>
          <SecurityEmailsRow />
        </SheetSection>
        <SecuritySection owner={owner} twoFactorEnabled={twoFactorEnabled} />
      </Sheet>
    </>
  );
}
