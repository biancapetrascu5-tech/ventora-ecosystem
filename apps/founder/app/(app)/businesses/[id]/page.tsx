import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getFounderSession } from '@ventora/identity';
import { readBusinessPage } from '@/server/business-actions';
import {
  readBusinessCommercial,
  readNewRequestsCount,
  readQuotaKeys,
} from '@/server/commercial-actions';
import { BusinessScreen, type BusinessTab } from '@/screens/businesses/BusinessScreen';

export const dynamic = 'force-dynamic';

const TABS: BusinessTab[] = ['overview', 'usage', 'exceptions', 'billing', 'log'];

/* FounderBusiness (Lot 2.8; partea comercială, Lotul 3.4): o afacere; necunoscută → 404.
   `?tab=billing` deschide „Plăți și facturi”; `?exception=1` deschide „Adaugă o excepție”. */
export default async function BusinessRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; exception?: string }>;
}) {
  const session = await getFounderSession(await headers());
  if (!session) redirect('/sign-in');
  const { id } = await params;
  const sp = await searchParams;
  const data = await readBusinessPage(id);
  if (!data) notFound();
  const [commercial, quotas, requestsBadge] = await Promise.all([
    readBusinessCommercial(id),
    readQuotaKeys(),
    readNewRequestsCount(),
  ]);
  return (
    <BusinessScreen
      user={{ name: session.name }}
      data={data}
      commercial={commercial}
      quotas={quotas ?? []}
      requestsBadge={requestsBadge}
      initialTab={TABS.includes(sp.tab as BusinessTab) ? (sp.tab as BusinessTab) : 'overview'}
      openException={sp.exception === '1'}
    />
  );
}
