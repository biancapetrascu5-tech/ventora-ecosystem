'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { APPS, Button, Toast, type AppName, type IconName } from '@ventora/ui';
import { useIsPhone } from '@ventora/screens';
import type { AppsData } from '@/server/catalog-actions';
import { requestApp, tellOwner } from '@/server/plan-actions';
import {
  rejectRecommendation,
  type TeamRecommendationView,
} from '@/server/team-recommendation-actions';
import { useLimits } from '../catalog/useLimits';
import { useMoney } from '../plan/format';
import { PurchaseDialog, type PurchaseTarget } from '../plan/PurchaseDialog';
import { RecommendNoteDialog, RejectRecommendationDialog } from '../growth/RecommendDialogs';
import { TeamRecommendationCard } from '../growth/TeamRecommendationCard';
import { AppView } from './AppView';
import { APP_CONTENT } from './content';
import s from './apps.module.css';

/* Lotul 3.7 — HubCatalogApp + HubAppActivation (S113 / S117 / D3-24):
   - owner, aplicație „Direct”: „Activează · 49 lei pe lună” → AddonPurchase cu implementarea și
     plata proporțională, plătit prin core/billing (cu cardul salvat sau scris acum);
   - owner, „La cerere” (sau plată manuală): „Cere activare” → cererea din Lotul 3.4 (Founder ·
     Cereri), „Am trimis cererea”;
   - admin / membru: „Recomandă aplicația” și cine decide → notificarea owner-ului.
   Perioada de probă („Încearcă gratuit 14 zile”) vine în Lotul 3.8; aici nu apare. */

type Toasted = { tone: 'done' | 'danger' | 'neutral'; title: string; description?: string };

