import { redirect } from 'next/navigation';
import { readSupportList } from '@/server/support-request-actions';
import { HubSupportScreen } from '@/screens/support/HubSupportScreen';

export const dynamic = 'force-dynamic';

/* HubSupport · „Solicitare nouă”: pe telefon, ecran separat de listă (S111); pe ecranele mari,
   aceeași pagină cu lista și formularul. */
export default async function NewSupportRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string }>;
}) {
  const [data, { app }] = await Promise.all([readSupportList(), searchParams]);
  if (!data) redirect('/sign-in');
  return <HubSupportScreen data={data} initialApp={app ?? null} screen="new" />;
}
