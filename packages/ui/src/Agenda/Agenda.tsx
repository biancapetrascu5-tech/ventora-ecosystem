'use client';

import { StatusPill, type StatusPillTone } from '../StatusPill/StatusPill';
import type { IconName } from '../Icon/Icon';
import { cn } from '../lib/cn';
import { toMin, type ScheduleEventStatus, type ScheduleStatusLabels } from '../Schedule/Schedule';
import styles from './Agenda.module.css';

export type AgendaItemStatus = ScheduleEventStatus;

export interface AgendaItem {
  id: string | number;
  start: string;
  end: string;
  title: string;
  subtitle?: string;
  staff?: string;
  status?: AgendaItemStatus;
}

export interface AgendaProps {
  items: AgendaItem[];
  /** Ora curentă: linia „acum” și evenimentul în curs (peach, cu progres). */
  now?: string;
  onSelect?: (item: AgendaItem) => void;
  activeId?: string | number;
  /** Angajatul după serviciu, despărțit cu „·”. */
  showStaff?: boolean;
  /** Textele stărilor (S.ev_*). */
  statusLabels: ScheduleStatusLabels;
  /** S.now — eticheta liniei și a progresului. */
  nowLabel?: string;
  className?: string;
}

const TONE: Record<AgendaItemStatus, StatusPillTone> = {
  confirmed: 'neutral',
  unconfirmed: 'neutral',
  now: 'attention',
  done: 'done',
  cancelled: 'neutral',
  noshow: 'danger',
  blocked: 'neutral',
};

/* Agenda din bundle.js: lista zilei, cu linia „acum” peach între evenimente. */
export function Agenda({
  items,
  now,
  onSelect,
  activeId,
  showStaff = true,
  statusLabels,
  nowLabel,
  className,
}: AgendaProps) {
  const nowM = now != null ? toMin(now) : null;
  const sorted = [...items].sort((a, b) => toMin(a.start) - toMin(b.start));
  let placed = false;
  const rows: React.ReactNode[] = [];
  const nowLine = (
    <li key="now" className={styles.nowline} aria-label={nowLabel}>
      <span className="caption v-num">{now}</span>
    </li>
  );
  sorted.forEach((it) => {
    const s = toMin(it.start);
    const e = toMin(it.end);
    if (!placed && nowM != null && s > nowM) {
      rows.push(nowLine);
      placed = true;
    }
    const current = nowM != null && s <= nowM && nowM < e && it.status !== 'cancelled';
    const st: AgendaItemStatus = current ? 'now' : (it.status ?? 'confirmed');
    const pctDone = current && nowM != null ? Math.round(((nowM - s) / (e - s)) * 100) : 0;
    const icon: IconName | undefined =
      st === 'now' ? 'circle-dot' : st === 'unconfirmed' ? 'clock' : undefined;
    const cls = cn(
      styles.item,
      styles[`item-${st}`],
      activeId === it.id && styles.isActive,
      onSelect && styles.button,
    );
    const content = (
      <>
        <span className={cn(styles.time, 'v-num')}>
          <span className="body-strong">{it.start}</span>
          <span className="caption">{it.end}</span>
        </span>
        <span className={styles.main}>
          <span className={cn('body-strong', styles.title)}>{it.title}</span>
          <span className={cn('body-small', styles.sub)}>
            {[it.subtitle, showStaff && it.staff].filter(Boolean).join(' · ')}
          </span>
          {current && (
            <span
              className={styles.progress}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pctDone}
              aria-label={nowLabel}
            >
              <span style={{ width: `${pctDone}%` }} />
            </span>
          )}
        </span>
        <StatusPill tone={TONE[st]} size="sm" {...(icon ? { icon } : {})}>
          {statusLabels[st]}
        </StatusPill>
      </>
    );
    rows.push(
      <li key={it.id}>
        {onSelect ? (
          <button type="button" className={cls} onClick={() => onSelect(it)}>
            {content}
          </button>
        ) : (
          <div className={cls}>{content}</div>
        )}
      </li>,
    );
  });
  if (!placed && nowM != null) rows.push(nowLine);
  return <ul className={cn(styles.agenda, className)}>{rows}</ul>;
}
