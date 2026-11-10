import { notFound } from 'next/navigation';
import { readApps } from '@/server/catalog-actions';
import { AppsScreen } from '@/screens/apps/AppsScreen';

export const dynamic = 'force-dynamic';

/* Toate aplicațiile (HubCatalog, Lotul 3.7). Pentru orice membru al afacerii active; fără afacere
   activă (sau suspendată) → 404. */
export default async function AppsPage() {
  const data = await readApps({ recommendation: true });
  if (!data) notFound();
  return <AppsScreen data={data} />;
}
