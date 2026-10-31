'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { DialogTrigger, StatusPill } from '@ventora/ui';
import {
  BusinessView,
  SuspendBusinessDialog,
  intlLocale,
  useDates,
  useIsPhone,
  type BusinessMenuItem,
} from '@ventora/screens';
import { reactivate, suspend, type BusinessPageData } from '@/server/business-actions';
import { FounderShell } from '../shell/FounderShell';
import { FounderSupportFlow } from '../support/FounderSupportFlow';
import { OwnerRecoveryFlow } from '../recovery/OwnerRecoveryFlow';
import { businessStatus } from './status';

/* FounderBusiness (Lot 2.8): antetul, „Mai multe” → sesiunea de suport (FounderSupportFlow) și
   recuperarea proprietarului (OwnerRecoveryFlow), pe afacerea paginii (S95); suspendarea cu
   confirmarea numelui și reactivarea (D3-20 a). Fără partea comercială (Lotul 3.4). */

type Change =
  | 'org_created'
  | 'org_suspended'
  | 'org_reactivated'
  | 'invitation_created'
  | 'invitation_resent'
  | 'invitation_revoked'
  | 'invitation_accepted'
  | 'application_access_granted'
  | 'support_session_opened'
  | 'support_session_closed'
  | 'support_session_revoked_by_org'
  | 'support_owner_recovery_performed';

export function BusinessScreen({ user, data }: { user: { name: string }; data: BusinessPageData }) {
  const router = useRouter();
  const t = useTranslations('founder.business');
  const tl = useTranslations('founder.businesses');
  const team = useTranslations('hub.team');
  const dates = useDates();
  const phone = useIsPhone();
  const b = data.business;

  const [supportOpen, setSupportOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [pending, setPending] = useState(false);

  const since = new Intl.DateTimeFormat(intlLocale('ro'), {
    month: 'long',
    year: 'numeric',
  }).format(new Date(b.createdAt));
  const meta = [t('since', { date: since }), b.owner ? t('owner', { name: b.owner.name }) : null]
    .filter(Boolean)
    .join(' · ');

  const menu: BusinessMenuItem[] = [
    { id: 'support', label: t('openSupport'), icon: 'eye' },
    ...(b.owner ? [{ id: 'recovery', label: t('recover'), icon: 'key-round' as const }] : []),
    b.status === 'suspended'
      ? { id: 'reactivate', label: t('reactivate'), icon: 'unlock', separatorBefore: true }
      : { id: 'suspend', label: t('suspend'), icon: 'lock', danger: true, separatorBefore: true },
  ];

  async function onMenu(id: string) {
    if (id === 'support') setSupportOpen(true);
    else if (id === 'recovery') setRecoveryOpen(true);
    else if (id === 'suspend') {
      setConfirmName('');
      setSuspendOpen(true);
    } else if (id === 'reactivate') {
      setPending(true);
      await reactivate(b.id);
      setPending(false);
      router.refresh();
    }
  }

  async function confirmSuspend() {
    setPending(true);
    const ok = await suspend(b.id, confirmName);
    setPending(false);
    if (ok) {
      setSuspendOpen(false);
      router.refresh();
    }
  }

  const owner = b.owner ? (
    <>
      <p className="body">{b.owner.name}</p>
      <p className="body-small muted">{b.owner.email}</p>
    </>
  ) : b.ownerInvitation ? (
    <>
      <p className="body">{b.ownerInvitation.email}</p>
      <span>
        <StatusPill tone={b.ownerInvitation.state === 'expired' ? 'attention' : 'neutral'}>
          {b.ownerInvitation.state === 'expired' ? team('statusExpired') : team('statusPending')}
        </StatusPill>
      </span>
    </>
  ) : null;

  return (
    <FounderSupportFlow
      organizationId={b.id}
      organizationName={b.name}
      opening={supportOpen}
      onOpeningChange={setSupportOpen}
    >
      <FounderShell active="afaceri" title={b.name} user={user}>
        <BusinessView
          name={b.name}
          status={businessStatus(b.status, tl)}
          meta={meta}
          menu={menu}
          onMenuAction={(id) => void onMenu(id)}
          owner={owner}
          recent={data.recent.map((r) => ({
            id: r.id,
            date: dates.day(new Date(r.createdAt)),
            text: t(`change.${r.action.replace(/\./g, '_') as Change}`),
          }))}
        />
      </FounderShell>
      <OwnerRecoveryFlow organizationId={b.id} open={recoveryOpen} onOpenChange={setRecoveryOpen} />
      <DialogTrigger isOpen={suspendOpen} onOpenChange={setSuspendOpen}>
        <SuspendBusinessDialog
          name={b.name}
          people={b.memberCount}
          value={confirmName}
          onValueChange={setConfirmName}
          pending={pending}
          mob={phone}
          onCancel={() => setSuspendOpen(false)}
          onConfirm={() => void confirmSuspend()}
        />
      </DialogTrigger>
    </FounderSupportFlow>
  );
}
