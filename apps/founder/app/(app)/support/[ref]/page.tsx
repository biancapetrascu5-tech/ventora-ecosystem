import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getFounderSession } from '@ventora/identity';
import { readSupportThreadForFounder } from '@/server/support-inbox-actions';
import { SupportThreadScreen } from '@/screens/support/SupportThreadScreen';

export const dynamic = 'force-dynamic';

/* FounderSupportInbox · o solicitare, după referință (VS-2026-0187). */
export default async function SupportThreadRoute({ params }: { params: Promise<{ ref: string }> }) {
  const session = await getFounderSession(await headers());
  if (!session) redirect('/sign-in');
  const { ref } = await params;
  const data = await readSupportThreadForFounder(decodeURIComponent(ref));
  if (!data) notFound();
  return <SupportThreadScreen user={{ name: session.name }} data={data} />;
}
