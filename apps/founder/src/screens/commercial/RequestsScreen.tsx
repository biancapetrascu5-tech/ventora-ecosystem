'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { APPS, DialogTrigger, Toast, type AppName } from '@ventora/ui';
import {
  RefuseRequestDialog,
  RequestsView,
  commercialStyles as cs,
  useIsPhone,
  useWhen,
  type RequestRow,
} from '@ventora/screens';
import {
  markRequestResolved,
  refuseRequestWithReason,
  type RequestData,
} from '@/server/commercial-actions';
import { FounderShell } from '../shell/FounderShell';

/* FounderRequests (Lotul 3.4, S111): cererile din Hub. „Marchează rezolvată” după schimbarea
   făcută în pagina afacerii; „Refuză…” cu motivul pe care cel care a cerut îl vede în Hub
   (notificarea vine cu F4, din evenimentul commercial.request.decided). Auditate pe Founder. */

export function RequestsScreen({
  user,
  requests,
}: {
  user: { name: string };
  requests: RequestData[];
}) {
  const router = useRouter();
  const t = useTranslations('founder.requests');
  const owner = useTranslations('founder.business');
  const ui = useTranslations('ui');
  const when = useWhen();
  const phone = useIsPhone();
  const [filter, setFilter] = useState<'new' | 'all'>('new');
  const [refusing, setRefusing] = useState<RequestData | null>(null);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [toast, setToast] = useState<{ tone: 'done' | 'danger'; text: string } | null>(null);

  const item = (r: RequestData) =>
    r.targetType === 'application' ? (APPS[r.item as AppName]?.name ?? r.item) : r.item;
  const toRow = (r: RequestData): RequestRow => ({
    id: r.id,
    business: r.business,
    type: r.kind === 'plan_change' ? 'plan' : 'activation',
    item: item(r),
    who: r.who ? owner('owner', { name: r.who }) : '',
    when: when(new Date(r.createdAt)),
    status: r.status,
  });
  const newCount = requests.filter((r) => r.status === 'new').length;
  const shown = requests.filter((r) => filter === 'all' || r.status === 'new').map(toRow);
  const find = (row: RequestRow) => requests.find((r) => r.id === row.id)!;

  async function resolve(row: RequestRow) {
    const r = find(row);
    const res = await markRequestResolved(r.organizationId, r.id);
    setToast(
      res.ok
        ? { tone: 'done', text: t('resolved', { name: r.who || r.business }) }
        : { tone: 'danger', text: t('error') },
    );
    router.refresh();
  }

  async function refuse() {
    if (!refusing) return;
    setPending(true);
    setFailed(false);
    const res = await refuseRequestWithReason(refusing.organizationId, refusing.id, reason);
    setPending(false);
    if (!res.ok) {
      setFailed(true);
      return;
    }
    setToast({ tone: 'done', text: t('refused', { name: refusing.who || refusing.business }) });
    setRefusing(null);
    router.refresh();
  }

  return (
    <FounderShell active="cereri" title={t('nav')} user={user} requestsBadge={newCount}>
      <RequestsView
        rows={shown}
        filter={filter}
        onFilterChange={setFilter}
        newCount={newCount}
        onOpen={(row) => router.push(`/businesses/${find(row).organizationId}`)}
        onResolve={(row) => void resolve(row)}
        onRefuse={(row) => {
          setReason('');
          setFailed(false);
          setRefusing(find(row));
        }}
      />
      <DialogTrigger isOpen={!!refusing} onOpenChange={(o) => !o && setRefusing(null)}>
        {refusing ? (
          <RefuseRequestDialog
            business={refusing.business}
            what={[
              t('refuse.what', {
                type: t(`type.${refusing.kind === 'plan_change' ? 'plan' : 'activation'}`),
                item: item(refusing),
              }),
              refusing.who,
              when(new Date(refusing.createdAt)),
            ]
              .filter(Boolean)
              .join(' · ')}
            name={refusing.who || refusing.business}
            reason={reason}
            onReasonChange={setReason}
            pending={pending}
            failed={failed}
            mob={phone}
            onCancel={() => setRefusing(null)}
            onConfirm={() => void refuse()}
          />
        ) : (
          <></>
        )}
      </DialogTrigger>
      {toast && (
        <div className={phone ? `${cs.toast} ${cs.toastMob}` : cs.toast}>
          <Toast
            tone={toast.tone}
            title={toast.text}
            onDismiss={() => setToast(null)}
            dismissLabel={ui('close')}
          />
        </div>
      )}
    </FounderShell>
  );
}
