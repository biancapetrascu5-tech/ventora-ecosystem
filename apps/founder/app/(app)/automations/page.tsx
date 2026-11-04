import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getFounderSession } from '@ventora/identity';
import { readAutomations } from '@/server/automations-actions';
import { AutomationsListScreen } from '@/screens/automations/AutomationsScreens';

export const dynamic = 'force-dynamic';

/* FounderAutomations (Lotul 4.10, S116): lista automatizărilor. */
export default async function AutomationsRoute() {
  const session = await getFounderSession(await headers());
  if (!session) redirect('/sign-in');
  const definitions = await readAutomations();
  if (!definitions) throw new Error('[founder] automations unavailable');
  return <AutomationsListScreen user={{ name: session.name }} definitions={definitions} />;
}
