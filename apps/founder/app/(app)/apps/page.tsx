import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getFounderSession } from '@ventora/identity';
import { readApps, readNewRequestsCount } from '@/server/commercial-actions';
import { AppsScreen } from '@/screens/commercial/AppsScreen';

export const dynamic = 'force-dynamic';

/* FounderApps (Lotul 3.4, S113, D3-24): aplicațiile la bucată. */
export default async function AppsRoute() {
  const session = await getFounderSession(await headers());
  if (!session) redirect('/sign-in');
  const [data, requestsBadge] = await Promise.all([readApps(), readNewRequestsCount()]);
  if (!data) throw new Error('[founder] applications unavailable');
  return (
    <AppsScreen
      user={{ name: session.name }}
      apps={data.apps}
      quotas={data.quotas}
      requestsBadge={requestsBadge}
    />
  );
}
