import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getFounderSession } from '@ventora/identity';
import { readNewRequestsCount, readOverview } from '@/server/commercial-actions';
import { OverviewScreen } from '@/screens/commercial/OverviewScreen';

export const dynamic = 'force-dynamic';

/* „Prezentare” (FounderOverview, S118). */
export default async function OverviewRoute() {
  const session = await getFounderSession(await headers());
  if (!session) redirect('/sign-in');
  const [overview, requestsBadge] = await Promise.all([readOverview(), readNewRequestsCount()]);
  return (
    <OverviewScreen
      user={{ name: session.name }}
      overview={overview}
      requestsBadge={requestsBadge}
    />
  );
}
