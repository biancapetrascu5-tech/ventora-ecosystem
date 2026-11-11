import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getFounderSession } from '@ventora/identity';
import { readGrowthOffers } from '@/server/growth-actions';
import { GrowthOffersScreen } from '@/screens/growth/GrowthOffersScreens';

export const dynamic = 'force-dynamic';

/* Growth › Oferte (Lotul 5.10a, S136). */
export default async function GrowthOffersRoute() {
  const session = await getFounderSession(await headers());
  if (!session) redirect('/sign-in');
  const data = await readGrowthOffers();
  if (!data) throw new Error('[founder] growth offers unavailable');
  return <GrowthOffersScreen user={{ name: session.name }} data={data} />;
}
