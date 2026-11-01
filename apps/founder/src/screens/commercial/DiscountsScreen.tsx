'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { DialogTrigger, Toast } from '@ventora/ui';
import {
  DiscountsPageView,
  EndDiscountDialog,
  commercialStyles as cs,
  money,
  useIsPhone,
  type ForeverDiscountRow,
} from '@ventora/screens';
import { finishDiscount, type ActiveDiscountData } from '@/server/commercial-actions';
import { FounderShell } from '../shell/FounderShell';

/* „Reduceri” (Lotul 3.4, S113): toate reducerile permanente din toate afacerile; „Toate active”
   arată și reducerile temporare. „Încheie reducerea” cu confirmare; auditată pe Founder. */

export function useDiscountText() {
  const t = useTranslations('founder.discounts');
  return {
    value: (d: Pick<ActiveDiscountData, 'kind' | 'percentOff' | 'amountOffMinor' | 'currency'>) =>
      d.kind === 'percent' ? `${d.percentOff}%` : money(d.amountOffMinor ?? 0, d.currency),
    what: (d: Pick<ActiveDiscountData, 'scope' | 'lineName'>) =>
      d.scope === 'subscription'
        ? t('what.plan')
        : d.scope === 'application'
          ? t('what.application', { name: d.lineName ?? '' })
          : t('what.addon', { name: d.lineName ?? '' }),
  };
}

const fullDay = (iso: string) =>
  new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(iso),
  );

export function DiscountsScreen({
  user,
  discounts,
  requestsBadge,
}: {
  user: { name: string };
  discounts: ActiveDiscountData[];
  requestsBadge: number;
}) {
  const router = useRouter();
  const t = useTranslations('founder.discounts');
  const ui = useTranslations('ui');
  const text = useDiscountText();
  const phone = useIsPhone();
  const [filter, setFilter] = useState<'permanent' | 'active'>('permanent');
  const [ending, setEnding] = useState<ActiveDiscountData | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const permanent = discounts.filter((d) => d.duration === 'forever');
  const rows: ForeverDiscountRow[] = (filter === 'permanent' ? permanent : discounts).map((d) => ({
    id: d.id,
    business: d.business,
    what: text.what(d),
    value: text.value(d),
    since: fullDay(d.createdAt),
    reason: d.reason,
    by: d.by,
  }));
  const find = (row: ForeverDiscountRow) => discounts.find((d) => d.id === row.id)!;

  async function end() {
    if (!ending) return;
    setPending(true);
    setFailed(false);
    const res = await finishDiscount(ending.organizationId, ending.id);
    setPending(false);
    if (!res.ok) {
      setFailed(true);
      return;
    }
    setEnding(null);
    setToast(t('endedNoDate'));
    router.refresh();
  }

  return (
    <FounderShell active="reduceri" title={t('title')} user={user} requestsBadge={requestsBadge}>
      <DiscountsPageView
        rows={rows}
        filter={filter}
        onFilterChange={setFilter}
        permanentCount={permanent.length}
        onOpen={(row) => router.push(`/businesses/${find(row).organizationId}?tab=billing`)}
        onEnd={(row) => {
          setFailed(false);
          setEnding(find(row));
        }}
      />
      <DialogTrigger isOpen={!!ending} onOpenChange={(o) => !o && setEnding(null)}>
        {ending ? (
          <EndDiscountDialog
            title={t('endDialog.title', { value: text.value(ending), business: ending.business })}
            body={t('endDialog.bodyNoDate')}
            pending={pending}
            failed={failed}
            mob={phone}
            onCancel={() => setEnding(null)}
            onConfirm={() => void end()}
          />
        ) : (
          <></>
        )}
      </DialogTrigger>
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
    </FounderShell>
  );
}
