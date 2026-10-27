'use client';

import { useState } from 'react';
import { cn } from '../lib/cn';
import { Icon } from '../Icon/Icon';
import styles from './Kanban.module.css';

export type KanbanColumnTone = 'default' | 'done' | 'blocked' | 'active';

export interface KanbanColumn {
  id: string;
  label: string;
  tone?: KanbanColumnTone;
  limit?: number;
}

export interface KanbanCardDue {
  label: string;
  overdue?: boolean;
}

export interface KanbanCardData {
  id: string;
  col: string;
  tag?: string;
  title: string;
  sub?: string;
  people?: string[];
  due?: KanbanCardDue;
  priority?: 'low' | 'medium' | 'high';
  count?: number;
}

export interface KanbanContext {
  columns: KanbanColumn[];
}

export interface KanbanProps {
  label?: string;
  columns: KanbanColumn[];
  cards: KanbanCardData[];
  defaultColumn?: string;
  onMove?: (cardId: string, toColumnId: string) => void;
  onOpen?: (cardId: string) => void;
  renderCard?: (card: KanbanCardData, ctx: KanbanContext) => React.ReactNode;
  className?: string;
}

export interface KanbanCardProps extends KanbanCardData {
  columns?: KanbanColumn[];
  onMove?: (cardId: string, toColumnId: string) => void;
  onOpen?: (cardId: string) => void;
  className?: string;
}

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function KanbanCard({
  id,
  col,
  tag,
  title,
  sub,
  people,
  due,
  priority,
  count,
  columns,
  onMove,
  onOpen,
  className,
}: KanbanCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className={cn(styles.card, className)}
      tabIndex={0}
      role="article"
      aria-label={title}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen?.(id);
      }}
    >
      <div className={styles.cardHeader}>
        {tag && <span className={styles.cardTag}>{tag}</span>}
        {onMove && columns && columns.length > 1 && (
          <div className={styles.cardMenu}>
            <button
              type="button"
              className={styles.cardMenuBtn}
              aria-label="Mută cardul"
              aria-expanded={menuOpen}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((o) => !o);
              }}
            >
              <Icon icon="more-horizontal" size="sm" aria-hidden />
            </button>
            {menuOpen && (
              <div className={styles.cardMenuPopover} role="menu">
                {columns
                  .filter((c) => c.id !== col)
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="menuitem"
                      className={styles.cardMenuItem}
                      onClick={() => {
                        onMove(id, c.id);
                        setMenuOpen(false);
                      }}
                    >
                      Mută în {c.label}
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      <button type="button" className={styles.cardTitle} onClick={() => onOpen?.(id)}>
        {title}
      </button>

      {sub && <p className={styles.cardSub}>{sub}</p>}

      <div className={styles.cardFooter}>
        {people && people.length > 0 && (
          <div className={styles.cardPeople} aria-label="Persoane">
            {people.slice(0, 3).map((p) => (
              <span key={p} className={styles.cardAvatar} title={p} aria-label={p}>
                {initials(p)}
              </span>
            ))}
          </div>
        )}
        <div className={styles.cardMeta}>
          {priority && (
            <span
              className={cn(
                styles.cardPriority,
                priority === 'high' && styles.priorityHigh,
                priority === 'medium' && styles.priorityMedium,
              )}
              aria-label={`Prioritate: ${priority}`}
            >
              <Icon icon="arrow-up" size="sm" aria-hidden />
            </span>
          )}
          {count !== undefined && <span className={styles.cardCount}>{count}</span>}
          {due && (
            <span className={cn(styles.cardDue, due.overdue && styles.dueOverdue)}>
              <Icon icon="calendar" size="sm" aria-hidden />
              {due.label}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function Kanban({
  label = 'Kanban',
  columns,
  cards,
  defaultColumn,
  onMove,
  onOpen,
  renderCard,
  className,
}: KanbanProps) {
  const [activeCol, setActiveCol] = useState<string>(defaultColumn ?? columns[0]?.id ?? '');
  const ctx: KanbanContext = { columns };

  const defaultRender = (card: KanbanCardData) => (
    <KanbanCard key={card.id} {...card} columns={columns} onMove={onMove} onOpen={onOpen} />
  );

  // Mobile: one column at a time; Desktop: all columns
  return (
    <div className={cn(styles.root, className)} aria-label={label}>
      {/* Mobile tab bar */}
      <div className={styles.tabBar} role="tablist" aria-label={label}>
        {columns.map((col) => (
          <button
            key={col.id}
            type="button"
            role="tab"
            aria-selected={col.id === activeCol}
            className={cn(styles.tab, col.id === activeCol && styles.tabActive)}
            onClick={() => setActiveCol(col.id)}
          >
            <span
              className={cn(styles.tabDot, col.tone && styles[`dot-${col.tone}`])}
              aria-hidden
            />
            {col.label}
            <span className={styles.tabCount}>{cards.filter((c) => c.col === col.id).length}</span>
          </button>
        ))}
      </div>

      {/* Board */}
      <div className={styles.board} role="list">
        {columns.map((col) => {
          const colCards = cards.filter((c) => c.col === col.id);
          const overLimit = col.limit !== undefined && colCards.length > col.limit;
          return (
            <div
              key={col.id}
              className={cn(styles.column, col.id !== activeCol && styles.columnHidden)}
              role="listitem"
              aria-label={col.label}
              data-col-id={col.id}
            >
              <div className={styles.colHeader}>
                <span
                  className={cn(styles.colDot, col.tone && styles[`dot-${col.tone}`])}
                  aria-hidden
                />
                <span className={styles.colLabel}>{col.label}</span>
                <span
                  className={cn(styles.colCount, overLimit && styles.colCountOver)}
                  aria-label={`${colCards.length} carduri${col.limit !== undefined ? ` din ${col.limit}` : ''}`}
                >
                  {colCards.length}
                  {col.limit !== undefined && `/${col.limit}`}
                </span>
              </div>
              <div className={styles.cards}>
                {colCards.map((card) => (renderCard ? renderCard(card, ctx) : defaultRender(card)))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
