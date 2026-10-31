import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getFounderSession } from '@ventora/identity';
import { NewBusinessScreen } from '@/screens/businesses/NewBusinessScreen';

export const dynamic = 'force-dynamic';

/* „Afacere nouă” (Lot 2.8): afacerea și invitația proprietarului, fără partea comercială. */
export default async function NewBusinessRoute() {
  const session = await getFounderSession(await headers());
  if (!session) redirect('/sign-in');
  return <NewBusinessScreen user={{ name: session.name }} />;
}
