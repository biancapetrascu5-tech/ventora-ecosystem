import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getFounderSession } from '@ventora/identity';
import { readBusinesses } from '@/server/business-actions';
import {
  readBusinessUsage,
  readNewRequestsCount,
  readSubscriptionSignals,
} from '@/server/commercial-actions';
import { BusinessesScreen } from '@/screens/businesses/BusinessesScreen';

export const dynamic = 'force-dynamic';

/* FounderBusinesses (Lot 2.8; partea comercială, Lotul 3.4). */
export default async function BusinessesRoute() {
  const session = await getFounderSession(await headers());
  if (!session) redirect('/sign-in');
  const [businesses, usage, trials, requestsBadge] = await Promise.all([
    readBusinesses(),
    readBusinessUsage(),
    readSubscriptionSignals(),
    readNewRequestsCount(),
  ]);
  return (
    <BusinessesScreen
      user={{ name: session.name }}
      businesses={businesses ?? []}
      usage={usage ?? []}
      trials={trials ?? []}
      requestsBadge={requestsBadge}
    />
  );
}
