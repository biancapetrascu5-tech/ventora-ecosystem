'use client';

import { cn } from '../lib/cn';
import { fmtNumber } from '../lib/fmt';
import { IconButton } from '../IconButton/IconButton';
import { Select } from '../Select/Select';
import styles from './Pagination.module.css';

/** Etichetele traduse. Numerele vin deja formatate (separator de mii). */
export interface PaginationLabels {
  /** „{from}–{to} din {total}” */
  range: (from: string, to: string, total: string) => string;
  /** „Pagina {n} din {total}” */
  pageOf: (n: string, total: string) => string;
  rowsPerPage: string;
  prevPage: string;
  nextPage: string;
}

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Fără el nu apare alegerea „Rânduri pe pagină”. */
  onPageSizeChange?: (size: number) => void;
  pageSizes?: number[];
  /** Pentru spații înguste: „Pagina 2 din 13” în locul numerelor. */
  compact?: boolean;
  labels: PaginationLabels;
  locale?: string;
  className?: string;
}

/* pageList din bundle.js: până la 7 pagini toate, altfel 1 … p-1 p p+1 … ultima */
export function pageList(page: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const s = Math.max(2, page - 1);
  const e = Math.min(total - 1, page + 1);
  if (s > 2) out.push('…');
  for (let i = s; i <= e; i++) out.push(i);
  if (e < total - 1) out.push('…');
  out.push(total);
  return out;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizes = [10, 20, 50, 100],
  compact = false,
  labels,
  locale,
  className,
}: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  const f = (n: number) => fmtNumber(n, locale);

  return (
    <nav
      className={cn(styles.root, className)}
      aria-label={labels.pageOf(String(page), String(pages))}
    >
      <span className={cn(styles.range, 'body-small')}>
        {labels.range(f(from), f(to), f(total))}
      </span>
      <div className={styles.ctrl}>
        {onPageSizeChange && !compact && (
          <span className={styles.size} data-pg="size">
            <span className={cn(styles.sizeLabel, 'body-small')}>{labels.rowsPerPage}</span>
            <Select
              size="sm"
              className={styles.select}
              value={String(pageSize)}
              onChange={(v) => onPageSizeChange(Number(v))}
              options={pageSizes.map((n) => ({ value: String(n), label: String(n) }))}
              aria-label={labels.rowsPerPage}
            />
          </span>
        )}
        <IconButton
          icon="chevron-left"
          label={labels.prevPage}
          isDisabled={page <= 1}
          onPress={() => onPageChange(page - 1)}
        />
        {compact ? (
          <span className={cn(styles.of, 'body-small')}>{labels.pageOf(f(page), f(pages))}</span>
        ) : (
          pageList(page, pages).map((p, i) =>
            p === '…' ? (
              <span
                key={`e${i}`}
                className={cn(styles.gap, 'body-small')}
                data-pg="gap"
                aria-hidden="true"
              >
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                aria-current={p === page ? 'page' : undefined}
                aria-label={labels.pageOf(String(p), String(pages))}
                className={cn(styles.page, 'body', p === page && styles.on)}
                data-pg="page"
                onClick={() => onPageChange(p)}
              >
                {f(p)}
              </button>
            ),
          )
        )}
        <IconButton
          icon="chevron-right"
          label={labels.nextPage}
          isDisabled={page >= pages}
          onPress={() => onPageChange(page + 1)}
        />
      </div>
    </nav>
  );
}
