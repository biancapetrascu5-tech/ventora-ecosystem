import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getFounderSession } from '@ventora/identity';
import { readFounderNotifications } from '@/server/notifications-actions';
import { FounderNotificationsScreen } from '@/screens/notifications/FounderNotificationsScreen';

export const dynamic = 'force-dynamic';

/* FounderNotifications (S136, D4-29 a): clopoțelul Founder ca pagină; `?open=<id>` deschide
   oprirea automată venită din clopoțel. */
export default async function FounderNotificationsRoute({
  searchParams,
}: {
  searchParams: Promise<{ open?: string }>;
}) {
  const session = await getFounderSession(await headers());
  if (!session) redirect('/sign-in');
  const { open } = await searchParams;
  // „Necitite” la deschidere; cu `open`, toate (cea deschisă poate fi deja citită)
  const data = await readFounderNotifications({ unreadOnly: !open });
  if (!data) throw new Error('[founder] notifications unavailable');
  return (
    <FounderNotificationsScreen
      user={{ name: session.name }}
      initial={data}
      openId={open ?? null}
    />
  );
}
