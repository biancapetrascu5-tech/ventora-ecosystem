'use client';

import { useTranslations } from 'next-intl';
import {
  Badge,
  DataTable,
  Sheet,
  SheetSection,
  Toggle,
  type DataTableAction,
  type DataTableColumn,
} from '@ventora/ui';
import { useTableLabels } from '../services/texts';
import type { ScreenMode } from '../services/BookingServicesView';
import sv from '../services/services.module.css';
import s from './messages.module.css';

/* BookingMessageTemplates (S127) · Setări › „Mesaje”: „Către clienți” and „Către echipă”, each
   message with its channels, when it leaves and on / off. The page passes the rows: the application
   the messages that exist (B.13 / B.14), the gallery those of the design (with the team, the review
   and the SMS of B.15–B.17). A message that cannot be turned off has its toggle on and disabled. */

/** The message ids of S127 (booking.msg.t.*). */
export type MessageId =
  | 'confirm'
  | 'reminder'
  | 'changed'
  | 'cancelled'
  | 'followup'
  | 'review'
  | 'teamNew'
  | 'teamCancelled'
  | 'teamMoved'
  | 'teamDigest';
export type MessageChannel = 'email' | 'sms' | 'push';

export type MessageRow = {
  id: MessageId;
  channels: MessageChannel[];
  /** „Imediat”, „Cu 24 ore înainte”… (already in words). */
  when: string;
  on: boolean;
  /** Always sent (founder, 13.11): the toggle stays on and cannot be changed. */
  locked?: boolean;
};

export type BookingMessagesViewProps = {
  mode: ScreenMode;
  clients: MessageRow[];
  /** „Către echipă” (B.15); left out until the team notices exist. */
  team?: MessageRow[];
  onToggle?: (id: MessageId, on: boolean) => void;
  onEdit?: (id: MessageId) => void;
  /** A toggle being saved. */
  busy?: MessageId | null;
};

export function BookingMessagesView(p: BookingMessagesViewProps) {
  const t = useTranslations('booking.msg');
  const labels = useTableLabels();

  const columns: DataTableColumn<MessageRow>[] = [
    { key: 'id', header: t('col.message'), primary: true, render: (r) => t(`t.${r.id}`) },
    {
      key: 'ch',
      header: t('col.channel'),
      secondary: true,
      width: '220px',
      render: (r) => (
        <span className={s.row}>
          {r.channels.map((c) => (
            <Badge key={c}>{t(`ch.${c}`)}</Badge>
          ))}
        </span>
      ),
    },
    { key: 'when', header: t('col.when'), secondary: true, width: '200px', render: (r) => r.when },
    {
      key: 'on',
      header: t('col.on'),
      trailing: true,
      width: '90px',
      render: (r) => (
        <Toggle
          isSelected={r.on}
          isDisabled={r.locked}
          isLoading={p.busy === r.id}
          onChange={(v) => p.onToggle?.(r.id, v)}
          aria-description={r.locked ? t('locked') : undefined}
        >
          <span className={s.sr}>
            {t('col.on')} · {t(`t.${r.id}`)}
          </span>
        </Toggle>
      ),
    },
  ];
  const actions = (r: MessageRow): DataTableAction[] => [
    { label: t('edit'), icon: 'pencil', onClick: () => p.onEdit?.(r.id) },
  ];

  return (
    <div className={sv.body}>
      <Sheet>
        <SheetSection title={t('toClients')}>
          <DataTable
            caption={t('toClients')}
            columns={columns}
            rows={p.clients}
            rowActions={actions}
            onRowClick={(r) => p.onEdit?.(r.id)}
            labels={labels}
          />
        </SheetSection>
        {p.team ? (
          <SheetSection title={t('toTeam')}>
            <DataTable
              caption={t('toTeam')}
              columns={columns}
              rows={p.team}
              rowActions={actions}
              onRowClick={(r) => p.onEdit?.(r.id)}
              labels={labels}
            />
          </SheetSection>
        ) : null}
      </Sheet>
    </div>
  );
}
