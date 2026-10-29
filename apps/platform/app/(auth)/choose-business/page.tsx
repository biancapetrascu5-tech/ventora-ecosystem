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
  const mine = await listMyBusinesses();
  if (!session || !mine) redirect('/sign-in');
  const user = await getUserById(session.userId);
  const t = await getTranslations('roles');
  return (
    <ChooseBusinessScreen
      userName={user?.name ?? ''}
      openLast={mine.openLast}
      businesses={mine.businesses.map((b, i) => ({
        id: b.id,
        name: b.name,
        role: SYSTEM_ROLES.includes(b.role) ? t(b.role) : b.role,
        apps: b.apps,
        lastOpenedAt: b.lastOpenedAt,
        // „Ultima folosită”: prima din listă, dacă a fost deschisă vreodată
        recent: i === 0 && b.lastOpenedAt !== null,
      }))}
    />
  );
}
