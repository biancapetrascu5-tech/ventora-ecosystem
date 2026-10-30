import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getFounderSession } from '@ventora/identity';
import { readBusinesses } from '@/server/business-actions';
import { BusinessesScreen } from '@/screens/businesses/BusinessesScreen';

export const dynamic = 'force-dynamic';

/* FounderBusinesses (Lot 2.8): toate afacerile, fără partea comercială (Lotul 3.4). */
export default async function BusinessesRoute() {
  const session = await getFounderSession(await headers());
  if (!session) redirect('/sign-in');
  const businesses = (await readBusinesses()) ?? [];
  return <BusinessesScreen user={{ name: session.name }} businesses={businesses} />;
}
