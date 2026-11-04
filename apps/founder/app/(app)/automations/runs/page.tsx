import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getFounderSession } from '@ventora/identity';
import { readAutomations, readRuns } from '@/server/automations-actions';
import { RunsScreen } from '@/screens/automations/AutomationsScreens';

export const dynamic = 'force-dynamic';

/* FounderAutomations (Lotul 4.10): „Jurnalul execuțiilor”, cu „Rulează din nou”. */
export default async function AutomationRunsRoute({
  searchParams,
}: {
  searchParams: Promise<{ automation?: string; business?: string }>;
}) {
  const session = await getFounderSession(await headers());
  if (!session) redirect('/sign-in');
  const { automation, business } = await searchParams;
  const [definitions, runs] = await Promise.all([readAutomations(), readRuns(automation)]);
  if (!definitions || !runs) throw new Error('[founder] automations unavailable');
  return (
    <RunsScreen
      user={{ name: session.name }}
      runs={runs}
      definitions={definitions}
      business={business ?? null}
    />
  );
}
