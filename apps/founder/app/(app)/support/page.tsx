import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getFounderSession } from '@ventora/identity';
import { readSupportInbox } from '@/server/support-inbox-actions';
import { SupportInboxScreen, type InboxFilters } from '@/screens/support/SupportInboxScreen';

export const dynamic = 'force-dynamic';

const GROUPS = new Set(['open', 'progress', 'closed']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* FounderSupportInbox (Lotul 4.6, D4-14 b): „Solicitări de suport”. */
export default async function SupportInboxRoute({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; app?: string; biz?: string; q?: string }>;
}) {
  const session = await getFounderSession(await headers());
  if (!session) redirect('/sign-in');
  const sp = await searchParams;
  const filters: InboxFilters = {
    group: GROUPS.has(sp.group ?? '') ? (sp.group as InboxFilters['group']) : 'open',
    app: sp.app && /^[a-z][a-z0-9_-]{0,63}$/.test(sp.app) ? sp.app : null,
    biz: sp.biz && UUID.test(sp.biz) ? sp.biz : null,
    q: (sp.q ?? '').slice(0, 200),
  };
  const data = await readSupportInbox({
    group: filters.group,
    applicationId: filters.app,
    organizationId: filters.biz,
    search: filters.q,
  });
  if (!data) throw new Error('[founder] support inbox unavailable');
  return <SupportInboxScreen user={{ name: session.name }} data={data} filters={filters} />;
}
