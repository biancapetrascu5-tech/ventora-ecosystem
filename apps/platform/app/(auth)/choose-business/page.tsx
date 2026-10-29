import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSession, getUserById } from '@ventora/identity';
import { listMyBusinesses } from '@/server/session-actions';
import { ChooseBusinessScreen } from '@/screens/auth/ChooseBusinessScreen';

export const dynamic = 'force-dynamic';

const SYSTEM_ROLES = ['owner', 'admin', 'member', 'external_collaborator', 'application_manager'];

export default async function ChooseBusinessPage() {
  const session = await getSession(await headers());
  const businesses = await listMyBusinesses();
  if (!session || !businesses) redirect('/sign-in');
  const user = await getUserById(session.userId);
  const t = await getTranslations('roles');
  return (
    <ChooseBusinessScreen
      userName={user?.name ?? ''}
      businesses={businesses.map((b) => ({
        id: b.id,
        name: b.name,
        role: SYSTEM_ROLES.includes(b.role) ? t(b.role) : b.role,
        recent: b.active,
      }))}
    />
  );
}
