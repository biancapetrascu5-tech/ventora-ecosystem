import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getFounderSession } from '@ventora/identity';
import { readBusinessPage } from '@/server/business-actions';
import { BusinessScreen } from '@/screens/businesses/BusinessScreen';

export const dynamic = 'force-dynamic';

/* FounderBusiness (Lot 2.8): o afacere; necunoscută → 404. */
export default async function BusinessRoute({ params }: { params: Promise<{ id: string }> }) {
  const session = await getFounderSession(await headers());
  if (!session) redirect('/sign-in');
  const { id } = await params;
  const data = await readBusinessPage(id);
  if (!data) notFound();
  return <BusinessScreen user={{ name: session.name }} data={data} />;
}
