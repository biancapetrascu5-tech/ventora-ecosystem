import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getFounderSession } from '@ventora/identity';
import {
  readBusinessUsage,
  readNewRequestsCount,
  readUsageTotals,
} from '@/server/commercial-actions';
import { UsageScreen } from '@/screens/commercial/UsageScreen';

export const dynamic = 'force-dynamic';

/* FounderUsage (Lotul 3.4): consumul în toate afacerile, cele peste 80% la o limită. */
export default async function UsageRoute() {
  const session = await getFounderSession(await headers());
  if (!session) redirect('/sign-in');
  const [usage, totals, requestsBadge] = await Promise.all([
    readBusinessUsage(),
    readUsageTotals(),
    readNewRequestsCount(),
  ]);
  if (!usage || !totals) throw new Error('[founder] usage unavailable');
  return (
    <UsageScreen
      user={{ name: session.name }}
      usage={usage}
      totals={totals}
      requestsBadge={requestsBadge}
    />
  );
}
