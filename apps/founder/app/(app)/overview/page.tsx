import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getFounderSession } from '@ventora/identity';
import { readExpiringExceptions, readNewRequestsCount } from '@/server/commercial-actions';
import { OverviewScreen } from '@/screens/commercial/OverviewScreen';

export const dynamic = 'force-dynamic';

/* „Prezentare” (Lotul 3.4, §8.5): excepțiile care expiră în 7 zile. */
export default async function OverviewRoute() {
  const session = await getFounderSession(await headers());
  if (!session) redirect('/sign-in');
  const [expiring, requestsBadge] = await Promise.all([
    readExpiringExceptions(),
    readNewRequestsCount(),
  ]);
  return (
    <OverviewScreen
      user={{ name: session.name }}
      expiring={expiring ?? []}
      requestsBadge={requestsBadge}
    />
  );
}
