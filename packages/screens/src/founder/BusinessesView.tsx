'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  Button,
  DataTable,
  Input,
  PageHeader,
  StatusPill,
  type DataTableAction,
  type DataTableColumn,
  type DataTableLabels,
  type DataTablePagination,
  type IconName,
} from '@ventora/ui';
import { useIsPhone } from '../screens/hooks';
import styles from './business.module.css';

/* FounderBusinesses (Lot 2.8, doar română, S57): toate afacerile, cu proprietarul, clientă din
   și starea; „Afacere nouă”. Vedere fără logică. Partea comercială (cele patru cifre de sus,
   coloanele de abonament, aplicații și consum, filtrele lor) vine din Lotul 3.4: aici sunt doar
   locurile ei (`stats`, `columns`, `filters`), pe care galeria /design le umple cu exemplele din
   design, iar aplicația le lasă goale. */

export type BusinessStatus = {
  tone: 'done' | 'neutral' | 'attention' | 'danger';
  label: string;
  icon?: IconName;
};

export type BusinessListRow = {
  id: string | number;
  name: string;
  /** „Sibiu · Andrei Mureșan” în design; în aplicație: proprietarul sau adresa invitației lui. */
  sub: string;
  /** „mar. 2025” */
  since: string;
  status: BusinessStatus;
};

/** Etichetele DataTable din cheile ui.* (Founder folosește catalogul RO al Hub-ului). */
export function useTableLabels(): DataTableLabels {
  const t = useTranslations('ui');
  return {
    selectedN: (n) => t('selectedN', { n }),
    clearSelection: t('clearSelection'),
    selectAll: t('selectAll'),
    selectRow: t('selectRow'),
    sortAsc: t('sortAsc'),
    sortDesc: t('sortDesc'),
    rowActions: t('rowActions'),
    pagination: {
      range: (from, to, total) => t('rangeOf', { from, to, total }),
      pageOf: (n, total) => t('pageOf', { n, total }),
      rowsPerPage: t('rowsPerPage'),
      prevPage: t('prevPage'),
      nextPage: t('nextPage'),
    },
  };
}

export function BusinessesView<R extends BusinessListRow>({
  rows,
  stats,
  columns = [],
  filters,
  search,
  onSearchChange,
  onNew,
  onOpen,
  rowActions,
  pagination,
  phone: phoneProp,
}: {
  rows: R[];
  /** Cele patru cifre de sus (comercial, 3.4). */
  stats?: ReactNode;
  /** Coloanele comerciale, după „Afacere” (abonament, aplicații, consum; 3.4). */
  columns?: DataTableColumn<R>[];
  /** Filtrele de abonament și stare (3.4). */
  filters?: ReactNode;
  search: string;
  onSearchChange: (q: string) => void;
  onNew: () => void;
  onOpen: (row: R) => void;
  rowActions?: (row: R) => DataTableAction[];
  pagination?: DataTablePagination;
  /** Forța aspectul de telefon (galeria: cadrul de 1280 rămâne desktop). */
  phone?: boolean;
}) {
  const t = useTranslations('founder.businesses');
  const labels = useTableLabels();
  const viewportPhone = useIsPhone();
  const phone = phoneProp ?? viewportPhone;

  const cols: DataTableColumn<R>[] = [
    {
      key: 'name',
      header: t('colBusiness'),
      primary: true,
      sortable: true,
      render: (r) => (
        <span className={styles.who}>
          <span>{r.name}</span>
          {!phone && <span className="body-small muted">{r.sub}</span>}
        </span>
      ),
    },
    ...columns,
    { key: 'since', header: t('colSince'), optional: true, muted: true },
    {
      key: 'status',
      header: t('colStatus'),
      trailing: true,
      render: (r) => (
        <StatusPill tone={r.status.tone} icon={r.status.icon}>
          {r.status.label}
        </StatusPill>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t('title')}
        description={phone ? undefined : t('lead')}
        actions={
          <Button variant="primary" icon="plus" onPress={onNew}>
            {t('new')}
          </Button>
        }
      />
      <div className={styles.axb}>
        {stats}
        <DataTable
          caption={t('caption')}
          columns={cols}
          rows={rows}
          onRowClick={onOpen}
          rowActions={
            rowActions ??
            ((r) => [{ label: t('open'), icon: 'external-link', onClick: () => onOpen(r) }])
          }
          toolbar={
            <>
              <div className={styles.toolbarSearch}>
                <Input
                  icon="search"
                  size="sm"
                  placeholder={t('search')}
                  aria-label={t('searchLabel')}
                  value={search}
                  onChange={(e) => onSearchChange(e.target.value)}
                />
              </div>
              {!phone && filters}
            </>
          }
          pagination={pagination}
          labels={labels}
          locale="ro"
        />
      </div>
    </>
  );
}
