import { notFound } from 'next/navigation';
import type { AppName } from '@ventora/ui';
import { readApps } from '@/server/catalog-actions';
import { AppScreen } from '@/screens/apps/AppScreen';
import { APP_GROUPS } from '@/screens/apps/content';

export const dynamic = 'force-dynamic';

/* Pagina unei aplicații din catalog și activarea ei (HubCatalogApp + HubAppActivation, Lotul 3.7).
   Owner-ul activează sau cere; ceilalți recomandă. O aplicație necunoscută → 404. */
export default async function AppPage({ params }: { params: Promise<{ app: string }> }) {
  const { app } = await params;
  if (!APP_GROUPS.some(([, apps]) => (apps as readonly string[]).includes(app))) notFound();
  const data = await readApps();
  if (!data) notFound();
  return <AppScreen data={data} app={app as AppName} />;
}
