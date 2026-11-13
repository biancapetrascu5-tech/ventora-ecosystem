'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  FormField,
  Icon,
  Notice,
  PageHeader,
  Sheet,
  SheetSection,
  Stat,
  StatusPill,
  Textarea,
  type DataTableColumn,
} from '@ventora/ui';
import type { ScreenMode } from '../services/BookingServicesView';
import { useTableLabels } from '../services/texts';
import { STATUS_LOOK, type DetailStatus } from '../detail/detail-format';
import s from './client.module.css';

/* BookingClientCard (S116 c; Decision 7, screen 4) — the client card in EasyBook: the header with
   the name, „Risc ridicat” and „Programare nouă”; the figures (visits, no-shows, late
   cancellations, collected in total); the note „Risc ridicat” with who sees it and „Șterge
   nota…”; the history as a DataTable with the 7 states of BookingStatuses; on the side the
   contact, the team notes and the health information. A member sees only their own appointments
   (no figures, no note, the neutral Notice). Props only: the page and the gallery draw the same
   component; a part without data (notes, health) is drawn only when the page passes it. */

export type ClientHistoryItem = {
  id: string;
  /** „Vin, 6 nov., 12:30” */
  when: string;
  service: string;
  member: string;
  /** „350 lei” or „350 lei · avans 50 lei” */
  amount: string;
  status: DetailStatus;
  /** A late cancellation („Târzie”). */
  late?: boolean;
};

export type BookingClientCardViewProps = {
  mode: ScreenMode;
  name: string;
  /** The breadcrumb „Clienți”. */
  onBack?: () => void;
  backHref?: string;
  onNew?: () => void;
  /** null: a member (only their own appointments, no figures, no note). */
  stats: { visits: string; noShows: string; late: string; spent: string; unit?: string } | null;
  risk: { title: string; body: string } | null;
  onClearRisk?: () => void;
  history: ClientHistoryItem[];
  onRow?: (row: ClientHistoryItem) => void;
  contact: { phone: string | null; email: string | null; since: string };
  /** „Note pentru echipă” (drawn when the page has them). */
  notes?: { value: string; onChange?: (v: string) => void; onBlur?: () => void } | null;
  /** „Informații medicale” (BookingHealthFields), when the page passes it. */
  health?: ReactNode;
};

