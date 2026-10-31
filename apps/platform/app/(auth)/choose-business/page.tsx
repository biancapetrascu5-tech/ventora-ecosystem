import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSession, getUserById } from '@ventora/identity';
import { supportEmail } from '@ventora/notifications';
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
      supportEmail={supportEmail()}
      businesses={mine.businesses.map((b, i) => ({
        id: b.id,
        name: b.name,
        role: SYSTEM_ROLES.includes(b.role) ? t(b.role) : b.role,
        apps: b.apps,
        lastOpenedAt: b.lastOpenedAt,
        // „Ultima folosită”: prima din listă, dacă a fost deschisă vreodată (și se poate deschide)
        recent: i === 0 && b.lastOpenedAt !== null && !b.suspended,
        // Lot 2.9b (S112): „Acces oprit”
        suspended: b.suspended,
      }))}
    />
  );
}
