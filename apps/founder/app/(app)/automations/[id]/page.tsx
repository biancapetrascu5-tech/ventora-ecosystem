import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getFounderSession } from '@ventora/identity';
import { readAutomations } from '@/server/automations-actions';
import { AutomationBuilderScreen } from '@/screens/automations/AutomationsScreens';

export const dynamic = 'force-dynamic';

/* FounderAutomations (Lotul 4.10): „Editează automatizarea” — salvarea face o versiune nouă. */
export default async function EditAutomationRoute({ params }: { params: Promise<{ id: string }> }) {
  const session = await getFounderSession(await headers());
  if (!session) redirect('/sign-in');
  const { id } = await params;
  const definitions = await readAutomations();
  if (!definitions) throw new Error('[founder] automations unavailable');
  const definition = definitions.find((d) => d.id === id);
  if (!definition) notFound();
  return <AutomationBuilderScreen user={{ name: session.name }} definition={definition} />;
}
