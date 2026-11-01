import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getFounderSession } from '@ventora/identity';
import { readRequests } from '@/server/commercial-actions';
import { RequestsScreen } from '@/screens/commercial/RequestsScreen';

export const dynamic = 'force-dynamic';

/* FounderRequests (Lotul 3.4, S111): „Cereri din Hub”. */
export default async function RequestsRoute() {
  const session = await getFounderSession(await headers());
  if (!session) redirect('/sign-in');
  const requests = await readRequests();
  if (!requests) throw new Error('[founder] requests unavailable');
  return <RequestsScreen user={{ name: session.name }} requests={requests} />;
}
