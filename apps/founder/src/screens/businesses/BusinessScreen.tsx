'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button, DialogTrigger, Notice, StatusPill, Toast } from '@ventora/ui';
import {
  BusinessView,
  ReactivateBusinessDialog,
  SuspendBusinessDialog,
  intlLocale,
  useDates,
  useIsPhone,
  type BusinessChange,
  type BusinessMenuItem,
} from '@ventora/screens';
import { reactivate, suspend, type BusinessPageData } from '@/server/business-actions';
import { FounderShell } from '../shell/FounderShell';
import { FounderSupportFlow } from '../support/FounderSupportFlow';
import { OwnerRecoveryFlow } from '../recovery/OwnerRecoveryFlow';
import { businessStatus } from './status';
import s from './business-screen.module.css';

/* FounderBusiness (Lot 2.8): antetul, „Mai multe acțiuni” → sesiunea de suport (FounderSupportFlow)
   și recuperarea proprietarului (OwnerRecoveryFlow), pe afacerea paginii (S95); suspendarea cu
   confirmarea numelui (D3-20 a). Lot 2.9b (FounderBusinessActions, S112): pe o afacere
   suspendată „Reactivează afacerea” e acțiunea principală, cu confirmare, nota de sub antet și
   toastul de după; „Ultimele modificări” cu numele celui din echipa Ventora. Fără partea
   comercială (Lotul 3.4: „Adaugă o excepție”, „Mută pe altă versiune”). */

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
  const ui = useTranslations('ui');
  const dates = useDates();
  const phone = useIsPhone();
  const b = data.business;
  const suspended = b.status === 'suspended';

  const [supportOpen, setSupportOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [pending, setPending] = useState(false);
  const [reactivated, setReactivated] = useState(false);

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
    // suspended: „Reactivează afacerea” is the main action, next to the menu (S112)
    ...(suspended
      ? []
      : [
          {
            id: 'suspend',
            label: t('suspend'),
            icon: 'lock' as const,
            danger: true,
            separatorBefore: true,
          },
        ]),
  ];

  function onMenu(id: string) {
    if (id === 'support') setSupportOpen(true);
    else if (id === 'recovery') setRecoveryOpen(true);
    else if (id === 'suspend') {
      setConfirmName('');
      setSuspendOpen(true);
    }
  }

  async function confirmSuspend() {
    setPending(true);
    const ok = await suspend(b.id, confirmName);
    setPending(false);
    if (ok) {
      setSuspendOpen(false);
      setReactivated(false);
      router.refresh();
    }
  }

  async function confirmReactivate() {
    setPending(true);
    const ok = await reactivate(b.id);
    setPending(false);
    if (ok) {
      setReactivateOpen(false);
      setReactivated(true);
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

  // „{event} ({name})” when the Ventora team made the change; creating the business also sent
  // the owner's invitation (one audit row, two lines — no new audit row)
  const recent: BusinessChange[] = data.recent.flatMap((r) => {
    const date = dates.day(new Date(r.createdAt));
    const event = t(`change.${r.action.replace(/\./g, '_') as Change}`);
    const text = r.founderName ? t('log.by', { event, name: r.founderName }) : event;
    return r.action === 'org.created'
      ? [
          { id: `${r.id}-invite`, date, text: t('log.inviteSent') },
          { id: r.id, date, text },
        ]
      : [{ id: r.id, date, text }];
  });
  const suspendedOn = data.suspension ? dates.day(new Date(data.suspension.at)) : undefined;

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
          primaryAction={
            suspended ? (
              <Button variant="primary" icon="rotate-ccw" onPress={() => setReactivateOpen(true)}>
                {t('reactivate')}
              </Button>
            ) : undefined
          }
          menu={menu}
          onMenuAction={onMenu}
          owner={owner}
          recent={recent}
          notice={
            suspended && suspendedOn ? (
              <Notice tone="neutral" icon="lock">
                {data.suspension?.by
                  ? t('suspendedNotice', { date: suspendedOn, name: data.suspension.by })
                  : t('suspendedNoticeNoName', { date: suspendedOn })}
              </Notice>
            ) : undefined
          }
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
      <DialogTrigger isOpen={reactivateOpen} onOpenChange={setReactivateOpen}>
        <ReactivateBusinessDialog
          name={b.name}
          people={b.memberCount}
          suspendedOn={suspendedOn}
          suspendedBy={data.suspension?.by}
          pending={pending}
          mob={phone}
          onCancel={() => setReactivateOpen(false)}
          onConfirm={() => void confirmReactivate()}
        />
      </DialogTrigger>
      {reactivated && !suspended && (
        <div className={s.toast}>
          <Toast
            tone="done"
            title={t('reactivateDialog.done', { business: b.name })}
            description={t('reactivateDialog.doneBody')}
            onDismiss={() => setReactivated(false)}
            dismissLabel={ui('close')}
          />
        </div>
      )}
    </FounderSupportFlow>
  );
}
