import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession } from '@ventora/identity';
import { NotificationsPageScreen } from '@/screens/account/NotificationsPageScreen';
import { readNotificationPreferences } from '@/server/notification-actions';

export const dynamic = 'force-dynamic';

/* Contul tău · Notificări (Lot 4.4, S114b: NotifPage): pagina la care duce „Setările
   notificărilor” din clopoțel; pe telefon, pagina secțiunii. */
export default async function AccountNotificationsPage() {
  const session = await getSession(await headers());
  if (!session) redirect('/sign-in');
  const prefs = await readNotificationPreferences();
  if (!prefs) redirect('/account');
  return <NotificationsPageScreen initial={prefs} />;
}
