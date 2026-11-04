import { notFound } from 'next/navigation';
import { readSupportThread } from '@/server/support-request-actions';
import { HubSupportThreadScreen } from '@/screens/support/HubSupportThreadScreen';

export const dynamic = 'force-dynamic';

/* HubSupportThread (Lotul 4.6), după referință (VS-2026-0142). Solicitarea altei afaceri sau,
   pentru un membru, a altcuiva (S-1) → 404, la fel ca una care nu există. */
export default async function SupportThreadPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const data = await readSupportThread(decodeURIComponent(ref));
  if (!data) notFound();
  return <HubSupportThreadScreen data={data} />;
}
