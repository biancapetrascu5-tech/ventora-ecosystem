'use client';

import { useTranslations } from 'next-intl';
import {
  Button,
  DataTable,
  Input,
  PageHeader,
  SegmentedControl,
  Select,
  StatusPill,
  type DataTableAction,
  type DataTableColumn,
} from '@ventora/ui';
import type { ScreenMode } from '../services/BookingServicesView';
import { useTableLabels } from '../services/texts';
import { STATUS_LOOK, type DetailStatus } from '../detail/detail-format';
import { ListEmptyFiltered } from '../states/BookingStates';
import s from './list.module.css';

/* BookingList (B.6b) — the part the detail stands on (Decision 7, screen 3): the page header, the
   filters (search, period, person, state; „Filtre · n” on the phone) and the DataTable with the
   columns of preview.html BK_COLS, the row actions and the open row. The selection with the bulk
   bar, the filter pills, the export, the pagination and the „rezultate în alte zile” come with
   screen 4. The pill is the 7-state one of BookingStatuses (S116: the screens take these 7). */

export type ListRow = {
  id: string;
  client: string;
  phone: string | null;
  service: string;
  staff: string;
  /** „Azi, 11:00” / „Vin, 6 nov., 12:30” */
  when: string;
  /** „60 min” */
  duration: string;
  /** „350 lei” */
  price: string;
  status: DetailStatus;
};

export type ListPeriod = 'today' | 'week' | 'month';
export type ListStateFilter = 'active' | 'unconfirmed' | 'cancelled';

export type BookingListViewProps = {
  mode: ScreenMode;
  /** The page header's sentence and „Exportă” (BookingList); the detail's list has neither. */
  description?: boolean;
  onExport?: () => void;
  rows: ListRow[];
  activeRow?: string | null;
  onRowClick?: (row: ListRow) => void;
  rowActions?: (row: ListRow) => DataTableAction[];
  query: string;
  onQuery?: (q: string) => void;
  period: ListPeriod;
  onPeriod?: (p: ListPeriod) => void;
  staff: { id: string; name: string }[];
  staffFilter: string;
  onStaffFilter?: (id: string) => void;
  state: ListStateFilter;
  onState?: (s: ListStateFilter) => void;
  /** How many filters differ from the default (the phone's „Filtre · n”). */
  filterCount?: number;
  onFilters?: () => void;
  loading?: boolean;
  /** BookingStates „Listă · goală, cu filtre”: „Șterge filtrele” when a filter differs from the default. */
  onClearFilters?: () => void;
  /** false: no filter bar (BookingLimit's list behind the dialog). */
  filters?: boolean;
  /** „Programare nouă” in the page header (BookingLimit). */
  onNew?: () => void;
};

export function BookingListView(p: BookingListViewProps) {
  const t = useTranslations('booking');
  const labels = useTableLabels();
  const mobile = p.mode === 'mobile';
  const columns: DataTableColumn<ListRow>[] = [
    {
      key: 'client',
      header: t('list.cols.client'),
      sortable: true,
      primary: true,
      render: (r) => (
        <span className={s.client}>
          <span>{r.client}</span>
          {!mobile && r.phone && <span className={`body-small ${s.muted}`}>{r.phone}</span>}
        </span>
      ),
    },
    { key: 'service', header: t('list.cols.service'), secondary: true },
    { key: 'staff', header: t('list.cols.staff'), sortable: true, optional: true },
    {
      key: 'when',
      header: t('list.cols.when'),
      sortable: true,
      secondary: true,
      render: (r) => (
        <span>
          {r.when}
          <span className={s.muted}> · {r.duration}</span>
        </span>
      ),
    },
    {
      key: 'price',
      header: t('list.cols.price'),
      align: 'end',
      sortable: true,
      optional: true,
      render: (r) => r.price,
    },
    {
      key: 'status',
      header: t('list.cols.status'),
      trailing: true,
      render: (r) => {
        const look = STATUS_LOOK[r.status];
        return (
          <StatusPill tone={look.tone} icon={look.icon}>
            {t(`status.${look.key}`)}
          </StatusPill>
        );
      },
    },
  ];
  const toolbar = (
    <>
      <div className={`${s.search} ${mobile ? s.searchM : ''}`}>
        <Input
          icon="search"
          size="sm"
          value={p.query}
          placeholder={t('list.search')}
          aria-label={t('list.searchLabel')}
          onChange={(e) => p.onQuery?.(e.target.value)}
        />
      </div>
      {mobile ? (
        <Button size="sm" icon="list-filter" onPress={p.onFilters}>
          {t('list.filters', { n: p.filterCount ?? 0 })}
        </Button>
      ) : (
        <>
          <SegmentedControl
            size="sm"
            aria-label={t('list.period')}
            value={p.period}
            onChange={(v) => p.onPeriod?.(v as ListPeriod)}
            options={[
              { value: 'today', label: t('list.periods.today') },
              { value: 'week', label: t('list.periods.week') },
              { value: 'month', label: t('list.periods.month') },
            ]}
          />
          <div className={s.sel}>
            <Select
              size="sm"
              aria-label={t('list.cols.staff')}
              value={p.staffFilter}
              onChange={p.onStaffFilter}
              options={[
                { value: 'all', label: t('list.team') },
                ...p.staff.map((m) => ({ value: m.id, label: m.name })),
              ]}
            />
          </div>
          <div className={s.sel}>
            <Select
              size="sm"
              aria-label={t('list.cols.status')}
              value={p.state}
              onChange={(v) => p.onState?.(v as ListStateFilter)}
              options={[
                { value: 'active', label: t('list.states.active') },
                { value: 'unconfirmed', label: t('list.states.unconfirmed') },
                { value: 'cancelled', label: t('list.states.cancelled') },
              ]}
            />
          </div>
        </>
      )}
    </>
  );
  return (
    <>
      <PageHeader
        title={t('list.title')}
        description={p.description && !mobile ? t('list.desc') : undefined}
        actions={
          p.onNew && !mobile ? (
            <Button variant="primary" icon="plus" onPress={p.onNew}>
              {t('new.title')}
            </Button>
          ) : p.onExport && !mobile ? (
            <Button icon="download" onPress={p.onExport}>
              {t('list.export')}
            </Button>
          ) : null
        }
      />
      <DataTable
        caption={t('list.title')}
        columns={columns}
        rows={p.rows}
        rowKey={(r) => r.id}
        activeRow={p.activeRow ?? undefined}
        rowActions={p.rowActions}
        onRowClick={p.onRowClick}
        toolbar={p.filters === false ? undefined : toolbar}
        loading={p.loading}
        labels={labels}
        empty={<ListEmptyFiltered onClear={p.onClearFilters} />}
      />
    </>
  );
}
