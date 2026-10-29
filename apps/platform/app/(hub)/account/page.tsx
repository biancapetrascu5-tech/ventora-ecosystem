import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession } from '@ventora/identity';
import { listMyOrganizations } from '@ventora/organizations';
import { AccountSecurityScreen } from '@/screens/account/AccountSecurityScreen';

export const dynamic = 'force-dynamic';

/* Contul tău (Securitate + rândul „E-mailuri de securitate”). Shell-ul Hub-ului (AppShell, Spine,
   ContextBar) nu există încă în aplicație: pagina stă singură (DE VALIDAT TEHNIC). */
export default async function AccountPage() {
  const session = await getSession(await headers());
  if (!session) redirect('/sign-in');
  const memberships = (await listMyOrganizations(session.userId)) as {
    organization_id: string;
    role: string;
    status: string;
  }[];
  const active = memberships.find(
    (m) => m.organization_id === session.activeOrganizationId && m.status === 'active',
  );
  return (
    <AccountSecurityScreen
      owner={active?.role === 'owner'}
      twoFactorEnabled={session.twoFactorEnabled}
    />
  );
}
