'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Stat, StatGroup, type DataTableColumn } from '@ventora/ui';
import { BusinessesView, count, useDates, type BusinessListRow } from '@ventora/screens';
import type { BusinessData } from '@/server/business-actions';
import type { BusinessUsageData } from '@/server/commercial-actions';
import { FounderShell } from '../shell/FounderShell';
import { useQuotaText } from '../commercial/labels';
import { STATUS_RANK, businessStatus } from './status';

/* FounderBusinesses (Lot 2.8; partea comercială în Lotul 3.4): toate afacerile, căutare după
   nume, proprietar sau adresa invitației, 20 pe pagină. Ordinea: întâi ce cere atenție, apoi
   alfabetic (P16). Sus, doar cifrele care au date reale: afacerile active (cu cele noi din luna
   aceasta) și cele în perioadă de probă; „Venit lunar recurent” și „Plăți eșuate” vin cu plățile
   (Lotul 3.5) — nu se afișează valori inventate. Coloana „Abonament” (bundle-ul, D3-24) vine cu
   designul S117. */

const PAGE_SIZE = 20;
const WEEK_MS = 7 * 86_400_000;

type Row = BusinessListRow & { usage: string };

export function BusinessesScreen({
  user,
  businesses,
  usage,
  trials,
  requestsBadge,
}: {
  user: { name: string };
  businesses: BusinessData[];
  usage: BusinessUsageData[];
  trials: { organizationId: string; trialEndsAt: string | null }[];
  requestsBadge: number;
}) {
  const router = useRouter();
  const t = useTranslations('founder.businesses');
  const quota = useQuotaText();
  const dates = useDates();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const topOf = useMemo(() => new Map(usage.map((u) => [u.organizationId, u.top])), [usage]);
  const trialOf = useMemo(
    () => new Map(trials.map((x) => [x.organizationId, x.trialEndsAt])),
    [trials],
  );

  const rows: Row[] = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('ro');
    return businesses
      .filter((b) =>
        !needle
          ? true
          : [b.name, b.owner?.name, b.owner?.email, b.ownerInvitation?.email]
              .filter(Boolean)
              .some((v) => v!.toLocaleLowerCase('ro').includes(needle)),
      )
      .map((b) => {
        const top = topOf.get(b.id) ?? null;
        const trial = trialOf.get(b.id) ?? null;
        return {
          id: b.id,
          name: b.name,
          sub: b.owner?.name ?? b.ownerInvitation?.email ?? '',
          since: dates.monthYear(new Date(b.createdAt)),
          status: businessStatus(b.status, t, { topPct: top?.pct, trialUntil: trial }, (d) =>
            t('status.trial', { date: dates.day(new Date(d)) }),
          ),
          usage: top ? t('usageValue', { resource: quota.label(top.key), pct: top.pct }) : '',
        };
      })
      .sort(
        (a, b) =>
          STATUS_RANK[a.status.tone] - STATUS_RANK[b.status.tone] ||
          a.name.localeCompare(b.name, 'ro'),
      );
  }, [businesses, q, dates, t, topOf, trialOf, quota]);

  const columns: DataTableColumn<Row>[] = [
    {
      key: 'usage',
      header: t('colUsage'),
      optional: true,
      render: (r) => <span className="v-num body-small">{r.usage}</span>,
    },
  ];

  const now = new Date();
  const thisMonth = (d: string) => d.slice(0, 7) === now.toISOString().slice(0, 7);
  const active = businesses.filter((b) => b.status === 'active');
  const newThisMonth = active.filter((b) => thisMonth(b.createdAt)).length;
  const inTrial = trials.filter((x) => x.trialEndsAt);
  const endingThisWeek = inTrial.filter(
    (x) => new Date(x.trialEndsAt!).getTime() - now.getTime() <= WEEK_MS,
  ).length;
  const monthName = new Intl.DateTimeFormat('ro-RO', { month: 'long' }).format(now);

  const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return (
    <FounderShell active="afaceri" title={t('title')} user={user} requestsBadge={requestsBadge}>
      <BusinessesView
        rows={visible}
        columns={columns}
        stats={
          <StatGroup>
            <Stat
              label={t('statActive')}
              value={count(active.length)}
              delta={
                newThisMonth
                  ? {
                      value: `+${newThisMonth}`,
                      period: t('statActiveDelta', { month: monthName }),
                    }
                  : undefined
              }
            />
            <Stat
              label={t('statTrial')}
              value={count(inTrial.length)}
              hint={endingThisWeek ? t('statTrialHint', { count: endingThisWeek }) : undefined}
            />
          </StatGroup>
        }
        search={q}
        onSearchChange={(v) => {
          setQ(v);
          setPage(1);
        }}
        onNew={() => router.push('/businesses/new')}
        onOpen={(r) => router.push(`/businesses/${r.id}`)}
        rowActions={(r) => [
          {
            label: t('open'),
            icon: 'external-link',
            onClick: () => router.push(`/businesses/${r.id}`),
          },
          {
            label: t('addException'),
            icon: 'sliders-horizontal',
            onClick: () => router.push(`/businesses/${r.id}?exception=1`),
          },
        ]}
        pagination={
          rows.length > PAGE_SIZE
            ? { page, pageSize: PAGE_SIZE, total: rows.length, onPageChange: setPage }
            : undefined
        }
      />
    </FounderShell>
  );
}
