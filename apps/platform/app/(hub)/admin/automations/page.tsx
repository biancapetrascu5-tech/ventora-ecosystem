import { notFound } from 'next/navigation';
import { readAutomations } from '@/server/automations-actions';
import { AutomationsScreen } from '@/screens/automations/AutomationsScreen';

export const dynamic = 'force-dynamic';

/* Afacerea · Automatizări (HubAutomations, Lotul 4.10). Owner și admin văd lista, fără pornire
   sau oprire (D-WF-3); un membru vede doar nota. Fără sesiune sau afacere suspendată: 404. */
export default async function AdminAutomationsPage() {
  const data = await readAutomations();
  if (!data) notFound();
  return <AutomationsScreen data={data} />;
}
