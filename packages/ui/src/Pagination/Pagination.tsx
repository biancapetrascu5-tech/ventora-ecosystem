'use client';

import { cn } from '../lib/cn';
import { fmtNumber } from '../lib/fmt';
import styles from './Pagination.module.css';

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  siblingCount?: number;
  locale?: string;
  className?: string;
}

function getPages(page: number, totalPages: number, siblingCount: number): (number | '...')[] {
  const totalNumbers = siblingCount * 2 + 5;
  if (totalPages <= totalNumbers) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const leftSibling = Math.max(page - siblingCount, 1);
  const rightSibling = Math.min(page + siblingCount, totalPages);
  const showLeftEllipsis = leftSibling > 2;
  const showRightEllipsis = rightSibling < totalPages - 1;
  const pages: (number | '...')[] = [1];
  if (showLeftEllipsis) pages.push('...');
  for (let i = leftSibling; i <= rightSibling; i++) {
    if (i !== 1 && i !== totalPages) pages.push(i);
  }
  if (showRightEllipsis) pages.push('...');
  if (totalPages > 1) pages.push(totalPages);
  return pages;
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  siblingCount = 1,
  locale,
  className,
}: PaginationProps) {
  const pages = getPages(page, totalPages, siblingCount);

  return (
    <nav role="navigation" aria-label="Paginare" className={cn(styles.root, className)}>
      <button
        type="button"
        className={styles.button}
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label="Pagina anterioară"
      >
        ‹
      </button>

      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`ellipsis-${i}`} className={styles.ellipsis} aria-hidden>
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            className={cn(styles.button, p === page && styles.active)}
            onClick={() => onPageChange(p)}
            aria-label={`Pagina ${p}`}
            aria-current={p === page ? 'page' : undefined}
          >
            {fmtNumber(p, locale)}
          </button>
        ),
      )}

      <button
        type="button"
        className={styles.button}
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Pagina următoare"
      >
        ›
      </button>
    </nav>
  );
}
