import { redirect } from 'next/navigation';
import { readSupportList } from '@/server/support-request-actions';
import { HubSupportScreen } from '@/screens/support/HubSupportScreen';

export const dynamic = 'force-dynamic';

/* HubSupport (Lotul 4.6): intrarea din AccountMenu („Suport”), cu aplicația în ?app= (S-3).
   Fără sesiune sau fără afacere activă → intrarea. */
export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string }>;
}) {
  const [data, { app }] = await Promise.all([readSupportList(), searchParams]);
  if (!data) redirect('/sign-in');
  return <HubSupportScreen data={data} initialApp={app ?? null} screen="list" />;
}