export function AppScreen({
  data,
  app,
  teamRecommendation = null,
}: {
  data: AppsData;
  app: AppName;
  /** S147: recomandarea în așteptare a unui coleg pentru aplicația asta (doar owner / admin). */
  teamRecommendation?: TeamRecommendationView | null;
}) {
  const phone = useIsPhone();
  const t = useTranslations('hub.app');
  const apps = useTranslations('hub.apps');
  const catalog = useTranslations('catalog');
  const pay = useTranslations('pay');
  const plan = useTranslations('hub.plan');
  const ui = useTranslations('ui');
  const limits = useLimits();
  const money = useMoney(data.currency);
  const [purchase, setPurchase] = useState<PurchaseTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [toast, setToast] = useState<Toasted | null>(null);

  const entry = data.applications.find((a) => a.id === app);
  const content = APP_CONTENT[app];
  const owned = !!entry?.active;
  const alaCarte = data.current.lines.some((l) => l.applicationId === app);
  const monthMinor = entry?.monthMinor ?? null;
  const setupMinor = entry?.setupMinor ?? 0;
  const direct =
    entry?.activationMode === 'direct' && monthMinor !== null && !data.billing?.manualPayment;
  const includes = entry ? limits(entry.quotas) : [];
  const lead = content ? t(`content.${app}.lead`) : `${apps(`desc.${app}`)}.`;

  async function ask() {
    setBusy(true);
    const res = await requestApp(app);
    setBusy(false);
    if (!res.ok) {
      setToast({ tone: 'danger', title: plan('sendFailed') });
      return;
    }
    setDone(true);
    setToast({
      tone: 'done',
      title: catalog('app.requestSent'),
      description: catalog('app.requestSentBody'),
    });
  }

  // S147: „Recomandă” deschide dialogul cu nota opțională pentru proprietar
  const [noting, setNoting] = useState(false);
  function recommend() {
    setNoting(true);
  }
  async function sendRecommendation(note: string): Promise<boolean> {
    setBusy(true);
    const res = await tellOwner('application', app, note);
    setBusy(false);
    if (!res.ok) {
      setToast({ tone: 'danger', title: plan('sendFailed') });
      return false;
    }
    setDone(true);
    setToast({ tone: 'done', title: pay('recommendSent', { who: data.ownerName ?? '' }) });
    return true;
  }

  // S147 (cadrul 5): cardul cu nota colegului; „Respinge” cu motivul opțional (cadrele 6–8)
  const [reco, setReco] = useState(owned ? null : teamRecommendation);
  const [rejecting, setRejecting] = useState(false);
  async function confirmReject(reason: string): Promise<boolean> {
    if (!reco) return false;
    const res = await rejectRecommendation(reco.id, reason);
    if (!res.ok) {
      setToast({ tone: 'danger', title: plan('sendFailed') });
      return false;
    }
    setToast({
      tone: 'neutral',
      title: pay('states.rejected.title'),
      description: pay('states.rejected.body', { member: reco.by }),
    });
    setReco(null);
    return true;
  }

  function activate() {
    setPurchase({
      kind: 'application',
      applicationId: app,
      name: catalog('app.activateTitle', { app: APPS[app]?.name ?? app }),
      description: catalog('app.activateDescAlc', { price: money.minor(monthMinor ?? 0) }),
      icon: (APPS[app]?.icon ?? 'layout-grid') as IconName,
      priceMinor: monthMinor ?? 0,
      includes,
    });
  }
  const activateLabel = catalog('app.activate', { price: money.minor(monthMinor ?? 0) });

  let actions = null;
  if (!owned && data.owner) {
    actions = direct ? (
      <Button variant="primary" block onPress={activate}>
        {activateLabel}
      </Button>
    ) : (
      <Button
        variant="primary"
        block
        icon="send"
        isPending={busy}
        isDisabled={done}
        onPress={() => void ask()}
      >
        {catalog('app.request')}
      </Button>
    );
  } else if (!owned && data.ownerName) {
    actions = (
      <>
        <Button
          variant="primary"
          block
          icon="send"
          isPending={busy}
          isDisabled={done}
          onPress={recommend}
        >
          {t('recommend')}
        </Button>
        <p className={`caption muted ${s.m0}`}>{t('decider', { who: data.ownerName })}</p>
      </>
    );
  }

  return (
    <>
      <AppView
        phone={phone}
        app={app}
        lead={lead}
        allHref="/applications"
        allLabel={apps('bar')}
        notInPlan={!owned}
        owned={
          owned
            ? alaCarte
              ? catalog('app.alaCarte')
              : data.bundleName
                ? catalog('app.inBundle', { name: data.bundleName })
                : undefined
            : undefined
        }
        features={
          content
            ? Array.from({ length: content.features }, (_, i) => t(`content.${app}.f${i + 1}`))
            : undefined
        }
        links={content?.links}
        summary={[
          ...(monthMinor !== null
            ? [
                {
                  label: catalog('app.maintenanceLabel'),
                  value: catalog('bundles.price', { amount: money.minor(monthMinor) }),
                  strong: true,
                },
                { label: t('paid'), value: t('paidValue') },
              ]
            : []),
          {
            label: pay('setupCost'),
            value:
              setupMinor > 0
                ? catalog('app.setupValue', { amount: money.minor(setupMinor) })
                : pay('noneCost'),
          },
        ]}
        includes={
          includes.length > 0 ? { title: catalog('app.includes'), items: includes } : undefined
        }
        note={!owned && !direct && data.owner ? catalog('app.onRequestNote') : undefined}
        actions={actions}
        banner={
          reco ? (
            <TeamRecommendationCard
              app={app}
              by={reco.by}
              note={reco.note}
              primary={
                data.owner ? (
                  direct ? (
                    <Button variant="primary" size="sm" onPress={activate}>
                      {activateLabel}
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      icon="send"
                      isPending={busy}
                      isDisabled={done}
                      onPress={() => void ask()}
                    >
                      {catalog('app.request')}
                    </Button>
                  )
                ) : undefined
              }
              onReject={() => setRejecting(true)}
            />
          ) : undefined
        }
      />
      {reco && (
        <RejectRecommendationDialog
          member={reco.by}
          open={rejecting}
          onClose={() => setRejecting(false)}
          onReject={confirmReject}
        />
      )}

      {purchase && (
        <PurchaseDialog
          key={app}
          target={purchase}
          currency={data.currency}
          card={data.billing?.card ?? null}
          publishableKey={data.billing?.publishableKey ?? null}
          onClose={() => setPurchase(null)}
          onRefused={(reason) => {
            setPurchase(null);
            // la cerere, plată manuală sau abonament fără card: devine cererea din Lotul 3.4
            if (reason === 'already_active' || reason === 'not_available') {
              setToast({ tone: 'danger', title: plan('sendFailed') });
            } else {
              void ask();
            }
          }}
        />
      )}

      <RecommendNoteDialog
        app={APPS[app]?.name ?? app}
        owner={data.ownerName ?? ''}
        open={noting}
        onClose={() => setNoting(false)}
        onSend={sendRecommendation}
      />
      {toast && (
        <div className={s.toast}>
          <Toast
            tone={toast.tone}
            title={toast.title}
            description={toast.description}
            onDismiss={() => setToast(null)}
            dismissLabel={ui('close')}
          />
        </div>
      )}
    </>
  );
}
