'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Toast } from '@ventora/ui';
import {
  OverviewView,
  commercialStyles as cs,
  count,
  useDates,
  useIsPhone,
} from '@ventora/screens';
import type { ExpiringData } from '@/server/commercial-actions';
import { FounderShell } from '../shell/FounderShell';
import { ExceptionFlow, type ExceptionTarget } from './ExceptionFlow';
import { useQuotaText } from './labels';

/* „Prezentare” (Lotul 3.4, ARCHITECTURE §8.5): excepțiile care expiră în 7 zile, cu
   „Prelungește” (FounderStates: „Excepție care expiră în 7 zile (Prezentare)”). Pagina nu are
   încă design propriu: e antetul și notele din FounderStates (raportul 3.4, DE VALIDAT). */

export function OverviewScreen({
  user,
  expiring,
  requestsBadge,
}: {
  user: { name: string };
  expiring: ExpiringData[];
  requestsBadge: number;
}) {
  const router = useRouter();
  const t = useTranslations('founder.overview');
  const ex = useTranslations('founder.business.exceptions');
  const ui = useTranslations('ui');
  const q = useQuotaText();
  const dates = useDates();
  const phone = useIsPhone();
  const [target, setTarget] = useState<(ExceptionTarget & { org: ExpiringData }) | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const items = expiring.map((x) => ({
    id: x.id,
    title: t('expiring', { date: dates.day(new Date(x.expiresAt)) }),
    body: [
      x.business,
      x.quotaKey
        ? `${q.label(x.quotaKey)}: ${x.limit === null ? ex('unlimited') : count(x.limit)}`
        : '',
    ]
      .filter(Boolean)
      .join(' · '),
  }));

  return (
    <FounderShell active="azi" title={t('title')} user={user} requestsBadge={requestsBadge}>
      <OverviewView
        expiring={items}
        onExtend={(id) => {
          const x = expiring.find((e) => e.id === id)!;
          setTarget({
            kind: 'extend',
            overrideId: x.id,
            quotaKey: x.quotaKey ?? '',
            limit: x.limit,
            expiresAt: x.expiresAt,
            org: x,
          });
        }}
      />
      <ExceptionFlow
        organizationId={target?.org.organizationId ?? ''}
        business={target?.org.business ?? ''}
        target={target}
        onClose={() => setTarget(null)}
        onDone={(text) => {
          setTarget(null);
          setToast(text);
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
    </FounderShell>
  );
}
