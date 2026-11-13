'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  Button,
  DataTable,
  EmptyState,
  Input,
  PageHeader,
  SegmentedControl,
  Select,
  StatusPill,
  type DataTableAction,
  type DataTableColumn,
  type DataTableKey,
  type DataTableSort,
} from '@ventora/ui';
import type { ScreenMode } from '../services/BookingServicesView';
import { useTableLabels } from '../services/texts';
import { STATUS_LOOK, type DetailStatus } from '../detail/detail-format';
import { ListEmptyFiltered } from '../states/BookingStates';
import s from './list.module.css';

/* BookingList (B.6b; Decision 7, screens 3 and 4) — the page header with „Exportă”, the filters
   (search, period, person, state; „Filtre · n” on the phone), the filter pills that remove one
   filter, „Șterge filtrele”, the DataTable with the columns of preview.html BK_COLS, sorting,
   selection with the bulk bar, the row actions, the open row and the pagination. A search with
   nothing in the period says „{n} rezultate în alte zile” with a link. The pill is the 7-state one
   of BookingStatuses (S116: the screens take these 7). Every action is drawn only when the page
   passes its handler. */

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

/** 'all': the search over every day (the link „{n} rezultate în alte zile”). */
export type ListPeriod = 'today' | 'week' | 'month' | 'all';
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
  /** The filter pills under the filters (desktop): each removes its filter. */
  pills?: { id: string; label: string; onRemove?: () => void }[];
  sort?: DataTableSort | null;
  onSortChange?: (s: DataTableSort | null) => void;
  /** Selection with the bulk bar. */
  selected?: DataTableKey[];
  onSelectedChange?: (keys: DataTableKey[]) => void;
  bulkActions?: DataTableAction[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (p: number) => void;
    onPageSizeChange?: (n: number) => void;
  };
  /** A search with nothing in the period but results on other days. */
  otherDays?: { count: number; onShow?: () => void } | null;
  /** The person and state selects at 180px (the DE / IT frames of preview.html). */
  wide?: boolean;
  /** false: only the search and the pills (preview.html ListNoResults). */
  controls?: boolean;
  /** The table's empty state, when the page has its own. */
  empty?: ReactNode;
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
      ) : p.controls === false ? null : (
        <>
          <SegmentedControl
            size="sm"
            aria-label={t('list.period')}
            value={p.period === 'all' ? '' : p.period}
            onChange={(v) => p.onPeriod?.(v as ListPeriod)}
            options={[
              { value: 'today', label: t('list.periods.today') },
              { value: 'week', label: t('list.periods.week') },
              { value: 'month', label: t('list.periods.month') },
            ]}
          />
          <div className={p.wide ? s.selWide : s.sel}>
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
          <div className={p.wide ? s.selWide : s.sel}>
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
      {!mobile && p.pills && p.pills.length > 0 && (
        <span className={s.pills}>
          {p.pills.map((x) => (
            <button
              key={x.id}
              type="button"
              className={s.pill}
              aria-label={t('list.pill.remove', { label: x.label })}
              onClick={x.onRemove}
            >
              <StatusPill tone="neutral" icon="x">
                {x.label}
              </StatusPill>
            </button>
          ))}
          {p.onClearFilters && (
            <button type="button" className="v-link body-small" onClick={p.onClearFilters}>
              {t('states.clearFilters')}
            </button>
          )}
        </span>
      )}
    </>
  );
  const q = p.query.trim();
  const empty =
    p.empty ??
    (q && p.otherDays && p.otherDays.count > 0 ? (
      <EmptyState
        size="sm"
        icon="search"
        title={t('list.none.title', { period: p.period, q })}
        description={
          <span>
            {t.rich('list.none.found', {
              n: p.otherDays.count,
              link: (chunks) => (
                <button type="button" className="v-link" onClick={p.otherDays?.onShow}>
                  {chunks}
                </button>
              ),
            })}
          </span>
        }
        actions={
          p.onClearFilters ? (
            <Button size="sm" variant="quiet" icon="x" onPress={p.onClearFilters}>
              {t('states.clearFilters')}
            </Button>
          ) : undefined
        }
      />
    ) : (
      <ListEmptyFiltered onClear={p.onClearFilters} />
    ));
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
        sort={p.sort}
        onSortChange={p.onSortChange}
        selectable={!!p.onSelectedChange}
        selected={p.selected}
        onSelectedChange={p.onSelectedChange}
        bulkActions={p.bulkActions}
        pagination={p.pagination}
        empty={empty}
      />
    </>
  );
}
