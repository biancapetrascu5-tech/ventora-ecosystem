'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PageHeader, Sheet } from '@ventora/ui';
import { useIsPhone } from '@ventora/screens';
import { NotificationPrefsForm } from './NotificationPrefsForm';
import type { NotificationPrefsValue } from './NotificationPrefsView';
import { SecurityToast } from './SecurityPageView';

/* NotifPage din HubAccount/preview.html (S114b): „Notificări”, cu firimitura „Contul tău” pe
   desktop; pe telefon, doar titlul. */
export function NotificationsPageScreen({ initial }: { initial: NotificationPrefsValue }) {
  const t = useTranslations('notifications.prefs');
  const account = useTranslations('account');
  const phone = useIsPhone();
  const [saved, setSaved] = useState(false);
  return (
    <>
      <PageHeader
        title={t('title')}
        breadcrumbs={phone ? undefined : [{ label: account('title'), href: '/account' }]}
      />
      <Sheet>
        <NotificationPrefsForm initial={initial} mob={phone} onSaved={setSaved} />
      </Sheet>
      {saved && (
        <SecurityToast fixed mob={phone} title={t('saved')} onDismiss={() => setSaved(false)} />
      )}
    </>
  );
}