export function BookingClientCardView(p: BookingClientCardViewProps) {
  const t = useTranslations('booking');
  const labels = useTableLabels();
  const mob = p.mode === 'mobile';
  const member = p.stats === null;
  const columns: DataTableColumn<ClientHistoryItem>[] = [
    { key: 'when', header: t('client.col.when'), primary: true },
    { key: 'service', header: t('client.col.service'), secondary: true },
    { key: 'member', header: t('client.col.member'), optional: true },
    { key: 'amount', header: t('client.col.amount'), optional: true, align: 'end' },
    {
      key: 'status',
      header: t('client.col.status'),
      trailing: true,
      render: (r) => {
        const look = STATUS_LOOK[r.status];
        return (
          <span className={s.row}>
            <StatusPill tone={look.tone} icon={look.icon}>
              {t(`status.${look.key}`)}
            </StatusPill>
            {r.late && <Badge>{t('client.late')}</Badge>}
          </span>
        );
      },
    },
  ];
  const main = (
    <div className={s.col}>
      {p.stats && (
        <div className={s.stats}>
          <Stat label={t('client.visits')} value={p.stats.visits} />
          <Stat
            label={t('client.noShows')}
            value={p.stats.noShows}
            tone={p.risk ? 'attention' : 'neutral'}
          />
          <Stat label={t('client.lateCancel')} value={p.stats.late} />
          <Stat label={t('client.spent')} value={p.stats.spent} unit={p.stats.unit} />
        </div>
      )}
      {p.risk && !member && (
        <Notice className={s.notice} tone="attention" icon="triangle-alert" title={p.risk.title}>
          <div className={s.stack}>
            <p>{p.risk.body}</p>
            <p className={s.muted}>{t('client.riskWho')}</p>
            {p.onClearRisk && (
              <div>
                <Button size="sm" variant="secondary" icon="pencil" onPress={p.onClearRisk}>
                  {t('client.riskClear')}
                </Button>
              </div>
            )}
          </div>
        </Notice>
      )}
      {member && (
        <Notice className={s.notice} tone="neutral" icon="eye-off">
          {t('client.noAccess')}
        </Notice>
      )}
      <h2 className={`heading ${s.h2} ${mob ? s.h2m : ''}`}>{t('client.history')}</h2>
      <DataTable
        caption={t('client.history')}
        columns={columns}
        rows={p.history}
        rowKey={(r) => r.id}
        onRowClick={p.onRow}
        labels={labels}
      />
    </div>
  );
  const side = (
    <div className={`${s.col} ${mob ? s.pad : ''}`}>
      <Sheet>
        <SheetSection title={t('client.contact')}>
          <dl className={s.kv}>
            {p.contact.phone && (
              <>
                <dt className="caption">{t('client.phone')}</dt>
                <dd className="body">{p.contact.phone}</dd>
              </>
            )}
            {p.contact.email && (
              <>
                <dt className="caption">{t('client.email')}</dt>
                <dd className="body">{p.contact.email}</dd>
              </>
            )}
            <dt className="caption" />
            <dd className="body">{t('client.since', { date: p.contact.since })}</dd>
          </dl>
        </SheetSection>
      </Sheet>
      {p.notes && (
        <Sheet>
          <SheetSection title={t('client.notes')}>
            <Textarea
              rows={3}
              aria-label={t('client.notes')}
              value={p.notes.value}
              onChange={(e) => p.notes?.onChange?.(e.target.value)}
              onBlur={p.notes.onBlur}
            />
          </SheetSection>
        </Sheet>
      )}
      {p.health}
    </div>
  );
  return (
    <>
      <PageHeader
        title={p.name}
        breadcrumbs={[{ label: t('client.breadcrumb'), href: p.backHref, onClick: p.onBack }]}
        meta={
          p.risk && !member ? (
            <StatusPill tone="attention" icon="triangle-alert">
              {t('client.risk')}
            </StatusPill>
          ) : undefined
        }
        actions={
          p.onNew ? (
            <Button variant="primary" icon="plus" onPress={p.onNew}>
              {t('client.newBooking')}
            </Button>
          ) : undefined
        }
      />
      <div className={`${s.body} ${mob ? s.bodyM : ''}`}>
        <div className={`${s.grid} ${mob ? s.gridM : ''}`}>
          {main}
          {side}
        </div>
      </div>
    </>
  );
}

/** „Șterge nota…”: the reason goes to the business log (S116-D12). */
export function ClearRiskDialog(p: {
  mode: ScreenMode;
  name: string;
  reason: string;
  onReason?: (v: string) => void;
  error?: string | null;
  busy?: boolean;
  onClose?: () => void;
  onConfirm?: () => void;
  /** The gallery: drawn in place, without the overlay. */
  framed?: boolean;
}) {
  const t = useTranslations('booking');
  const ui = useTranslations('ui');
  return (
    <Dialog
      inline={p.framed}
      sheet={p.mode === 'mobile'}
      onClose={p.onClose}
      title={t('client.riskClearTitle', { name: p.name })}
      description={t('client.riskClearBody')}
      footer={
        <>
          <Button variant="quiet" onPress={p.onClose}>
            {ui('cancel')}
          </Button>
          <Button variant="primary" icon="check" isPending={p.busy} onPress={p.onConfirm}>
            {t('client.clearSubmit')}
          </Button>
        </>
      }
    >
      <FormField label={t('client.reason')} required error={p.error ?? undefined}>
        <Textarea rows={3} value={p.reason} onChange={(e) => p.onReason?.(e.target.value)} />
      </FormField>
    </Dialog>
  );
}

/** The lock line of „Informații medicale” for a member (BookingHealthFields). */
export function HealthLocked({ text }: { text: string }) {
  return (
    <div className={s.line}>
      <Icon icon="lock" size={16} />
      <p className="body-small">{text}</p>
    </div>
  );
}
