'use client';

import { cn } from '../lib/cn';
import { StatusPill } from '../StatusPill/StatusPill';
import styles from './Agenda.module.css';

export type AgendaItemStatus = 'confirmed' | 'unconfirmed' | 'done' | 'cancelled';

export interface AgendaItem {
  id: string | number;
  col: string;
  start: string;
  end: string;
  title: string;
  subtitle?: string;
  status: AgendaItemStatus;
  staff?: string;
}

export interface AgendaProps {
  items: AgendaItem[];
  now?: string;
  onSelect?: (item: AgendaItem) => void;
  className?: string;
}

function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

const STATUS_LABEL: Record<AgendaItemStatus, string> = {
  confirmed: 'Confirmată',
  unconfirmed: 'Neconfirmată',
  done: 'Încheiată',
  cancelled: 'Anulată',
};

type PillTone = 'attention' | 'done' | 'neutral' | 'danger';

function statusTone(status: AgendaItemStatus, isNow: boolean): PillTone {
  if (isNow) return 'attention';
  if (status === 'done') return 'done';
  return 'neutral';
}

export function Agenda({ items, now, onSelect, className }: AgendaProps) {
  const nowMinutes = now ? parseTime(now) : null;

  const sorted = [...items].sort((a, b) => parseTime(a.start) - parseTime(b.start));

  let nowInserted = false;

  return (
    <div className={cn(styles.root, className)} role="list" aria-label="Program zi">
      {sorted.map((item) => {
        const startMin = parseTime(item.start);
        const endMin = parseTime(item.end);
        const isNow = nowMinutes !== null && nowMinutes >= startMin && nowMinutes < endMin;
        const isPast = nowMinutes !== null && endMin <= nowMinutes;

        let showNowLine = false;
        if (!nowInserted && nowMinutes !== null && startMin > nowMinutes) {
          showNowLine = true;
          nowInserted = true;
        }

        return (
          <div key={item.id}>
            {showNowLine && (
              <div className={styles.nowLine} role="separator" aria-label={`Acum ${now}`}>
                <span className={styles.nowTime}>{now}</span>
                <div className={styles.nowRule} />
              </div>
            )}
            <div
              role="listitem"
              className={cn(
                styles.item,
                isNow && styles.itemNow,
                isPast && styles.itemPast,
                item.status === 'cancelled' && styles.itemCancelled,
              )}
              onClick={() => onSelect?.(item)}
              tabIndex={onSelect ? 0 : undefined}
              onKeyDown={
                onSelect
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') onSelect(item);
                    }
                  : undefined
              }
              aria-label={`${item.start} ${item.title}${item.subtitle ? ` · ${item.subtitle}` : ''}`}
            >
              <div className={styles.timeCol}>
                <span className={styles.startTime}>{item.start}</span>
                <span className={styles.endTime}>{item.end}</span>
              </div>
              <div className={styles.content}>
                <span className={styles.title}>{item.title}</span>
                {item.subtitle && <span className={styles.subtitle}>{item.subtitle}</span>}
                {item.staff && <span className={styles.staff}>{item.staff}</span>}
              </div>
              <div className={styles.status}>
                <StatusPill
                  tone={statusTone(item.status, isNow)}
                  size="sm"
                  icon={item.status === 'unconfirmed' ? 'clock' : undefined}
                >
                  {isNow ? 'În desfășurare' : STATUS_LABEL[item.status]}
                </StatusPill>
              </div>
            </div>
          </div>
        );
      })}
      {!nowInserted && nowMinutes !== null && sorted.length > 0 && (
        <div className={styles.nowLine} role="separator" aria-label={`Acum ${now}`}>
          <span className={styles.nowTime}>{now}</span>
          <div className={styles.nowRule} />
        </div>
      )}
    </div>
  );
}
