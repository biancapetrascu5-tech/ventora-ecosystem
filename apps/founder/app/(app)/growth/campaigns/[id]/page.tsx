import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getFounderSession } from '@ventora/identity';
import { readGrowthCampaigns } from '@/server/growth-actions';
import { GrowthCampaignEditorScreen } from '@/screens/growth/GrowthCampaignsScreens';

export const dynamic = 'force-dynamic';

/* Growth › Campanii › editorul (Lotul 5.10b, S136); `new` = o campanie nouă. */
export default async function GrowthCampaignRoute({ params }: { params: Promise<{ id: string }> }) {
  const session = await getFounderSession(await headers());
  if (!session) redirect('/sign-in');
  const { id } = await params;
  const data = await readGrowthCampaigns();
  if (!data) throw new Error('[founder] growth campaigns unavailable');
  if (id !== 'new' && !data.campaigns.some((k) => k.id === id)) notFound();
  return (
    <GrowthCampaignEditorScreen
      user={{ name: session.name }}
      data={data}
      campaignId={id === 'new' ? null : id}
    />
  );
}
