'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button, DialogTrigger, Notice, StatusPill, Tabs, Toast } from '@ventora/ui';
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
import type { BusinessCommercialData, QuotaInfo } from '@/server/commercial-actions';
import { commercialStyles as cs } from '@ventora/screens';
import { FounderShell } from '../shell/FounderShell';
import { ExceptionFlow, type ExceptionTarget } from '../commercial/ExceptionFlow';
import {
  BillingTab,
  PlanCard,
  useCommercialText,
  useUsageAndExceptions,
} from './BusinessCommercialParts';
import { FounderSupportFlow } from '../support/FounderSupportFlow';
import { OwnerRecoveryFlow } from '../recovery/OwnerRecoveryFlow';
import { businessStatus } from './status';
import s from './business-screen.module.css';

/* FounderBusiness (Lot 2.8): antetul, „Mai multe acțiuni” → sesiunea de suport (FounderSupportFlow)
   și recuperarea proprietarului (OwnerRecoveryFlow), pe afacerea paginii (S95); suspendarea cu
   confirmarea numelui (D3-20 a). Lot 2.9b (FounderBusinessActions, S112): pe o afacere
   suspendată „Reactivează afacerea” e acțiunea principală, cu confirmare, nota de sub antet și
   toastul de după; „Ultimele modificări” cu numele celui din echipa Ventora. Lotul 3.4: partea
   comercială — filele (Prezentare, Consum, Excepții, Plăți și facturi, Jurnal), consumul pe
   perioada reală, excepțiile cu „Adaugă o excepție” și prelungirea auditată, fișa abonamentului
   și reducerile. „Mută pe altă versiune” (bundle-urile, D3-24) vine cu designul S117. */

export type BusinessTab = 'overview' | 'usage' | 'exceptions' | 'billing' | 'log';

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
  | 'support_owner_recovery_performed'
  | 'commercial_override_created'
  | 'commercial_override_extended'
  | 'commercial_override_ended'
  | 'commercial_discount_created'
  | 'commercial_discount_updated'
  | 'commercial_discount_ended'
  | 'commercial_addon_granted'
  | 'commercial_application_line_added'
  | 'commercial_subscription_assigned'
  | 'commercial_version_change_scheduled'
  | 'commercial_currency_set';

export function BusinessScreen({
  user,
  data,
  commercial,
  quotas,
  requestsBadge,
  initialTab = 'overview',
  openException = false,
  purchaseFailed = false,
}: {
  user: { name: string };
  data: BusinessPageData;
  commercial: BusinessCommercialData | null;
  quotas: QuotaInfo[];
  requestsBadge: number;
  initialTab?: BusinessTab;
  openException?: boolean;
  /** „Afacere nouă”: afacerea s-a creat, abonamentul nu (business-actions). */
  purchaseFailed?: boolean;
}) {
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
  const [tab, setTab] = useState<BusinessTab>(initialTab);
  const [toast, setToast] = useState<string | null>(null);
  const limited = quotas.filter((x) => (commercial?.quotas ?? []).some((u) => u.key === x.key));
  const addTarget: ExceptionTarget = { kind: 'add', quotas: limited.length ? limited : quotas };
  const [exception, setException] = useState<ExceptionTarget | null>(
    openException && !suspended ? addTarget : null,
  );
  const text = useCommercialText(commercial);
  const parts = useUsageAndExceptions({
    organizationId: b.id,
    c: commercial,
    phone,
    onAdd: () => setException(addTarget),
    onExtend: (id) => {
      const o = commercial?.overrides.find((x) => x.id === id);
      if (o) {
        setException({
          kind: 'extend',
          overrideId: o.id,
          quotaKey: o.quotaKey ?? '',
          limit: o.limit,
          expiresAt: o.expiresAt,
        });
      }
    },
    onEnded: (msg) => {
      setToast(msg);
      router.refresh();
    },
  });

  const since = new Intl.DateTimeFormat(intlLocale('ro'), {
    month: 'long',
    year: 'numeric',
  }).format(new Date(b.createdAt));
  const meta = [
    commercial ? text.meta : null,
    t('since', { date: since }),
    b.owner ? t('owner', { name: b.owner.name }) : null,
  ]
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
      <FounderShell active="afaceri" title={b.name} user={user} requestsBadge={requestsBadge}>
        <BusinessView
          name={b.name}
          status={businessStatus(b.status, tl, {
            topPct: Math.max(
              0,
              ...(commercial?.quotas ?? [])
                .filter((x) => x.limit !== null && x.limit > 0)
                .map((x) => Math.round((x.used / x.limit!) * 100)),
            ),
          })}
          meta={meta}
          primaryAction={
            suspended ? (
              <Button variant="primary" icon="rotate-ccw" onPress={() => setReactivateOpen(true)}>
                {t('reactivate')}
              </Button>
            ) : (
              <Button icon="sliders-horizontal" onPress={() => setException(addTarget)}>
                {t('addException')}
              </Button>
            )
          }
          menu={menu}
          onMenuAction={onMenu}
          tabs={
            <Tabs
              label={b.name}
              selectedKey={tab}
              onSelectionChange={(k) => setTab(k as BusinessTab)}
              items={[
                { id: 'overview', label: t('tabs.overview') },
                { id: 'usage', label: t('tabs.usage') },
                {
                  id: 'exceptions',
                  label: t('tabs.exceptions'),
                  count: commercial?.overrides.length || undefined,
                },
                { id: 'billing', label: t('tabs.billing') },
                { id: 'log', label: t('tabs.log') },
              ]}
            />
          }
          main={
            tab === 'overview' ? (
              <>
                {parts.usage}
                {parts.exceptions}
              </>
            ) : undefined
          }
          full={
            tab === 'usage' ? (
              parts.usage
            ) : tab === 'exceptions' ? (
              parts.exceptions
            ) : tab === 'billing' ? (
              <BillingTab
                organizationId={b.id}
                business={b.name}
                c={commercial}
                onDone={setToast}
              />
            ) : undefined
          }
          plan={<PlanCard c={commercial} />}
          owner={owner}
          recent={recent}
          notice={
            suspended && suspendedOn ? (
              <Notice tone="neutral" icon="lock">
                {data.suspension?.by
                  ? t('suspendedNotice', { date: suspendedOn, name: data.suspension.by })
                  : t('suspendedNoticeNoName', { date: suspendedOn })}
              </Notice>
            ) : purchaseFailed ? (
              <Notice tone="danger">{t('purchaseFailed')}</Notice>
            ) : undefined
          }
        />
      </FounderShell>
      <OwnerRecoveryFlow organizationId={b.id} open={recoveryOpen} onOpenChange={setRecoveryOpen} />
      <ExceptionFlow
        organizationId={b.id}
        business={b.name}
        target={exception}
        onClose={() => setException(null)}
        onDone={(msg) => {
          setException(null);
          setToast(msg);
          router.refresh();
        }}
      />
      {toast && (
        <div className={phone ? `${cs.toast} ${cs.toastMob}` : cs.toast}>
          <Toast
            tone="done"
            title={toast}
            onDismiss={() => setToast(null)}
            dismissLabel={ui('close')}
          />
        </div>
      )}
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
