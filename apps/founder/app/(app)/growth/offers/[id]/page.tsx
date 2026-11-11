import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getFounderSession } from '@ventora/identity';
import { readGrowthOffers } from '@/server/growth-actions';
import { GrowthOfferEditorScreen } from '@/screens/growth/GrowthOffersScreens';

export const dynamic = 'force-dynamic';

/* Growth › Oferte › editorul unei oferte (Lotul 5.10a, S136). */
export default async function GrowthOfferRoute({ params }: { params: Promise<{ id: string }> }) {
  const session = await getFounderSession(await headers());
  if (!session) redirect('/sign-in');
  const { id } = await params;
  const data = await readGrowthOffers();
  if (!data) throw new Error('[founder] growth offers unavailable');
  const offer = data.offers.find((o) => o.id === id);
  if (!offer) notFound();
  return (
    <GrowthOfferEditorScreen user={{ name: session.name }} offer={offer} catalog={data.catalog} />
  );
}
