'use client';

import { useTranslations } from 'next-intl';
import {
  Button,
  DataTable,
  Dialog,
  EmptyState,
  Icon,
  SheetSection,
  StatusPill,
  Toast,
  cn,
  type DataTableColumn,
  type IconName,
} from '@ventora/ui';
import { useDataTableLabels } from '../labels';
import styles from './support.module.css';

/* HubSupportSession (Lotul 2.5c, S85–S98): bannerul, închiderea, toastul, lista sesiunilor. */

export type BannerSession = {
  founderName: string;
  /** Ora, deja formatată („16:30”). */
  expiresAt: string;
  /** Doar pentru proprietar și admin (R-SS1). */
  reason?: string;
  ticketRef?: string;
};

/** Bannerul de deasupra întregii pagini. Membrii nu văd motivul, cererea și butonul (S89). */
export function SupportBanner({
  session,
  manager,
  mob,
  onClose,
}: {
  session: BannerSession;
  manager: boolean;
  mob?: boolean;
  onClose?: () => void;
}) {
  const t = useTranslations('support.session.banner');
  const close = manager ? (
    <Button size="sm" icon="x" onPress={onClose}>
      {t('close')}
    </Button>
  ) : null;
  return (
    <div className={cn(styles.bar, mob && styles.barMob)} role="status">
      <Icon icon="eye" size={20} />
      <div className={styles.txt}>
        <p className="body-strong">{t('title')}</p>
        <p className="body-small">
          {t('message', { founderName: session.founderName, expiresAt: session.expiresAt })}{' '}
          <span className={styles.meta}>{t('readOnly')}</span>
        </p>
        {manager && (
          <p className={cn('body-small', styles.meta, styles.line)}>
            <span>{t('reason', { reason: session.reason ?? '' })}</span>
            <span>{t('ticketRef', { ticketRef: session.ticketRef ?? '' })}</span>
          </p>
        )}
        {mob && close && <div className={styles.act}>{close}</div>}
      </div>
      {!mob && close}
    </div>
  );
}

/** „Închide sesiunea” (S94): Dialogul de confirmare, fără `closeTitle`. */
export function CloseSupportDialog({
  inline,
  mob,
  pending,
  onCancel,
  onConfirm,
}: {
  inline?: boolean;
  mob?: boolean;
  pending?: boolean;
  onCancel?: () => void;
  onConfirm?: () => void;
}) {
  const t = useTranslations('support.session.banner');
  const ui = useTranslations('ui');
  return (
    <Dialog
      inline={inline}
      sheet={mob}
      title={t('close')}
      closeLabel={ui('close')}
      onClose={onCancel}
      footer={
        <>
          <Button variant="quiet" onPress={onCancel}>
            {t('cancel')}
          </Button>
          <Button variant="primary" icon="x" isPending={pending} onPress={onConfirm}>
            {t('close')}
          </Button>
        </>
      }
    >
      <p className="body">{t('closeConfirm')}</p>
    </Dialog>
  );
}

/** Toastul neutru de după închidere. */
export function SupportClosedToast({ onDismiss }: { onDismiss?: () => void }) {
  const t = useTranslations('support.session.banner');
  const ui = useTranslations('ui');
  return (
    <Toast tone="neutral" title={t('closed')} onDismiss={onDismiss} dismissLabel={ui('close')} />
  );
}

export type SessionRow = {
  id: string;
  who: string;
  reason: string;
  ticket: string;
  /** Când a fost deschisă, deja formatat („28 oct., 14:30”). */
  when: string;
  status:
    | { kind: 'active'; expiresAt: string }
    | { kind: 'closedBy'; name: string }
    | { kind: 'closedAuto' }
    | { kind: 'expired' };
};

function StatusOf({ s }: { s: SessionRow['status'] }) {
  const t = useTranslations('support.sessions.status');
  const [icon, text]: [IconName, string] =
    s.kind === 'active'
      ? ['eye', t('active', { expiresAt: s.expiresAt })]
      : s.kind === 'closedBy'
        ? ['x', t('closedBy', { name: s.name })]
        : s.kind === 'closedAuto'
          ? ['x', t('closedAuto')]
          : ['clock', t('expired')];
  return (
    <StatusPill tone="neutral" icon={icon}>
      {text}
    </StatusPill>
  );
}

/** Administrare · Roluri și acces → „Sesiuni de suport” (S91), paginat. */
export function SupportSessionsSection({
  rows,
  page,
  pageSize,
  total,
  onPageChange,
  onCloseSession,
  locale,
}: {
  rows: SessionRow[];
  page: number;
  pageSize: number;
  total: number;
  onPageChange?: (page: number) => void;
  onCloseSession?: (row: SessionRow) => void;
  locale?: string;
}) {
  const t = useTranslations('support');
  const labels = useDataTableLabels();
  const columns: DataTableColumn<SessionRow>[] = [
    { key: 'who', header: t('sessions.col.who'), primary: true },
    { key: 'reason', header: t('sessions.col.reason'), secondary: true },
    { key: 'ticket', header: t('sessions.col.ticket'), optional: true, muted: true },
    { key: 'when', header: t('sessions.col.when'), secondary: true },
    {
      key: 'status',
      header: t('sessions.col.status'),
      trailing: true,
      render: (r) => <StatusOf s={r.status} />,
    },
  ];
  return (
    <SheetSection title={t('sessions.title')} description={t('sessions.lead')}>
      {rows.length === 0 ? (
        <EmptyState size="sm" icon="eye" title={t('sessions.empty')} />
      ) : (
        <DataTable
          caption={t('sessions.title')}
          columns={columns}
          rows={rows}
          rowActions={(r) =>
            r.status.kind === 'active'
              ? [
                  {
                    label: t('session.banner.close'),
                    icon: 'x',
                    onClick: () => onCloseSession?.(r),
                  },
                ]
              : []
          }
          pagination={
            total > pageSize
              ? { page, pageSize, total, onPageChange: onPageChange ?? (() => {}) }
              : undefined
          }
          labels={labels}
          locale={locale}
        />
      )}
    </SheetSection>
  );
}
