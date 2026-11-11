import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getFounderSession } from '@ventora/identity';
import { readGrowthCampaigns } from '@/server/growth-actions';
import { GrowthCampaignsScreen } from '@/screens/growth/GrowthCampaignsScreens';

export const dynamic = 'force-dynamic';

/* Growth › Campanii (Lotul 5.10b, S136). */
export default async function GrowthCampaignsRoute() {
  const session = await getFounderSession(await headers());
  if (!session) redirect('/sign-in');
  const data = await readGrowthCampaigns();
  if (!data) throw new Error('[founder] growth campaigns unavailable');
  return <GrowthCampaignsScreen user={{ name: session.name }} data={data} />;
}
