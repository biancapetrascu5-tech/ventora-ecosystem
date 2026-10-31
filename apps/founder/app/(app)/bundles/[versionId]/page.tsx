import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getFounderSession } from '@ventora/identity';
import { readNewRequestsCount, readOffer } from '@/server/commercial-actions';
import { BundleEditorScreen } from '@/screens/commercial/BundleEditorScreen';

export const dynamic = 'force-dynamic';

/* FounderBundleEditor (Lotul 3.4, S117): o ofertă — ciorna se editează, cea publicată se citește. */
export default async function OfferRoute({ params }: { params: Promise<{ versionId: string }> }) {
  const session = await getFounderSession(await headers());
  if (!session) redirect('/sign-in');
  const { versionId } = await params;
  const [data, requestsBadge] = await Promise.all([readOffer(versionId), readNewRequestsCount()]);
  if (!data) notFound();
  return (
    <BundleEditorScreen user={{ name: session.name }} data={data} requestsBadge={requestsBadge} />
  );
}
