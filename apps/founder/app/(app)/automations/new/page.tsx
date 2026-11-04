import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getFounderSession } from '@ventora/identity';
import { AutomationBuilderScreen } from '@/screens/automations/AutomationsScreens';

export const dynamic = 'force-dynamic';

/* FounderAutomations (Lotul 4.10): „Automatizare nouă”, din lista albă (S116-D19). */
export default async function NewAutomationRoute() {
  const session = await getFounderSession(await headers());
  if (!session) redirect('/sign-in');
  return <AutomationBuilderScreen user={{ name: session.name }} definition={null} />;
}
