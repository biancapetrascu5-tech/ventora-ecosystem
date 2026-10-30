import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { countBackupCodes, getPasswordChangedAt, getSession } from '@ventora/identity';
import { isOwnerAnywhere } from '@ventora/access';
import { AccountSecurityScreen } from '@/screens/account/AccountSecurityScreen';
import { listDevices } from '@/server/account-actions';

export const dynamic = 'force-dynamic';

/* Contul tău (Notificări: rândul „E-mailuri de securitate”; Securitate: HubAccountSecurity).
   Shell-ul Hub-ului (AppShell, Spine, ContextBar) nu există încă în aplicație: pagina stă singură
   (DE VALIDAT TEHNIC). Proprietar = proprietar activ în oricare afacere (2FA obligatorie, S58). */
export default async function AccountPage() {
  const h = await headers();
  const session = await getSession(h);
  if (!session) redirect('/sign-in');
  const [owner, changedAt, devices, codesLeft] = await Promise.all([
    isOwnerAnywhere(session.userId),
    getPasswordChangedAt(session.userId),
    listDevices(),
    session.twoFactorEnabled ? countBackupCodes('hub', h).catch(() => null) : Promise.resolve(null),
  ]);
  return (
    <AccountSecurityScreen
      owner={owner}
      twoFactorEnabled={session.twoFactorEnabled}
      codesLeft={codesLeft ?? undefined}
      passwordChangedAt={changedAt?.toISOString()}
      devices={devices}
    />
  );
}
