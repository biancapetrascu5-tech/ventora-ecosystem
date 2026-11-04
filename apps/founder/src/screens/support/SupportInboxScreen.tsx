'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { APPS, Toast, type AppName } from '@ventora/ui';
import {
  FounderSupportInboxView,
  supportStyles as s,
  useIsPhone,
  useWhen,
  type FounderGroup,
  type FounderInboxRow,
} from '@ventora/screens';
import { SUPPORT_APPLICATIONS } from '@ventora/support/apps';
import { closeRequest, type InboxData } from '@/server/support-inbox-actions';
import { FounderShell } from '../shell/FounderShell';

/* FounderSupportInbox (Lotul 4.6): „Solicitări de suport”. Filtrele stau în adresă (?group=,
   ?app=, ?biz=, ?q=), lista vine de la server (support.founder_list_requests). */

export type InboxFilters = {
  group: FounderGroup;
  app: string | null;
  biz: string | null;
  q: string;
};

export function useFounderAppName() {
  const t = useTranslations('founder.inbox');
  return (id: string) => (id === 'platform' ? t('appPlatform') : (APPS[id as AppName]?.name ?? id));
}

export const founderGroupOf = (
  status: 'open' | 'in_progress' | 'awaiting_business' | 'closed',
): FounderGroup => (status === 'open' ? 'open' : status === 'closed' ? 'closed' : 'progress');

export function SupportInboxScreen({
  user,
  data,
  filters,
}: {
  user: { name: string };
  data: InboxData;
  filters: InboxFilters;
}) {
  const router = useRouter();
  const t = useTranslations('founder.inbox');
  const ui = useTranslations('ui');
  const when = useWhen();
  const mob = useIsPhone();
  const appName = useFounderAppName();
  const [search, setSearch] = useState(filters.q);
  const [toast, setToast] = useState<string | null>(null);

  const go = (next: Partial<InboxFilters>) => {
    const f = { ...filters, q: search, ...next };
    const qs = new URLSearchParams();
    if (f.group !== 'open') qs.set('group', f.group);
    if (f.app) qs.set('app', f.app);
    if (f.biz) qs.set('biz', f.biz);
    if (f.q.trim()) qs.set('q', f.q.trim());
    const str = qs.toString();
    router.replace(str ? `/support?${str}` : '/support');
  };

  // the search goes to the address a moment after typing stops
  useEffect(() => {
    if (search === filters.q) return;
    const id = setTimeout(() => go({ q: search }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const rows: FounderInboxRow[] = data.items.map((r) => ({
    id: r.id,
    ref: r.ref,
    subject: r.subject,
    blocking: r.urgency === 'blocking',
    overdue: r.overdue,
    business: r.business,
    app: appName(r.applicationId),
    last:
      r.lastMessageBy === 'team'
        ? t('fromTeam', { when: when(new Date(r.lastMessageAt)) })
        : t('fromClient', { name: r.lastMessageName, when: when(new Date(r.lastMessageAt)) }),
    status: founderGroupOf(r.status),
  }));
  const find = (row: FounderInboxRow) => data.items.find((r) => r.id === row.id)!;

  return (
    <FounderShell active="suport" title={t('nav')} user={user} supportBadge={data.counts.open}>
      <FounderSupportInboxView
        mob={mob}
        rows={rows}
        group={filters.group}
        counts={data.counts}
        apps={SUPPORT_APPLICATIONS.map((id) => ({ value: id, label: appName(id) }))}
        app={filters.app}
        businesses={data.businesses.map((b) => ({ value: b.id, label: b.name }))}
        business={filters.biz}
        search={search}
        onGroup={(group) => go({ group })}
        onApp={(app) => go({ app })}
        onBusiness={(biz) => go({ biz })}
        onSearch={setSearch}
        onClear={() => {
          setSearch('');
          go({ app: null, biz: null, q: '' });
        }}
        onOpen={(row) => router.push(`/support/${row.ref}`)}
        onOpenBusiness={(row) => router.push(`/businesses/${find(row).organizationId}`)}
        onClose={async (row) => {
          const r = find(row);
          const res = await closeRequest(r.organizationId, r.id);
          if (res.ok)
            setToast(
              t('closed', {
                name: r.lastMessageBy === 'business' ? r.lastMessageName : r.business,
              }),
            );
          router.refresh();
        }}
      />
      {toast ? (
        <div className={mob ? `${s.toast} ${s.toastMob}` : s.toast}>
          <Toast
            tone="done"
            title={toast}
            onDismiss={() => setToast(null)}
            dismissLabel={ui('close')}
          />
        </div>
      ) : null}
    </FounderShell>
  );
}
