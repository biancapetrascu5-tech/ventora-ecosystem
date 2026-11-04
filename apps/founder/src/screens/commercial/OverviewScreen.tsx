'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { APPS, Toast, type AppName } from '@ventora/ui';
import {
  OverviewView,
  commercialStyles as cs,
  count,
  greetingPart,
  useDates,
  useIsPhone,
  useTimeZone,
  type OverviewViewData,
} from '@ventora/screens';
import type { OverviewData } from '@/server/commercial-actions';
import { FounderShell } from '../shell/FounderShell';
import { ExceptionFlow, type ExceptionTarget } from './ExceptionFlow';
import { useQuotaText } from './labels';

/* „Prezentare” (FounderOverview, S118): salutul după ora zilei și data de azi, în română;
   cifrele (cu venitul lunar recurent și plățile eșuate), „Au nevoie de tine” (cererile noi, plățile
   eșuate, facturile neemise, excepțiile care expiră în 7 zile, cu „Prelungește”, disputele Stripe
   și ExceptionFlow din Lotul 3.4), afacerile aproape de limite și cele create recent. Fără afaceri
   — „prima zi”; fără date — eroarea cu „Încearcă din nou”. */

const DAY_MS = 86_400_000;

export function OverviewScreen({
  user,
  overview,
  requestsBadge,
}: {
  user: { name: string };
  overview: OverviewData | null;
  requestsBadge: number;
}) {
  const router = useRouter();
  const t = useTranslations('founder.overview');
  const ex = useTranslations('founder.business.exceptions');
  const ui = useTranslations('ui');
  const q = useQuotaText();
  const dates = useDates();
  const timeZone = useTimeZone();
  const phone = useIsPhone();
  const [target, setTarget] = useState<
    (ExceptionTarget & { org: OverviewData['expiring'][number] }) | null
  >(null);
  const [toast, setToast] = useState<string | null>(null);

  const now = overview ? new Date(overview.generatedAt) : new Date();
  const zone = timeZone ? { timeZone } : {};
  const fmt = (o: Intl.DateTimeFormatOptions, d: Date) =>
    new Intl.DateTimeFormat('ro-RO', { ...o, ...zone }).format(d);
  const hour = Number(fmt({ hour: 'numeric', hourCycle: 'h23' }, now));
  const today = fmt({ weekday: 'long', day: 'numeric', month: 'long' }, now).replace(',', '');
  const firstName = user.name.split(' ')[0] ?? user.name;
  const greeting = t(`greeting.${greetingPart(hour)}`, { name: firstName });
  const lead = t('lead', { date: today.charAt(0).toLocaleUpperCase('ro') + today.slice(1) });
  const inDays = new Intl.RelativeTimeFormat('ro', { numeric: 'auto' });
  const appName = (k: string) => APPS[k as AppName]?.name ?? k;
  // începutul zilei în fusul Founder-ului (pentru „ieri”, „acum 2 zile”)
  const startOfDay = (d: Date) => {
    const [y, m, day] = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }, d)
      .split('.')
      .map(Number);
    return Date.UTC(y!, m! - 1, day!);
  };

  const data: OverviewViewData | undefined = overview
    ? {
        stats: {
          active: overview.businesses.active,
          newThisMonth: overview.businesses.newThisMonth,
          month: fmt({ month: 'long' }, now),
          mrr: overview.mrr,
          trial: overview.trials.total,
          trialEnding: overview.trials.endingIn3Days,
        },
        requests: {
          n: overview.requests.length,
          meta: overview.requests
            .slice(0, 2)
            .map(
              (r) => `${r.business} · ${r.targetType === 'application' ? appName(r.item) : r.item}`,
            )
            .join('; '),
        },
        exceptions: overview.expiring.map((x) => ({
          id: x.id,
          date: fmt({ day: 'numeric', month: 'long' }, new Date(x.expiresAt)),
          business: x.business,
          what: x.quotaKey
            ? `${q.label(x.quotaKey)}: ${x.limit === null ? ex('unlimited') : count(x.limit)}`
            : '',
          who: x.by,
          when: inDays.format(
            Math.max(0, Math.ceil((new Date(x.expiresAt).getTime() - now.getTime()) / DAY_MS)),
            'day',
          ),
        })),
        limits: overview.limits.map((l) => ({
          id: `${l.organizationId}:${l.key}`,
          business: l.business,
          limit: q.label(l.key),
          used: l.used,
          max: l.limit,
        })),
        recent: overview.recent.map((b) => ({
          id: b.id,
          name: b.name,
          what: [b.planName, b.applications.map(appName).join(', ')].filter(Boolean).join(' · '),
          created: dates.day(new Date(b.createdAt)),
          status: b.status,
        })),
        // Lotul 3.6: plățile de încasat, disputele Stripe, facturile neemise
        failedPayments: overview.failedPayments.map((f) => ({
          id: f.id,
          organizationId: f.organizationId,
          business: f.business,
          amountMinor: f.amountMinor,
          currency: f.currency,
          next: f.nextAttemptAt
            ? `${fmt({ day: 'numeric', month: 'long' }, new Date(f.nextAttemptAt))}, ${dates.time(new Date(f.nextAttemptAt))}`
            : null,
          when: inDays.format(
            -Math.max(0, Math.floor((startOfDay(now) - startOfDay(new Date(f.failedAt))) / DAY_MS)),
            'day',
          ),
        })),
        disputes: overview.disputes.map((d) => ({
          id: d.id,
          business: d.business,
          amountMinor: d.amountMinor,
          currency: d.currency,
          due: d.evidenceDueBy
            ? fmt({ day: 'numeric', month: 'long' }, new Date(d.evidenceDueBy))
            : null,
          url: d.url,
        })),
        invoices: overview.invoices,
      }
    : undefined;

  return (
    <FounderShell active="azi" title={t('title')} user={user} requestsBadge={requestsBadge}>
      <OverviewView
        state={!overview ? 'error' : overview.businesses.total === 0 ? 'first' : 'ready'}
        greeting={greeting}
        lead={lead}
        updated={t('updated', { time: dates.time(now) })}
        data={data}
        onOpenRequests={() => router.push('/requests')}
        onExtend={(id) => {
          const x = overview!.expiring.find((e) => e.id === id)!;
          setTarget({
            kind: 'extend',
            overrideId: x.id,
            quotaKey: x.quotaKey ?? '',
            limit: x.limit,
            expiresAt: x.expiresAt,
            org: x,
          });
        }}
        onOpenUsage={() => router.push('/usage')}
        onOpenBusiness={(id) => router.push(`/businesses/${id}`)}
        onOpenStripe={(url) => window.open(url, '_blank', 'noopener,noreferrer')}
        onAllBusinesses={() => router.push('/businesses')}
        onNewBusiness={() => router.push('/businesses/new')}
        onRetry={() => router.refresh()}
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
