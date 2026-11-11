import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getFounderSession } from '@ventora/identity';
import { readGrowthControl } from '@/server/growth-actions';
import { GrowthControlScreen } from '@/screens/growth/GrowthControlScreen';

export const dynamic = 'force-dynamic';

/* Growth › Control (Lotul 5.10e, S136). */
export default async function GrowthControlRoute() {
  const session = await getFounderSession(await headers());
  if (!session) redirect('/sign-in');
  const data = await readGrowthControl();
  if (!data) throw new Error('[founder] growth control unavailable');
  return <GrowthControlScreen user={{ name: session.name }} data={data} />;
}
