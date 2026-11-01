'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Stat, StatGroup } from '@ventora/ui';
import { TooEarly, UsageView, count, useDates, type UsageRow } from '@ventora/screens';
import type { BusinessUsageData, UsageTotalsData } from '@/server/commercial-actions';
import { FounderShell } from '../shell/FounderShell';
import { dayDate, useQuotaText } from './labels';

/* FounderUsage (Lotul 3.4): afacerile peste 80% la o limită (USAGE_ATTENTION_PCT), cu data
   estimată a atingerii limitei din ritmul perioadei („Prea devreme” sub 7 zile de date), consumul
   lunii peste toate afacerile și pe zi (SMS-uri). Doar cifre reale: „Pachete în plus vândute”
   numără cumpărările (Lotul 3.5 le înregistrează), fără suma încasată. */

const ATTENTION = 80;

function delta(cur: number, prev: number, period: string) {
  if (prev <= 0) return undefined;
  const pct = Math.round(((cur - prev) / prev) * 100);
  return { value: `${pct > 0 ? '+' : ''}${pct}%`, period };
}

export function UsageScreen({
  user,
  usage,
  totals,
  requestsBadge,
}: {
  user: { name: string };
  usage: BusinessUsageData[];
  totals: UsageTotalsData;
  requestsBadge: number;
}) {
  const router = useRouter();
  const t = useTranslations('founder.usage');
  const q = useQuotaText();
  const dates = useDates();
  const month = (d: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('ro-RO', opts).format(dayDate(d));
  const monthName = month(totals.from, { month: 'long' });
  const prevMonthName = month(
    `${totals.from.slice(0, 4)}-${String(((Number(totals.from.slice(5, 7)) + 10) % 12) + 1).padStart(2, '0')}-01`,
    { month: 'long' },
  );

  const hot = usage.flatMap((b) =>
    b.quotas
      .filter((x) => x.limit !== null && x.limit > 0 && (x.used / x.limit) * 100 >= ATTENTION)
      .map((x) => ({ b, x, pct: Math.round((x.used / x.limit!) * 100) })),
  );
  hot.sort((a, z) => z.pct - a.pct || a.b.business.localeCompare(z.b.business, 'ro'));
  const rows: UsageRow[] = hot.map(({ b, x, pct }) => ({
    id: `${b.organizationId}:${x.key}`,
    business: b.business,
    resource: q.label(x.key),
    usage: t('of', { used: count(x.used), limit: count(x.limit!) }),
    estimate:
      x.estimate.state === 'reached' ? (
        t('reached')
      ) : x.estimate.state === 'too_early' ? (
        <TooEarly />
      ) : x.estimate.state === 'date' && x.estimate.date ? (
        dates.day(dayDate(x.estimate.date))
      ) : (
        ''
      ),
    status: pct >= 100 ? t('atLimit') : `${pct}%`,
  }));
  const businesses = new Set(hot.map((h) => h.b.organizationId));
  const reached = new Set(hot.filter((h) => h.pct >= 100).map((h) => h.b.organizationId));
  const byKey = new Map<string, Set<string>>();
  for (const h of hot) {
    byKey.set(h.x.key, (byKey.get(h.x.key) ?? new Set()).add(h.b.organizationId));
  }
  const total = (key: string) =>
    totals.totals.find((x) => x.key === key) ?? { amount: 0, previous: 0 };
  const sms = total('messaging.sms');
  const appts = total('booking.appointments');
  const vs = t('stat.vsPrevious', { month: prevMonthName });
  const orgOf = (row: UsageRow) => String(row.id).split(':')[0]!;

  return (
    <FounderShell active="consum" title={t('title')} user={user} requestsBadge={requestsBadge}>
      <UsageView
        lead={t('lead', { month: monthName })}
        stats={
          <StatGroup>
            <Stat
              label={t('stat.attention')}
              value={count(businesses.size)}
              tone={businesses.size ? 'attention' : undefined}
              hint={reached.size ? t('stat.attentionHint', { count: reached.size }) : undefined}
            />
            <Stat
              label={t('stat.sms')}
              value={count(sms.amount)}
              delta={delta(sms.amount, sms.previous, vs)}
            />
            <Stat
              label={t('stat.appointments')}
              value={count(appts.amount)}
              delta={delta(appts.amount, appts.previous, vs)}
            />
            <Stat label={t('stat.packs')} value={count(totals.addonsSold)} />
          </StatGroup>
        }
        byResource={[...byKey].map(([key, orgs]) => ({ label: q.label(key), value: orgs.size }))}
        daily={{
          title: t('daily'),
          description: t('dailyHelp', {
            month: monthName.charAt(0).toUpperCase() + monthName.slice(1),
          }),
          labels: totals.daily.map((d) => String(Number(d.day.slice(8, 10)))),
          values: totals.daily.map((d) => d.amount),
          nowIndex:
            totals.daily.length && totals.daily[totals.daily.length - 1]!.day === totals.to
              ? totals.daily.length - 1
              : undefined,
        }}
        rows={rows}
        onOpen={(r) => router.push(`/businesses/${orgOf(r)}`)}
        onException={(r) => router.push(`/businesses/${orgOf(r)}?exception=1`)}
      />
    </FounderShell>
  );
}
