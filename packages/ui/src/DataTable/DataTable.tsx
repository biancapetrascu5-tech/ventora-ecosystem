'use client';

import { cn } from '../lib/cn';
import { Icon } from '../Icon/Icon';
import type { IconName } from '../Icon/Icon';
import { Pagination } from '../Pagination/Pagination';
import { Menu } from '../Menu/Menu';
import type { MenuItemDef, MenuSectionDef } from '../Menu/Menu';
import { Skeleton, SkeletonText } from '../Skeleton/Skeleton';
import styles from './DataTable.module.css';

export interface DataTableColumn<T = DataTableRow> {
  key: string;
  header: string;
  sortable?: boolean;
  primary?: boolean;
  secondary?: boolean;
  trailing?: boolean;
  align?: 'start' | 'end' | 'center';
  render?: (row: T) => React.ReactNode;
}

export interface DataTableRow {
  id: string | number;
  [key: string]: unknown;
}

export interface DataTableSort {
  key: string;
  dir: 'asc' | 'desc';
}

export interface DataTablePagination {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

export interface DataTableAction {
  label: string;
  icon?: IconName;
  destructive?: boolean;
  separator?: boolean;
  onPress?: () => void;
}

export interface DataTableBulkAction {
  label: string;
  icon?: IconName;
  destructive?: boolean;
  onPress?: () => void;
}

export interface DataTableProps<T extends DataTableRow = DataTableRow> {
  caption?: string;
  columns: DataTableColumn<T>[];
  rows: T[];
  selectable?: boolean;
  selected?: (string | number)[];
  onSelectedChange?: (ids: (string | number)[]) => void;
  sort?: DataTableSort;
  onSortChange?: (sort: DataTableSort) => void;
  rowActions?: (row: T) => DataTableAction[];
  toolbar?: React.ReactNode;
  activeRow?: string | number;
  bulkActions?: DataTableBulkAction[];
  pagination?: DataTablePagination;
  loading?: boolean;
  loadingRows?: number;
  empty?: React.ReactNode;
  className?: string;
}

function SortIcon({ col, sort }: { col: DataTableColumn<DataTableRow>; sort?: DataTableSort }) {
  if (!col.sortable) return null;
  const active = sort?.key === col.key;
  return (
    <span className={cn(styles.sortIcon, active && styles.sortActive)} aria-hidden>
      <Icon
        icon={
          active && sort?.dir === 'desc'
            ? 'chevron-down'
            : active
              ? 'chevron-up'
              : 'arrow-up-down'
        }
        size="sm"
      />
    </span>
  );
}

export function DataTable<T extends DataTableRow = DataTableRow>({
  caption,
  columns,
  rows,
  selectable,
  selected = [],
  onSelectedChange,
  sort,
  onSortChange,
  rowActions,
  toolbar,
  activeRow,
  bulkActions,
  pagination,
  loading,
  loadingRows = 5,
  empty,
  className,
}: DataTableProps<T>) {
  const allIds = rows.map((r) => r.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.includes(id));
  const someSelected = !allSelected && allIds.some((id) => selected.includes(id));

  function toggleAll() {
    if (!onSelectedChange) return;
    onSelectedChange(allSelected ? [] : allIds);
  }

  function toggleRow(id: string | number) {
    if (!onSelectedChange) return;
    onSelectedChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  function handleSort(col: DataTableColumn<T>) {
    if (!col.sortable || !onSortChange) return;
    const nextDir: 'asc' | 'desc' = sort?.key === col.key && sort.dir === 'asc' ? 'desc' : 'asc';
    onSortChange({ key: col.key, dir: nextDir });
  }

  const visibleCols = columns.filter((c) => !c.secondary || true);
  const hasBulk = selectable && selected.length > 0 && bulkActions && bulkActions.length > 0;

  function totalPages() {
    if (!pagination) return 1;
    return Math.max(1, Math.ceil(pagination.total / pagination.pageSize));
  }

  return (
    <div className={cn(styles.root, className)}>
      {/* Toolbar */}
      {(toolbar || hasBulk) && (
        <div className={styles.toolbar}>
          {hasBulk ? (
            <div className={styles.bulkBar}>
              <span className={styles.bulkCount}>{selected.length} selectate</span>
              <div className={styles.bulkActions}>
                {bulkActions!.map((a, i) => (
                  <button
                    key={i}
                    type="button"
                    className={cn(styles.bulkBtn, a.destructive && styles.bulkBtnDestructive)}
                    onClick={a.onPress}
                  >
                    {a.icon && <Icon icon={a.icon} size="sm" aria-hidden />}
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            toolbar
          )}
        </div>
      )}

      {/* Table */}
      <div className={styles.tableWrap}>
        <table className={styles.table} aria-label={caption}>
          {caption && <caption className={styles.caption}>{caption}</caption>}
          <thead>
            <tr>
              {selectable && (
                <th className={cn(styles.th, styles.checkCell)}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={toggleAll}
                    aria-label="Selectează toate rândurile"
                  />
                </th>
              )}
              {visibleCols.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    styles.th,
                    col.sortable && styles.thSortable,
                    col.align === 'end' && styles.thEnd,
                    col.align === 'center' && styles.thCenter,
                    col.trailing && styles.thTrailing,
                  )}
                  aria-sort={
                    sort?.key === col.key
                      ? sort.dir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                  onClick={col.sortable ? () => handleSort(col) : undefined}
                >
                  {col.header}
                  <SortIcon col={col as DataTableColumn<DataTableRow>} sort={sort} />
                </th>
              ))}
              {rowActions && (
                <th className={cn(styles.th, styles.thActions)} aria-label="Acțiuni" />
              )}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: loadingRows }).map((_, i) => (
                <tr key={i} className={styles.loadingRow} aria-hidden>
                  {selectable && (
                    <td className={cn(styles.td, styles.checkCell)}>
                      <Skeleton width={16} height={16} shape="circle" />
                    </td>
                  )}
                  {visibleCols.map((col) => (
                    <td key={col.key} className={styles.td}>
                      <SkeletonText lines={1} />
                    </td>
                  ))}
                  {rowActions && <td className={styles.td} />}
                </tr>
              ))
            ) : rows.length === 0 && empty ? (
              <tr>
                <td
                  colSpan={visibleCols.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0)}
                  className={styles.emptyCell}
                >
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isSelected = selected.includes(row.id);
                const isActive = row.id === activeRow;
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      styles.tr,
                      isSelected && styles.trSelected,
                      isActive && styles.trActive,
                    )}
                    aria-selected={isSelected || undefined}
                  >
                    {selectable && (
                      <td className={cn(styles.td, styles.checkCell)}>
                        <input
                          type="checkbox"
                          className={styles.checkbox}
                          checked={isSelected}
                          onChange={() => toggleRow(row.id)}
                          aria-label={`Selectează rândul ${row.id}`}
                        />
                      </td>
                    )}
                    {visibleCols.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          styles.td,
                          col.primary && styles.tdPrimary,
                          col.align === 'end' && styles.tdEnd,
                          col.align === 'center' && styles.tdCenter,
                          col.trailing && styles.tdTrailing,
                        )}
                      >
                        {col.render ? col.render(row) : String(row[col.key] ?? '')}
                      </td>
                    ))}
                    {rowActions && (
                      <td className={cn(styles.td, styles.tdActions)}>
                        <Menu
                          sections={(() => {
                            const acts = rowActions(row);
                            const sections: MenuSectionDef[] = [];
                            let cur: MenuItemDef[] = [];
                            acts.forEach((act) => {
                              if (act.separator) {
                                if (cur.length) sections.push({ items: cur });
                                cur = [];
                              } else {
                                cur.push({
                                  id: act.label,
                                  label: act.label,
                                  icon: act.icon,
                                  isDanger: act.destructive,
                                });
                              }
                            });
                            if (cur.length) sections.push({ items: cur });
                            return sections;
                          })()}
                          onAction={(id) => {
                            const act = rowActions(row).find((x) => !x.separator && x.label === id);
                            act?.onPress?.();
                          }}
                        >
                          <button
                            type="button"
                            className={styles.actionsBtn}
                            aria-label="Acțiuni rând"
                          >
                            <Icon icon="more-horizontal" size="sm" aria-hidden />
                          </button>
                        </Menu>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && (
        <div className={styles.paginationBar}>
          <span className={styles.paginationInfo}>
            {(pagination.page - 1) * pagination.pageSize + 1}–
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} din{' '}
            {pagination.total}
          </span>
          <Pagination
            page={pagination.page}
            totalPages={totalPages()}
            onPageChange={pagination.onPageChange}
          />
        </div>
      )}
    </div>
  );
}
