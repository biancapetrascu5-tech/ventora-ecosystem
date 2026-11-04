import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getFounderSession } from '@ventora/identity';
import { readAutomationBusinesses, readAutomations } from '@/server/automations-actions';
import { AutomationBusinessesScreen } from '@/screens/automations/AutomationsScreens';

export const dynamic = 'force-dynamic';

/* FounderAutomations (Lotul 4.10): „Pornită la afaceri” — pornirea și oprirea, cu motiv (audit). */
export default async function AutomationBusinessesRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getFounderSession(await headers());
  if (!session) redirect('/sign-in');
  const { id } = await params;
  const [definitions, businesses] = await Promise.all([
    readAutomations(),
    readAutomationBusinesses(id),
  ]);
  if (!definitions || !businesses) throw new Error('[founder] automations unavailable');
  const definition = definitions.find((d) => d.id === id);
  if (!definition) notFound();
  return (
    <AutomationBusinessesScreen
      user={{ name: session.name }}
      definition={definition}
      businesses={businesses}
    />
  );
}
