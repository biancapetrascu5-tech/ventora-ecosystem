'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  AddonPurchase,
  DialogTrigger,
  StripeSlot,
  type IconName,
  type PayUsage,
  type PaymentCardData,
} from '@ventora/ui';
import { completeThreeDSecure } from '@/billing/stripe-client';
import { buy, confirmBuy, previewBuy, type BillingRefusal } from '@/server/billing-actions';
import { useIsPhone } from '@ventora/screens';
import { useAddonPurchaseLabels, usePaymentLabels, useUsageMeterLabels } from '../labels';
import { useDays, useMoney } from './format';
import { useCardForm } from './useCardForm';

/* Lotul 3.7 — HubAddonPurchase și HubAppActivation: AddonPurchase pe ecran, cu plata reală
   (core/billing, Lotul 3.5). Prețul se citește pe server (previewBuy), apoi „Plătește”:
   - cu cardul salvat; un card care expiră luna aceasta e semnalat (S111);
   - fără card (doar o aplicație, „Activează”): cardul se scrie în Stripe Elements, se salvează,
     apoi se plătește cu el;
   - 3-D Secure în dialog, apoi starea plății (confirmBuy); dacă dialogul se închide, plata se
     activează tot, din webhook;
   - reușita: limita crescută (înainte / acum) și „Factura se emite” până la Lotul 3.6.
   Refuzurile așteptate (la cerere, plată manuală, fără card, pachet lunar pe abonament anual)
   închid dialogul și trimit la „Cere activare” (onRefused). */

export type PurchaseTarget =
  | {
      kind: 'addon';
      addonId: string;
      name: string;
      description: string;
      icon: IconName;
      /** Prețul unui pachet, în unități mici. */
      priceMinor: number;
      /** Pentru „Înainte / Acum” după plată. */
      usage?: { label: string; used: number; limit: number; unit?: string; perPack: number };
    }
  | {
      kind: 'application';
      applicationId: string;
      name: string;
      description: string;
      icon: IconName;
      priceMinor: number;
      includes?: string[];
    };

type Preview = Extract<Awaited<ReturnType<typeof previewBuy>>, { ok: true }>;
type Step = 'loading' | 'review' | 'processing' | 'success' | 'error';

