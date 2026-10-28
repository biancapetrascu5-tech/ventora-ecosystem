'use client';

import { Fragment } from 'react';
import { cn } from '../lib/cn';
import { Icon, type IconName } from '../Icon/Icon';
import { Button } from '../Button/Button';
import { IconButton } from '../IconButton/IconButton';
import { Checkbox } from '../Checkbox/Checkbox';
import { Menu, type MenuSectionDef } from '../Menu/Menu';
import { Skeleton } from '../Skeleton/Skeleton';
import { Pagination, type PaginationLabels, type PaginationProps } from '../Pagination/Pagination';
import styles from './DataTable.module.css';

export type DataTableRow = Record<string, unknown> & { id?: string | number };
export type DataTableKey = string | number;

export interface DataTableColumn<R extends DataTableRow = DataTableRow> {
  key: string;
  header: string;
  sortable?: boolean;
  align?: 'start' | 'end';
  width?: number | string;
  /** Titlul rândului în listă; implicit prima coloană. */
  primary?: boolean;
  /** Apare sub titlu în listă, despărțit cu „·”. */
  secondary?: boolean;
  /** Apare în dreapta, în listă. */
  trailing?: boolean;
  muted?: boolean;
  /** Se ascunde sub 900px lățime a tabelului. */
  optional?: boolean;
  render?: (row: R) => React.ReactNode;
}

export interface DataTableSort {
  key: string;
  dir: 'asc' | 'desc';
}

export interface DataTableAction {
  label?: string;
  icon?: IconName;
  destructive?: boolean;
  separator?: boolean;
  onClick?: () => void;
}

/** Textele traduse ale tabelului. */
export interface DataTableLabels {
  /** „{n} selectate” — cu plural. */
  selectedN: (n: number) => string;
  clearSelection: string;
  selectAll: string;
  selectRow: string;
  sortAsc: string;
  sortDesc: string;
  rowActions: string;
  pagination?: PaginationLabels;
}

export type DataTablePagination = Omit<PaginationProps, 'labels' | 'locale' | 'className'>;

export interface DataTableProps<R extends DataTableRow = DataTableRow> {
  columns: DataTableColumn<R>[];
  rows: R[];
  rowKey?: (row: R) => DataTableKey;
  sort?: DataTableSort | null;
  onSortChange?: (sort: DataTableSort | null) => void;
  selectable?: boolean;
  selected?: DataTableKey[];
  onSelectedChange?: (keys: DataTableKey[]) => void;
  rowActions?: (row: R) => DataTableAction[];
  bulkActions?: DataTableAction[];
  toolbar?: React.ReactNode;
  pagination?: DataTablePagination;
  loading?: boolean;
  loadingRows?: number;
  empty?: React.ReactNode;
  onRowClick?: (row: R) => void;
  density?: 'default' | 'dense';
  /** auto: tabel, listă sub 640px; list / table: fix. */
  layout?: 'auto' | 'list' | 'table';
  /** Titlul tabelului pentru cititoarele de ecran. */
  caption?: string;
  /** Rândul deschis în Drawer (marcaj peach). */
  activeRow?: DataTableKey;
  labels: DataTableLabels;
  locale?: string;
  className?: string;
}

function SortIcon({ dir }: { dir: 'asc' | 'desc' | null }) {
  return (
    <Icon
      icon={dir === 'asc' ? 'arrow-up' : dir === 'desc' ? 'arrow-down' : 'arrow-up-down'}
      size={14}
      className={cn(styles.sortIcon, dir && styles.sortOn)}
    />
  );
}

/* Acțiunile de rând → secțiuni de Menu (separatorul desparte secțiunile). */
function toSections(acts: DataTableAction[]): MenuSectionDef[] {
  const out: MenuSectionDef[] = [{ items: [] }];
  acts.forEach((a, i) => {
    if (a.separator) out.push({ items: [] });
    else
      out[out.length - 1]!.items.push({
        id: `${i}`,
        label: a.label ?? '',
        icon: a.icon,
        isDanger: a.destructive,
      });
  });
  return out.filter((s) => s.items.length > 0);
}

function RowMenu({
  acts,
  label,
  size,
}: {
  acts: DataTableAction[];
  label: string;
  size: 'sm' | 'lg';
}) {
  return (
    <Menu
      sections={toSections(acts)}
      onAction={(id) => {
        const a = acts[Number(id)];
        a?.onClick?.();
      }}
    >
      <IconButton icon="ellipsis-vertical" label={label} size={size} variant="quiet" />
    </Menu>
  );
}

