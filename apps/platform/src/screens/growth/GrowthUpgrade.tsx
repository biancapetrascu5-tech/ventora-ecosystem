'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { APPS, DialogTrigger, UpgradeDialog, type UpgradeOption } from '@ventora/ui';
import { useIsPhone } from '@ventora/screens';
import type { GrowthSlotView } from '@/server/growth-slot';
import { growthInteraction } from '@/server/growth-actions';
import { startTrial, tellOwner } from '@/server/plan-actions';
import { useUpgradeLabels } from '../labels';
import { useDays, useMoney } from '../plan/format';
import { useCostLine } from './cost';

/*
 * Lotul 5.9c — UpgradeDialog pentru o recomandare (D-GRW-10, FAZA-5 5.9c). Orice acțiune dintr-o
 * recomandare ajunge aici, la pasul `options`, cu prețul, periodicitatea, costul de implementare
 * și condițiile probei, înainte de orice confirmare. Nimic nu se activează din `options`:
 *   - proba: pasul `confirm` separat, apoi doar „Începe perioada de probă” o pornește (fără card,
 *     la final aplicația se oprește);
 *   - aplicația / pachetul: „Continuă” predă fluxului existent (HubAppActivation / PurchaseDialog),
 *     care are confirmarea și plata lui (`onContinue`);
 *   - abonamentul / bundle-ul: rămâne o cerere („Cere alt abonament”, D-COM-7), în catalog.
 * Membrul (și adminul, care nu cumpără, D3-8) vede variantele și cine decide; „Recomandă” anunță
 * owner-ul.
 */

type Step = 'options' | 'confirm' | 'processing' | 'trial' | 'error';

export interface GrowthUpgradeProps {
  view: GrowthSlotView;
  /** Doar owner-ul cumpără (D3-8). */
  owner: boolean;
  decider?: string | null;
  /** Predă unui flux existent (aplicația, pachetul, cererea de abonament), care are confirmarea lui. */
  onContinue: (view: GrowthSlotView) => void;
  onClose: () => void;
}

export function GrowthUpgrade({ view, owner, decider, onContinue, onClose }: GrowthUpgradeProps) {
  const router = useRouter();
  const t = useTranslations('hub.growth');
  const pay = useTranslations('pay');
  const app = useTranslations('hub.app');
  const labels = useUpgradeLabels();
  const phone = useIsPhone();
  const days = useDays();
  const money = useMoney(view.cost.currency);
  const cost = useCostLine(view);
  const [step, setStep] = useState<Step>('options');
  const [recommended, setRecommended] = useState(false);
  const [endsAt, setEndsAt] = useState<string | null>(null);

  const appName = view.app ? (APPS[view.app]?.name ?? view.app) : view.title;
  const isTrial = view.kind === 'trial' && !!view.app && !!view.cost.trial;
  const isPlan = view.kind === 'bundle' || view.kind === 'plan_upgrade';
  const option: UpgradeOption = {
    id: view.contentId,
    kind: isTrial ? 'trial' : isPlan ? 'plan' : 'pack',
    title: isTrial ? t('actions.tryFree', { days: view.cost.trial?.days ?? 14 }) : view.title,
    ...(cost ? { price: cost } : {}),
  };

  const recommend = async () => {
    const r = await growthInteraction({
      contentId: view.contentId,
      kind: 'recommend',
      key: crypto.randomUUID(),
    });
    if (view.app) await tellOwner('application', view.app);
    setRecommended(r.ok);
  };

  const begin = async () => {
    if (!view.app) return;
    setStep('processing');
    const r = await startTrial(view.app);
    if (r.ok) {
      setEndsAt(r.endsAt);
      setStep('trial');
    } else setStep('error');
  };

  const c = view.cost;
  const price =
    c.interval === 'month'
      ? t('cost.month', { amount: money.minor(c.amountMinor) })
      : c.interval === 'year'
        ? t('cost.year', { amount: money.minor(c.amountMinor) })
        : t('cost.once', { amount: money.minor(c.amountMinor) });

  return (
    <DialogTrigger isOpen onOpenChange={(o) => !o && onClose()}>
      <UpgradeDialog
        inline={false}
        sheet={phone}
        step={step}
        title={view.title}
        description={view.body}
        options={[option]}
        value={option.id}
        role={owner ? 'owner' : 'member'}
        decider={decider ?? undefined}
        recommended={recommended}
        onRecommend={() => void recommend()}
        onContinue={() => {
          if (isTrial) setStep('confirm');
          else {
            onClose();
            onContinue(view);
          }
        }}
        summary={
          isTrial
            ? {
                what: appName,
                when: t('trial.when', { days: c.trial?.days ?? 14 }),
                price: t('trial.then', { price }),
                ...(c.setupMinor ? { setup: money.minor(c.setupMinor) } : {}),
              }
            : undefined
        }
        onPay={() => void begin()}
        onBack={() => setStep('options')}
        onRetry={() => setStep('confirm')}
        trial={
          endsAt
            ? { text: t('trial.started', { app: appName, date: days.long(endsAt) }) }
            : undefined
        }
        error={{ title: t('trial.errorTitle'), message: t('trial.errorBody') }}
        doneLabel={step === 'trial' ? t('trial.open', { app: appName }) : undefined}
        onDone={() => {
          onClose();
          if (step === 'trial' && view.app) router.push(`/applications/${view.app}`);
        }}
        onClose={onClose}
        labels={{ ...labels, decides: (who) => app('decider', { who }), upgrade: pay('upgrade') }}
      />
    </DialogTrigger>
  );
}
