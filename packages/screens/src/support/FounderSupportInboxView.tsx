'use client';

import { useTranslations } from 'next-intl';
import {
  Badge,
  Button,
  Combobox,
  DataTable,
  EmptyState,
  Input,
  PageHeader,
  SegmentedControl,
  Select,
  StatusPill,
  cn,
  type DataTableAction,
  type DataTableColumn,
} from '@ventora/ui';
import { useTableLabels } from '../founder/BusinessesView';
import s from './support.module.css';

/* FounderSupportInbox (S116, Lot 4.6, D4-14 b, doar română): „Solicitări de suport” — „Deschise ·
   {n}” / „În lucru · {n}” / „Închise”, aplicația, afacerea, căutarea după subiect sau referință.
   „Deschisă” e peach: o așteaptă pe echipă. S-6: lângă filtre, câte au trecut de termenul de
   răspuns (D4-15 = b), iar rândul lor are „Peste termen”. */

export type FounderGroup = 'open' | 'progress' | 'closed';

export const FOUNDER_PILL: Record<
  FounderGroup,
  ['attention' | 'neutral' | 'done', 'circle-dot' | 'clock' | 'check']
> = {
  open: ['attention', 'circle-dot'],
  progress: ['neutral', 'clock'],
  closed: ['done', 'check'],
};

export type FounderInboxRow = {
  id: string;
  ref: string;
  subject: string;
  blocking: boolean;
  overdue?: boolean;
  business: string;
  app: string;
  /** „Bianca Petrașcu, acum 12 min” / „Echipa, ieri, 11:40” */
  last: string;
  status: FounderGroup;
};

export function FounderSupportInboxView({
  mob,
  rows,
  group,
  counts,
  apps,
  app,
  businesses,
  business,
  search,
  onGroup,
  onApp,
  onBusiness,
  onSearch,
  onClear,
  onOpen,
  onOpenBusiness,
  onClose,
}: {
  mob?: boolean;
  /** Already filtered. */
  rows: FounderInboxRow[];
  group: FounderGroup;
  counts: { open: number; progress: number; overdue: number };
  apps: { value: string; label: string }[];
  app: string | null;
  businesses: { value: string; label: string }[];
  business: string | null;
  search: string;
  onGroup: (g: FounderGroup) => void;
  onApp: (v: string | null) => void;
  onBusiness: (v: string | null) => void;
  onSearch: (v: string) => void;
  onClear: () => void;
  onOpen: (row: FounderInboxRow) => void;
  onOpenBusiness: (row: FounderInboxRow) => void;
  onClose: (row: FounderInboxRow) => void;
}) {
  const t = useTranslations('founder.inbox');
  const labels = useTableLabels();
  const filtered = !!app || !!business || !!search.trim();
  const columns: DataTableColumn<FounderInboxRow>[] = [
    {
      key: 'subject',
      header: t('col.subject'),
      primary: true,
      render: (r) => (
        <span className={s.subject}>
          <span className={s.subjectLine}>
            {r.subject}
            {r.blocking ? <Badge tone="attention">{t('blocking')}</Badge> : null}
            {r.overdue ? (
              <StatusPill tone="danger" size="sm">
                {t('overdueRow')}
              </StatusPill>
            ) : null}
          </span>
          <span className="caption muted">{r.ref}</span>
        </span>
      ),
    },
    { key: 'business', header: t('col.business'), secondary: true },
    { key: 'app', header: t('col.app'), optional: true },
    { key: 'last', header: t('col.last'), optional: true, muted: true },
    {
      key: 'status',
      header: t('col.status'),
      trailing: true,
      render: (r) => (
        <StatusPill tone={FOUNDER_PILL[r.status][0]} icon={FOUNDER_PILL[r.status][1]}>
          {t(`status.${r.status}`)}
        </StatusPill>
      ),
    },
  ];
  const actions = (r: FounderInboxRow): DataTableAction[] => [
    { label: t('open'), icon: 'external-link', onClick: () => onOpen(r) },
    { label: t('side.openBiz'), icon: 'building-2', onClick: () => onOpenBusiness(r) },
    ...(r.status === 'closed'
      ? []
      : [
          { separator: true } as DataTableAction,
          { label: t('side.close'), icon: 'check', onClick: () => onClose(r) } as DataTableAction,
        ]),
  ];
  const empty = filtered ? (
    <EmptyState
      icon="list-filter"
      title={t('emptyFilter.title')}
      description={t('emptyFilter.body')}
      actions={
        <Button variant="secondary" onPress={onClear}>
          {t('emptyFilter.clear')}
        </Button>
      }
    />
  ) : (
    <EmptyState icon="inbox" title={t('emptyOpen.title')} description={t('emptyOpen.body')} />
  );
  return (
    <>
      <PageHeader title={t('title')} description={t('lead')} />
      <div className={mob ? s.bodyMob : s.listBody}>
        <div className={cn(s.filters, mob && s.filtersMob)}>
          <SegmentedControl
            aria-label={t('filterLabel')}
            value={group}
            onChange={(v) => onGroup(v as FounderGroup)}
            options={[
              { value: 'open', label: `${t('filter.open')} · ${counts.open}` },
              { value: 'progress', label: `${t('filter.progress')} · ${counts.progress}` },
              { value: 'closed', label: t('filter.closed') },
            ]}
          />
          {counts.overdue ? (
            <StatusPill tone="danger" size="sm">
              {t('overdue', { n: counts.overdue })}
            </StatusPill>
          ) : null}
          <div className={mob ? s.fFull : s.fApp}>
            <Select
              size="sm"
              aria-label={t('filter.app')}
              value={app ?? 'all'}
              onChange={(v) => onApp(v === 'all' ? null : v)}
              options={[{ value: 'all', label: t('filter.appAll') }, ...apps]}
            />
          </div>
          <div className={mob ? s.fFull : s.fBiz}>
            <Combobox
              size="sm"
              aria-label={t('filter.business')}
              value={business}
              placeholder={t('filter.businessAll')}
              options={businesses}
              onChange={(v) => onBusiness((v as string | null) ?? null)}
            />
          </div>
          {mob ? null : (
            <div className={s.fSearch}>
              <Input
                size="sm"
                icon="search"
                placeholder={t('search')}
                aria-label={t('search')}
                value={search}
                onChange={(e) => onSearch(e.target.value)}
              />
            </div>
          )}
        </div>
        {rows.length ? (
          <DataTable
            caption={t('title')}
            rows={rows}
            columns={columns}
            rowActions={actions}
            onRowClick={onOpen}
            labels={labels}
            locale="ro"
          />
        ) : (
          empty
        )}
      </div>
    </>
  );
}
