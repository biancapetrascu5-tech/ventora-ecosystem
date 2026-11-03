'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Dialog, DialogTrigger, Notice, StripeSlot } from '@ventora/ui';
import { usePaymentLabels } from '../labels';
import { useCardForm } from './useCardForm';

/* Lotul 3.7 — „Adaugă card” / „Schimbă cardul” din „Cardul pentru cumpărături” (HubAdminPlan).
   Designul nu are un dialog separat pentru card: folosește StripeSlot din AddonPurchase, cu
   titlul secțiunii; „Salvează cardul” e text propriu (DE VALIDAT, raportul 3.7). */

export function CardDialog({
  open,
  publishableKey,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  publishableKey: string | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (ok: boolean) => void;
}) {
  const t = useTranslations('hub.plan');
  const pay = useTranslations('pay');
  const labels = usePaymentLabels();
  const { container, save: saveCard, failed } = useCardForm(open, publishableKey);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const ok = await saveCard();
    setBusy(false);
    onSaved(ok);
    if (ok) onOpenChange(false);
  }

  return (
    <DialogTrigger isOpen={open} onOpenChange={onOpenChange}>
      <Dialog
        title={t('cardFor')}
        closeLabel={pay('close')}
        footer={
          <>
            <Button variant="quiet" isDisabled={busy} onPress={() => onOpenChange(false)}>
              {pay('cancel')}
            </Button>
            <Button
              variant="primary"
              icon="lock"
              isPending={busy}
              isDisabled={failed}
              onPress={() => void save()}
            >
              {t('saveCard')}
            </Button>
          </>
        }
      >
        {failed ? (
          <Notice tone="neutral" icon="credit-card">
            {t('cardUnavailable')}
          </Notice>
        ) : (
          <StripeSlot labels={labels}>
            <div ref={container} />
          </StripeSlot>
        )}
      </Dialog>
    </DialogTrigger>
  );
}