export function PurchaseDialog({
  target,
  currency,
  card,
  publishableKey,
  onClose,
  onRefused,
  onUseOtherCard,
}: {
  target: PurchaseTarget;
  currency: 'RON' | 'EUR';
  /** Cardul salvat, cu expirarea (din readPlan / readApps). */
  card: { brand: string; last4: string; expMonth: number; expYear: number } | null;
  publishableKey: string | null;
  onClose: () => void;
  onRefused: (reason: BillingRefusal) => void;
  onUseOtherCard?: () => void;
}) {
  const router = useRouter();
  const locale = useLocale();
  const phone = useIsPhone();
  const t = useTranslations('hub.plan');
  const app = useTranslations('hub.app');
  const pay = useTranslations('pay');
  const labels = useAddonPurchaseLabels();
  const payLabels = usePaymentLabels();
  const usageLabels = useUsageMeterLabels();
  const money = useMoney(currency);
  const days = useDays();
  const [step, setStep] = useState<Step>('loading');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<{ title?: string; message?: string } | undefined>();
  const [processingHint, setProcessingHint] = useState<string | null>(null);
  const [paidPacks, setPaidPacks] = useState(1);
  const needsCard = target.kind === 'application' && preview !== null && preview.card === null;
  const cardForm = useCardForm(step === 'review' && needsCard, publishableKey);
  const { container: cardContainer, save: saveCard } = cardForm;

  // montat câte unul pe țintă (key în părinte): starea pornește de la zero la fiecare deschidere
  useEffect(() => {
    let cancelled = false;
    void previewBuy(
      target.kind === 'addon'
        ? { kind: 'addon', addonId: target.addonId, packs: 1 }
        : { kind: 'application', applicationId: target.applicationId },
    ).then((p) => {
      if (cancelled) return;
      if (!p.ok) {
        if (p.reason === 'error' || p.reason === 'forbidden') {
          setError({ message: t('sendFailed') });
          setStep('error');
        } else {
          onRefused(p.reason);
        }
        return;
      }
      setPreview(p);
      setStep('review');
    });
    return () => {
      cancelled = true;
    };
    // onRefused / t: stabile pentru același target
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  // prețul se citește întâi pe server; până atunci dialogul nu apare
  if (step === 'loading') return null;

  async function settle(result: Awaited<ReturnType<typeof buy>>) {
    if (!result.ok) {
      if (result.reason === 'error' || result.reason === 'forbidden') {
        setError({ message: t('sendFailed') });
        setStep('error');
      } else {
        onRefused(result.reason);
      }
      return;
    }
    let status = result;
    if (status.status === 'requires_action' && status.clientSecret && publishableKey) {
      const auth = await completeThreeDSecure(publishableKey, status.clientSecret);
      if ('error' in auth) {
        setError({ message: auth.error });
        setStep('error');
        return;
      }
      const after = await confirmBuy(status.purchaseId);
      if (!after.ok) {
        setError({ message: t('sendFailed') });
        setStep('error');
        return;
      }
      status = after;
    }
    if (status.status === 'failed' || status.status === 'canceled') {
      setError({ message: status.failure?.message ?? undefined });
      setStep('error');
      return;
    }
    if (status.status === 'processing' || status.status === 'requires_action') {
      setProcessingHint(t('paymentProcessing'));
    }
    setStep('success');
    router.refresh();
  }

  async function payNow(packs: number) {
    setStep('processing');
    setPaidPacks(packs);
    if (needsCard && !(await saveCard())) {
      setError({ message: t('cardError') });
      setStep('error');
      return;
    }
    await settle(
      await buy(
        target.kind === 'addon'
          ? { kind: 'addon', addonId: target.addonId, packs }
          : { kind: 'application', applicationId: target.applicationId },
      ),
    );
  }

  const now = new Date();
  const savedCard: PaymentCardData | null = card
    ? {
        brand: card.brand,
        last4: card.last4,
        expiry: `${String(card.expMonth).padStart(2, '0')}/${String(card.expYear).slice(-2)}`,
      }
    : null;
  const cardExpiring =
    !!card && card.expYear === now.getFullYear() && card.expMonth === now.getMonth() + 1;

  const setupMinor = preview?.setupMinor ?? 0;
  const recurring = preview?.recurringMinor ?? null;
  const prorate =
    preview && recurring !== null && preview.until
      ? {
          today: (preview.amountDueMinor - setupMinor) / 100,
          until: days.long(preview.until),
          monthly: recurring / 100,
        }
      : undefined;
  const usage: PayUsage | undefined =
    target.kind === 'addon' && target.usage
      ? {
          label: target.usage.label,
          used: target.usage.used,
          limitBefore: target.usage.limit,
          limitAfter: target.usage.limit + target.usage.perPack * paidPacks,
          unit: target.usage.unit,
        }
      : undefined;

  const state = step;
  const appLabels =
    target.kind === 'application' ? { ...labels, paySuccessHintPending: app('active') } : labels;
  const finalLabels = processingHint
    ? { ...appLabels, paySuccess: pay('processing'), paySuccessHintPending: processingHint }
    : appLabels;

  return (
    <DialogTrigger isOpen onOpenChange={(o) => !o && onClose()}>
      <AddonPurchase
        inline={false}
        sheet={phone}
        addon={{
          name: target.name,
          description: target.description,
          price: target.priceMinor / 100,
          icon: target.icon,
          max: target.kind === 'application' ? 1 : 20,
          includes: target.kind === 'application' ? target.includes : undefined,
        }}
        state={state}
        quantity={quantity}
        onQuantityChange={setQuantity}
        card={needsCard ? null : savedCard}
        cardSlot={
          needsCard ? (
            <StripeSlot labels={payLabels}>
              <div ref={cardContainer} />
            </StripeSlot>
          ) : undefined
        }
        cardExpiring={!needsCard && cardExpiring}
        onChangeCard={onUseOtherCard}
        error={error}
        usage={usage}
        invoice={{ pending: true }}
        prorate={prorate}
        setup={setupMinor > 0 ? setupMinor / 100 : undefined}
        onPay={(q) => void payNow(q)}
        onRetry={() => (preview ? setStep('review') : onClose())}
        onUseOtherCard={onUseOtherCard}
        onDone={onClose}
        onClose={onClose}
        currency={money.symbol}
        format={money.major}
        locale={locale}
        labels={finalLabels}
        usageLabels={usageLabels}
      />
    </DialogTrigger>
  );
}
