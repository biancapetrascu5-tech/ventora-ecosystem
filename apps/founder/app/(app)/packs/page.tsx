import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getFounderSession } from '@ventora/identity';
import { readNewRequestsCount, readPacks } from '@/server/commercial-actions';
import { PacksScreen } from '@/screens/commercial/PacksScreen';

export const dynamic = 'force-dynamic';

/* FounderPacks (Lotul 3.4, S113): „Pachete în plus”. */
export default async function PacksRoute() {
  const session = await getFounderSession(await headers());
  if (!session) redirect('/sign-in');
  const [data, requestsBadge] = await Promise.all([readPacks(), readNewRequestsCount()]);
  if (!data) throw new Error('[founder] packs unavailable');
  return <PacksScreen user={{ name: session.name }} data={data} requestsBadge={requestsBadge} />;
}
