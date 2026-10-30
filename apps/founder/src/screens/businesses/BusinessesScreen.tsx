'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BusinessesView, useDates, type BusinessListRow } from '@ventora/screens';
import type { BusinessData } from '@/server/business-actions';
import { FounderShell } from '../shell/FounderShell';
import { businessStatus } from './status';

/* FounderBusinesses (Lot 2.8): toate afacerile, căutare după nume, proprietar sau adresa
   invitației, 20 pe pagină. Ordinea: întâi ce cere atenție (aici: suspendatele), apoi alfabetic
   (P16, ca în design). */

const PAGE_SIZE = 20;

export function BusinessesScreen({
  user,
  businesses,
}: {
  user: { name: string };
  businesses: BusinessData[];
}) {
  const router = useRouter();
  const t = useTranslations('founder.businesses');
  const dates = useDates();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const rows: BusinessListRow[] = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('ro');
    return businesses
      .filter((b) =>
        !needle
          ? true
          : [b.name, b.owner?.name, b.owner?.email, b.ownerInvitation?.email]
              .filter(Boolean)
              .some((v) => v!.toLocaleLowerCase('ro').includes(needle)),
      )
      .sort(
        (a, b) =>
          (a.status === 'suspended' ? 0 : 1) - (b.status === 'suspended' ? 0 : 1) ||
          a.name.localeCompare(b.name, 'ro'),
      )
      .map((b) => ({
        id: b.id,
        name: b.name,
        sub: b.owner?.name ?? b.ownerInvitation?.email ?? '',
        since: dates.monthYear(new Date(b.createdAt)),
        status: businessStatus(b.status, t),
      }));
  }, [businesses, q, dates, t]);

  const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return (
    <FounderShell active="afaceri" title={t('title')} user={user}>
      <BusinessesView
        rows={visible}
        search={q}
        onSearchChange={(v) => {
          setQ(v);
          setPage(1);
        }}
        onNew={() => router.push('/businesses/new')}
        onOpen={(r) => router.push(`/businesses/${r.id}`)}
        pagination={
          rows.length > PAGE_SIZE
            ? { page, pageSize: PAGE_SIZE, total: rows.length, onPageChange: setPage }
            : undefined
        }
      />
    </FounderShell>
  );
}
