'use client';

import { useState, type ReactNode } from 'react';
import { AvatarGroup } from '../Avatar/Avatar';
import { Icon, type IconName } from '../Icon/Icon';
import { IconButton } from '../IconButton/IconButton';
import { Menu } from '../Menu/Menu';
import { StatusPill, type StatusPillTone } from '../StatusPill/StatusPill';
import { cn } from '../lib/cn';
import styles from './Kanban.module.css';

export interface KanbanColumn {
  id: string;
  label: string;
  /** `done` = bifa lime în antet. */
  tone?: 'done';
  /** Suma coloanei (ex. „7.900 €”). */
  summary?: string;
  /** Numărul afișat; implicit numărul de carduri. */
  count?: number;
  /** Textul coloanei goale. */
  empty?: string;
}

export interface KanbanCardDue {
  label: string;
  tone?: StatusPillTone;
  icon?: IconName;
}

export interface KanbanCardData {
  id: string;
  col: string;
  tag?: string;
  title: string;
  subtitle?: string;
  amount?: string;
  people?: string[];
  due?: KanbanCardDue;
  meta?: string[];
  progress?: { done: number; total: number };
  /** Cardul deschis (bordură ink). */
  active?: boolean;
}

export interface KanbanLabels {
  /** S.moveTo, ex. (col) => `Mută în „${col}”`. */
  moveTo: (col: string) => string;
  /** S.moreActionsFor, ex. (name) => `Acțiuni pentru ${name}`. */
  moreActionsFor: (name: string) => string;
  /** S.rowActions — eticheta meniului. */
  rowActions: string;
}

export interface KanbanContext {
  columns: KanbanColumn[];
  onMove?: (cardId: string, toColumnId: string) => void;
}

export interface KanbanProps {
  label?: string;
  columns: KanbanColumn[];
  cards: KanbanCardData[];
  /** Coloana arătată pe ecranele înguste. */
  defaultColumn?: string;
  onMove?: (cardId: string, toColumnId: string) => void;
  onOpen?: (cardId: string) => void;
  renderCard?: (card: KanbanCardData, ctx: KanbanContext) => ReactNode;
  labels: KanbanLabels;
  locale?: string;
  className?: string;
}

export interface KanbanCardProps extends KanbanCardData {
  columns?: KanbanColumn[];
  onMove?: (cardId: string, toColumnId: string) => void;
  onOpen?: (cardId: string) => void;
  labels: KanbanLabels;
  locale?: string;
  className?: string;
}

/* KanbanCard din bundle.js: .v-kcard cu zona principală apăsabilă și subsolul cu termen, oameni și meniu. */
export function KanbanCard({
  id,
  col,
  title,
  subtitle,
  amount,
  people = [],
  due,
  meta = [],
  progress,
  tag,
  onOpen,
  onMove,
  columns = [],
  active,
  labels,
  locale,
  className,
}: KanbanCardProps) {
  const moveItems = onMove
    ? columns
        .filter((c) => c.id !== col)
        .map((c) => ({ id: c.id, label: labels.moveTo(c.label), icon: 'arrow-right' as const }))
    : null;
  return (
    <article className={cn(styles.card, active && styles.isActive, className)}>
      <button type="button" className={styles.main} onClick={() => onOpen?.(id)}>
        {tag && <span className={cn('caption', styles.tag)}>{tag}</span>}
        <span className={cn('body-strong', styles.title)}>{title}</span>
        {subtitle && <span className={cn('body-small', styles.sub)}>{subtitle}</span>}
        {amount && <span className={cn('body-strong', 'v-num', styles.amount)}>{amount}</span>}
        {progress && (
          <span className={cn(styles.prog, 'caption', 'v-num')}>
            <span className={styles.progbar} aria-hidden="true">
              <span style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
            </span>
            {progress.done}/{progress.total}
          </span>
        )}
      </button>
      <footer className={styles.foot}>
        {due && (
          <StatusPill
            size="sm"
            tone={due.tone ?? 'neutral'}
            icon={due.icon ?? (due.tone === 'attention' ? 'clock' : 'calendar')}
          >
            {due.label}
          </StatusPill>
        )}
        {meta.map((m) => (
          <span key={m} className={cn('caption', styles.meta)}>
            {m}
          </span>
        ))}
        <span className={styles.end}>
          {people.length > 0 && (
            <AvatarGroup
              people={people.map((p) => ({ name: p }))}
              size="sm"
              max={3}
              locale={locale}
            />
          )}
          {moveItems && (
            <Menu label={labels.rowActions} items={moveItems} onAction={(to) => onMove?.(id, to)}>
              <IconButton
                icon="ellipsis"
                label={labels.moreActionsFor(title)}
                size="sm"
                variant="quiet"
                className={styles.more}
              />
            </Menu>
          )}
        </span>
      </footer>
    </article>
  );
}

/* Kanban din bundle.js: coloane pe sunken, antet cu număr și sumă; sub 640px (container)
   o singură coloană, aleasă din rândul de chip-uri. */
export function Kanban({
  label,
  columns,
  cards,
  defaultColumn,
  onMove,
  onOpen,
  renderCard,
  labels,
  locale,
  className,
}: KanbanProps) {
  const [active, setActive] = useState(defaultColumn ?? columns[0]?.id);
  return (
    <div className={cn(styles.kanban, className)}>
      <div className={styles.switch} role="tablist" aria-label={label}>
        {columns.map((c) => {
          const n = c.count ?? cards.filter((k) => k.col === c.id).length;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={active === c.id}
              className={cn(styles.chip, active === c.id && styles.chipOn)}
              onClick={() => setActive(c.id)}
            >
              <span className="body-strong">{c.label}</span>
              <span className="caption v-num">{n}</span>
            </button>
          );
        })}
      </div>
      <div className={styles.cols}>
        {columns.map((c) => {
          const list = cards.filter((k) => k.col === c.id);
          const n = c.count ?? list.length;
          return (
            <section
              key={c.id}
              className={cn(styles.col, active === c.id && styles.colActive)}
              aria-label={c.label}
            >
              <header className={styles.head}>
                <span className={styles.ctitle}>
                  {c.tone === 'done' && (
                    <Icon icon="circle-check" size={16} className={styles.done} />
                  )}
                  <span className="body-strong">{c.label}</span>
                  <span className={cn('caption', 'v-num', styles.count)}>{n}</span>
                </span>
                {c.summary && (
                  <span className={cn('body-small', 'v-num', styles.sum)}>{c.summary}</span>
                )}
              </header>
              <ul className={styles.list}>
                {list.map((k) => (
                  <li key={k.id}>
                    {renderCard ? (
                      renderCard(k, { columns, onMove })
                    ) : (
                      <KanbanCard
                        {...k}
                        columns={columns}
                        onMove={onMove}
                        onOpen={onOpen}
                        labels={labels}
                        locale={locale}
                      />
                    )}
                  </li>
                ))}
                {list.length === 0 && (
                  <li className={cn(styles.empty, 'body-small')}>{c.empty ?? '—'}</li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