/* DataTable din bundle.js: bara de selecție, sortare, rând activ, meniu pe rând, listă pe ecrane
   înguste (container query 640px), încărcare, gol, paginare. */
export function DataTable<R extends DataTableRow = DataTableRow>({
  columns,
  rows,
  rowKey = (r) => r.id as DataTableKey,
  sort,
  onSortChange,
  selectable = false,
  selected = [],
  onSelectedChange,
  rowActions,
  bulkActions,
  toolbar,
  pagination,
  loading = false,
  loadingRows = 6,
  empty,
  onRowClick,
  density = 'default',
  layout = 'auto',
  caption,
  activeRow,
  labels,
  locale,
  className,
}: DataTableProps<R>) {
  const keys = rows.map(rowKey);
  const allOn = selectable && keys.length > 0 && keys.every((k) => selected.includes(k));
  const someOn = selectable && !allOn && keys.some((k) => selected.includes(k));
  const toggleAll = () =>
    onSelectedChange?.(
      allOn
        ? selected.filter((k) => !keys.includes(k))
        : Array.from(new Set([...selected, ...keys])),
    );
  const toggle = (k: DataTableKey) =>
    onSelectedChange?.(selected.includes(k) ? selected.filter((x) => x !== k) : [...selected, k]);
  const clickSort = (c: DataTableColumn<R>) => {
    if (!c.sortable || !onSortChange) return;
    const dir =
      sort && sort.key === c.key
        ? sort.dir === 'asc'
          ? 'desc'
          : sort.dir === 'desc'
            ? null
            : 'asc'
        : 'asc';
    onSortChange(dir ? { key: c.key, dir } : null);
  };
  const cell = (c: DataTableColumn<R>, r: R) =>
    c.render ? c.render(r) : (r[c.key] as React.ReactNode);
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const secondary = columns.filter((c) => c.secondary);
  const trailing = columns.find((c) => c.trailing);
  const showEmpty = !loading && rows.length === 0;
  const actionsFor = (r: R) => (rowActions ? rowActions(r) : null);
  const ignoreClick = (e: React.MouseEvent, sel: string) =>
    (e.target as HTMLElement).closest(sel) != null;

  return (
    <div
      className={cn(
        styles.root,
        density === 'dense' && styles.dense,
        styles[`layout-${layout}`],
        className,
      )}
    >
      {toolbar && <div className={styles.toolbar}>{toolbar}</div>}
      {selectable && selected.length > 0 && (
        <div className={styles.bulk} role="region" aria-label={labels.selectedN(selected.length)}>
          <span className="body-strong">{labels.selectedN(selected.length)}</span>
          <div className={styles.bulkActions}>
            {(bulkActions ?? []).map((a) => (
              <Button
                key={a.label}
                size="sm"
                variant={a.destructive ? 'danger-quiet' : 'secondary'}
                icon={a.icon}
                onPress={a.onClick}
              >
                {a.label}
              </Button>
            ))}
          </div>
          <IconButton
            icon="x"
            label={labels.clearSelection}
            size="sm"
            variant="secondary"
            onPress={() => onSelectedChange?.([])}
          />
        </div>
      )}
      <div className={styles.scroll}>
        <table className={styles.table} aria-busy={loading || undefined}>
          {caption && <caption className={styles.sr}>{caption}</caption>}
          <thead>
            <tr>
              {selectable && (
                <th className={styles.sel} scope="col">
                  <Checkbox
                    isSelected={allOn}
                    isIndeterminate={someOn}
                    onChange={toggleAll}
                    aria-label={labels.selectAll}
                  />
                </th>
              )}
              {columns.map((c) => {
                const dir = sort && sort.key === c.key ? sort.dir : null;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    style={{ width: c.width }}
                    className={cn(
                      'subheading',
                      c.align === 'end' && styles.end,
                      c.optional && styles.opt,
                    )}
                    aria-sort={
                      dir === 'asc'
                        ? 'ascending'
                        : dir === 'desc'
                          ? 'descending'
                          : c.sortable
                            ? 'none'
                            : undefined
                    }
                  >
                    {c.sortable ? (
                      <button type="button" className={styles.sort} onClick={() => clickSort(c)}>
                        <span>{c.header}</span>
                        <SortIcon dir={dir} />
                        {dir && (
                          <span className={styles.sr}>
                            {dir === 'asc' ? labels.sortAsc : labels.sortDesc}
                          </span>
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
              {rowActions && (
                <th className={styles.act} scope="col">
                  <span className={styles.sr}>{labels.rowActions}</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: loadingRows }, (_, i) => (
                <tr key={`sk${i}`} className={styles.row}>
                  {selectable && (
                    <td className={styles.sel}>
                      <Skeleton width={16} height={16} />
                    </td>
                  )}
                  {columns.map((c, j) => (
                    <td
                      key={c.key}
                      className={cn(c.align === 'end' && styles.end, c.optional && styles.opt)}
                    >
                      <Skeleton width={j === 0 ? '70%' : '50%'} height={12} />
                    </td>
                  ))}
                  {rowActions && <td className={styles.act} />}
                </tr>
              ))}
            {!loading &&
              rows.map((r) => {
                const k = rowKey(r);
                const on = selected.includes(k);
                const acts = actionsFor(r);
                return (
                  <tr
                    key={k}
                    className={cn(
                      styles.row,
                      on && styles.selected,
                      onRowClick && styles.clickable,
                      activeRow === k && styles.active,
                    )}
                    aria-selected={selectable ? on : undefined}
                    onClick={
                      onRowClick
                        ? (e) => {
                            if (!ignoreClick(e, 'button,a,input,[role="menu"]')) onRowClick(r);
                          }
                        : undefined
                    }
                    onKeyDown={
                      onRowClick
                        ? (e) => {
                            if (
                              (e.key === 'Enter' || e.key === ' ') &&
                              e.target === e.currentTarget
                            ) {
                              e.preventDefault();
                              onRowClick(r);
                            }
                          }
                        : undefined
                    }
                    tabIndex={onRowClick ? 0 : undefined}
                  >
                    {selectable && (
                      <td className={styles.sel}>
                        <Checkbox
                          isSelected={on}
                          onChange={() => toggle(k)}
                          aria-label={labels.selectRow}
                        />
                      </td>
                    )}
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          c === primary ? cn('body-strong', styles.strong) : 'body',
                          c.align === 'end' && styles.end,
                          c.muted && styles.muted,
                          c.optional && styles.opt,
                        )}
                      >
                        {cell(c, r)}
                      </td>
                    ))}
                    {rowActions && (
                      <td className={styles.act}>
                        {acts && acts.length > 0 && (
                          <RowMenu acts={acts} label={labels.rowActions} size="sm" />
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
          </tbody>
        </table>
        <ul className={styles.list} aria-busy={loading || undefined}>
          {loading &&
            Array.from({ length: Math.min(loadingRows, 4) }, (_, i) => (
              <li key={`skl${i}`} className={styles.item}>
                <div className={styles.itemMain}>
                  <Skeleton width="60%" height={14} />
                  <Skeleton width="40%" height={12} />
                </div>
              </li>
            ))}
          {!loading &&
            rows.map((r) => {
              const k = rowKey(r);
              const on = selected.includes(k);
              const acts = actionsFor(r);
              return (
                <li
                  key={k}
                  className={cn(styles.item, on && styles.selected, onRowClick && styles.clickable)}
                  onClick={
                    onRowClick
                      ? (e) => {
                          if (!ignoreClick(e, 'button,a,input')) onRowClick(r);
                        }
                      : undefined
                  }
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (
                            (e.key === 'Enter' || e.key === ' ') &&
                            e.target === e.currentTarget
                          ) {
                            e.preventDefault();
                            onRowClick(r);
                          }
                        }
                      : undefined
                  }
                  tabIndex={onRowClick ? 0 : undefined}
                >
                  {selectable && (
                    <Checkbox
                      isSelected={on}
                      onChange={() => toggle(k)}
                      aria-label={labels.selectRow}
                    />
                  )}
                  <div className={styles.itemMain}>
                    <span className={cn('body-strong', styles.itemTitle)}>
                      {primary && cell(primary, r)}
                    </span>
                    {secondary.length > 0 && (
                      <span className={cn('body-small', styles.itemMeta)}>
                        {secondary.map((c, i) => (
                          <Fragment key={c.key}>
                            {i > 0 && <span aria-hidden="true"> · </span>}
                            {cell(c, r)}
                          </Fragment>
                        ))}
                      </span>
                    )}
                  </div>
                  {trailing && <div className={styles.itemTrail}>{cell(trailing, r)}</div>}
                  {acts && acts.length > 0 && (
                    <RowMenu acts={acts} label={labels.rowActions} size="lg" />
                  )}
                </li>
              );
            })}
        </ul>
        {showEmpty && <div className={styles.empty}>{empty}</div>}
      </div>
      {pagination && !showEmpty && labels.pagination && (
        <div className={styles.foot}>
          <Pagination {...pagination} labels={labels.pagination} locale={locale} />
        </div>
      )}
    </div>
  );
}
