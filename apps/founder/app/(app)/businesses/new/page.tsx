import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getFounderSession } from '@ventora/identity';
import { readBundles } from '@/server/commercial-actions';
import { NewBusinessScreen } from '@/screens/businesses/NewBusinessScreen';

export const dynamic = 'force-dynamic';

/* „Afacere nouă” (Lot 2.8; S117 / D3-24 „Ce cumpără”): afacerea, invitația proprietarului și
   abonamentul — bundle-urile în vânzare și aplicațiile la bucată, cu prețurile lor. */
export default async function NewBusinessRoute() {
  const session = await getFounderSession(await headers());
  if (!session) redirect('/sign-in');
  const catalog = await readBundles();
  return <NewBusinessScreen user={{ name: session.name }} catalog={catalog} />;
}
