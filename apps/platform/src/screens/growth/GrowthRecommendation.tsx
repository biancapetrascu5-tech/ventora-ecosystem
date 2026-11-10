'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { AppTile, GrowthSlot, RecommendationCard, Toast, type AccessState } from '@ventora/ui';
import type { GrowthSlotView } from '@/server/growth-slot';
import { growthInteraction } from '@/server/growth-actions';
import { useAppTileLabels } from '../labels';
import { useMoney } from '../plan/format';
import styles from './growth.module.css';

/*
 * Lotul 5.9a — o recomandare Growth într-un slot (GrowthSlot): gol = nimic desenat.
 *   - „Nu mă interesează” → recomandarea dispare, Toast „Am înțeles, nu-ți mai arătăm asta.” cu
 *     „Anulează” (anularea șterge suprimarea);
 *   - „Amintește-mi mai târziu” → „Bine, îți amintim peste o săptămână / o lună.” cu „Anulează”;
 *   - acțiunea principală nu activează nimic: deschide opțiunile (`onAction`), iar plata are
 *     pasul ei de confirmare (5.9c, D-GRW-10);
 *   - pentru membru: doar „Recomandă aplicația”, niciodată o ofertă de cumpărare (P21).
 */

const key = () => crypto.randomUUID();

export function useCostLine(view: GrowthSlotView | null): string | null {
  const t = useTranslations('hub.growth.cost');
  const money = useMoney(view?.cost.currency ?? 'RON');
  if (!view) return null;
  const c = view.cost;
  const amount = money.minor(c.amountMinor);
  const price =
    c.interval === 'month'
      ? t('month', { amount })
      : c.interval === 'year'
        ? t('year', { amount })
        : t('once', { amount });
  const main = c.trial ? t('trial', { days: c.trial.days, price }) : price;
  if (c.trial && !c.setupMinor) return main;
  return `${main} · ${c.setupMinor ? t('setup', { amount: money.minor(c.setupMinor) }) : t('noSetup')}`;
}

type Hidden = { kind: 'dismiss' | 'snooze'; period?: 'week' | 'month' } | null;

function useGrowthGestures(view: GrowthSlotView) {
  const [hidden, setHidden] = useState<Hidden>(null);
  const [toast, setToast] = useState(false);
  const busy = useRef(false);

  const send = (
    kind: 'click' | 'dismiss' | 'snooze' | 'recommend' | 'undo',
    snooze?: 'week' | 'month',
  ) =>
    growthInteraction({
      contentId: view.contentId,
      kind,
      key: key(),
      ...(snooze ? { snooze } : {}),
    });

  return {
    hidden,
    toast,
    closeToast: () => setToast(false),
    dismiss: () => {
      setHidden({ kind: 'dismiss' });
      setToast(true);
      void send('dismiss');
    },
    snooze: (period: 'week' | 'month') => {
      setHidden({ kind: 'snooze', period });
      setToast(true);
      void send('snooze', period);
    },
    undo: async () => {
      if (busy.current) return;
      busy.current = true;
      setToast(false);
      const r = await send('undo');
      busy.current = false;
      if (r.ok) setHidden(null);
    },
    click: () => void send('click'),
    recommend: () => send('recommend'),
  };
}

function GestureToast({
  hidden,
  onUndo,
  onClose,
}: {
  hidden: NonNullable<Hidden>;
  onUndo: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('hub.growth.toast');
  const toastT = useTranslations('toast');
  return (
    <div className={styles.toast}>
      <Toast
        tone="done"
        title={
          hidden.kind === 'dismiss'
            ? t('dismissed')
            : hidden.period === 'month'
              ? t('snoozedMonth')
              : t('snoozedWeek')
        }
        onUndo={onUndo}
        undoLabel={toastT('undo')}
        onDismiss={onClose}
        dismissLabel={toastT('close')}
      />
    </div>
  );
}

export interface GrowthRecommendationProps {
  view: GrowthSlotView | null;
  /** Rolul Hub al persoanei: owner / admin decid, ceilalți recomandă. */
  role: string;
  /** Cine decide (proprietarul), pentru membru. */
  decider?: string | null;
  /** Deschide opțiunile ofertei (UpgradeDialog, pasul options); nu cumpără nimic. */
  onOpenOptions: (view: GrowthSlotView) => void;
  /** `row`: pe rândul aplicației din „Alte aplicații” (AppTile); `card`: RecommendationCard. */
  layout?: 'row' | 'card';
  /** Starea aplicației pe rând (AppTile). */
  access?: AccessState;
  /** Clasa AppTile-ului pe rând (stilurile ecranului gazdă). */
  tileClassName?: string;
  className?: string;
}

export function GrowthRecommendation(props: GrowthRecommendationProps) {
  if (!props.view) return null;
  return <GrowthRecommendationInner {...props} view={props.view} />;
}

function GrowthRecommendationInner({
  view,
  role,
  decider,
  onOpenOptions,
  layout = 'card',
  access = 'notInPlan',
  tileClassName,
  className,
}: GrowthRecommendationProps & { view: GrowthSlotView }) {
  const t = useTranslations('hub.growth');
  const pay = useTranslations('pay');
  const tileLabels = useAppTileLabels();
  const cost = useCostLine(view);
  const g = useGrowthGestures(view);
  const [recommended, setRecommended] = useState(false);
  const member = view.audience === 'member' || !(role === 'owner' || role === 'admin');

  const open = () => {
    g.click();
    onOpenOptions(view);
  };
  const remind = view.proactive ? g.snooze : undefined;
  const dismiss = view.proactive ? g.dismiss : undefined;

  let content: ReactNode = null;
  if (!g.hidden) {
    content =
      layout === 'row' && view.app ? (
        <AppTile
          app={view.app}
          access={access}
          layout="row"
          className={tileClassName}
          recommendation={{ reason: view.body, ...(member ? {} : { cost }) }}
          onDetails={open}
          onDismiss={dismiss}
          onRemindLater={remind}
          labels={tileLabels}
        />
      ) : (
        <RecommendationCard
          app={view.app ?? undefined}
          title={view.title}
          benefit={view.body}
          cost={member ? undefined : cost}
          role={member ? 'member' : 'owner'}
          actionLabel={
            member
              ? undefined
              : view.cost.trial
                ? t('actions.tryFree', { days: view.cost.trial.days })
                : t('actions.seeOptions')
          }
          actionIcon={member ? undefined : 'arrow-right'}
          onAction={member ? undefined : open}
          decider={member ? (decider ?? undefined) : undefined}
          onRecommend={
            member
              ? async () => {
                  const r = await g.recommend();
                  if (r.ok) setRecommended(true);
                }
              : undefined
          }
          recommended={recommended}
          status={recommended ? 'pending' : undefined}
          proactive={view.proactive}
          onDismiss={dismiss}
          onRemindLater={remind}
          labels={{
            recommendation: pay('recommendation'),
            recommendSend: t('actions.recommendApp'),
            decides: (who) => pay('decides', { who }),
            recommendSent: (who) => pay('recommendSent', { who }),
            recoActivated: t('status.activated'),
            recoDeclined: t('status.declined'),
            recoPending: t('status.pending'),
            remind: tileLabels.remind,
          }}
        />
      );
  }

  return (
    <>
      <GrowthSlot label={pay('recommendation')} className={className}>
        {content}
      </GrowthSlot>
      {g.toast && g.hidden && (
        <GestureToast hidden={g.hidden} onUndo={() => void g.undo()} onClose={g.closeToast} />
      )}
    </>
  );
}
