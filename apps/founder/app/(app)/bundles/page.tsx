import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getFounderSession } from '@ventora/identity';
import { readBundles, readNewRequestsCount } from '@/server/commercial-actions';
import { BundlesScreen } from '@/screens/commercial/BundlesScreen';

export const dynamic = 'force-dynamic';

/* FounderBundles (Lotul 3.4, S117, D3-24): bundle-urile și ofertele lor. */
export default async function BundlesRoute() {
  const session = await getFounderSession(await headers());
  if (!session) redirect('/sign-in');
  const [data, requestsBadge] = await Promise.all([readBundles(), readNewRequestsCount()]);
  if (!data) throw new Error('[founder] bundles unavailable');
  return <BundlesScreen user={{ name: session.name }} data={data} requestsBadge={requestsBadge} />;
}
