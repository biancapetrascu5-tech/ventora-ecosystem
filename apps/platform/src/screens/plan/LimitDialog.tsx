'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DialogTrigger, UpgradeDialog, type UpgradeOption } from '@ventora/ui';
import { useIsPhone } from '@ventora/screens';
import { useUpgradeLabels, useUsageMeterLabels } from '../labels';

/* Lotul 3.7 — UpgradeDialog la limita atinsă (varianta pachet, FAZA-3 3.7), deschis doar de
   persoană („Cere alt abonament” din UsageMeter), niciodată singur. Variantele: pachetele în plus
   ale acelei limite (owner-ul continuă în AddonPurchase, cu plata) și „Cere alt abonament”
   (D3-9: o cerere, din catalogul de bundle-uri). Adminul și membrul văd variantele, cine decide
   și „Recomandă” (anunță owner-ul). Fără variante de probă: perioada de probă vine în 3.8. */

export type LimitPack = { id: string; title: string; price: string; includes?: string[] };

export function LimitDialog({
  open,
  usage,
  packs,
  owner,
  ownerName,
  onBuy,
  onPlan,
  onRecommend,
  onClose,
  title,
  description,
  plan,
  inline,
  sheet,
}: {
  /** With `inline`: the phone's bottom sheet. */
  sheet?: boolean;
  open: boolean;
  /** The plan the request suggests (title, price, what it adds); by default „Cere alt abonament”. */
  plan?: { title: string; price?: string; includes?: string[] };
  /** In a frame (gallery, preview.html .modal-demo), without the modal overlay. */
  inline?: boolean;
  /** An application's own wording (EasyBook · BookingLimit); by default „Ai atins limita”. */
  title?: string;
  description?: string;
  usage: { label: string; used: number; limit: number; unit?: string } | null;
  packs: LimitPack[];
  owner: boolean;
  ownerName: string | null;
  onBuy: (packId: string) => void;
  onPlan: () => void;
  /** Adminul / membrul: anunță owner-ul; `true` dacă s-a trimis. */
  onRecommend: () => Promise<boolean>;
  onClose: () => void;
}) {
  const pay = useTranslations('pay');
  const meter = useTranslations('usageMeter');
  const app = useTranslations('hub.app');
  const labels = useUpgradeLabels();
  const usageLabels = useUsageMeterLabels();
  const phone = useIsPhone();
  const PLAN = 'plan';
  const options: UpgradeOption[] = [
    ...packs.map((p) => ({
      id: p.id,
      kind: 'pack' as const,
      title: p.title,
      price: p.price,
      includes: p.includes,
    })),
    { id: PLAN, kind: 'plan' as const, title: pay('upgrade'), ...plan },
  ];
  const [value, setValue] = useState(options[0]?.id ?? PLAN);
  const [recommended, setRecommended] = useState(false);

  const dialog = (
    <UpgradeDialog
      inline={inline ?? false}
      sheet={inline ? sheet : phone}
      title={title ?? meter('atLimit')}
      description={description}
      usage={usage ?? undefined}
      options={options}
      value={value}
      onChange={setValue}
      role={owner ? 'owner' : 'member'}
      decider={ownerName ?? undefined}
      recommended={recommended}
      onRecommend={async () => setRecommended(await onRecommend())}
      onContinue={(id) => (id === PLAN ? onPlan() : onBuy(id))}
      onClose={onClose}
      labels={{ ...labels, decides: (who) => app('decider', { who }) }}
      usageLabels={usageLabels}
    />
  );
  if (inline) return dialog;
  return (
    <DialogTrigger isOpen={open} onOpenChange={(o) => !o && onClose()}>
      {dialog}
    </DialogTrigger>
  );
}
