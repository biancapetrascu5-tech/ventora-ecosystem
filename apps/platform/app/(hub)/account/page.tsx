import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { countBackupCodes, getPasswordChangedAt, getSession } from '@ventora/identity';
import { isOwnerAnywhere } from '@ventora/access';
import { AccountSecurityScreen } from '@/screens/account/AccountSecurityScreen';
import { listDevices } from '@/server/account-actions';
import { readNotificationPreferences } from '@/server/notification-actions';

export const dynamic = 'force-dynamic';

/* Contul tău (Notificări: S114b, Lot 4.4; Securitate: HubAccountSecurity). Proprietar =
   proprietar activ în oricare afacere (2FA obligatorie, S58). */
export default async function AccountPage() {
  const h = await headers();
  const session = await getSession(h);
  if (!session) redirect('/sign-in');
  const [owner, changedAt, devices, codesLeft, prefs] = await Promise.all([
    isOwnerAnywhere(session.userId),
    getPasswordChangedAt(session.userId),
    listDevices(),
    session.twoFactorEnabled ? countBackupCodes('hub', h).catch(() => null) : Promise.resolve(null),
    readNotificationPreferences(),
  ]);
  return (
    <AccountSecurityScreen
      owner={owner}
      twoFactorEnabled={session.twoFactorEnabled}
      codesLeft={codesLeft ?? undefined}
      passwordChangedAt={changedAt?.toISOString()}
      devices={devices}
      notificationPrefs={prefs}
    />
  );
}
