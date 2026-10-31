'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  APPS,
  AppIcon,
  Avatar,
  Button,
  DataTable,
  PageHeader,
  StatusPill,
  type AppName,
  type DataTableAction,
  type DataTableColumn,
} from '@ventora/ui';
import { useDataTableLabels } from '../labels';
import s from './team.module.css';

/* HubAdminTeam (Lot 2.8): membrii afacerii (rol, aplicații, stare) și invitațiile în așteptare
   (trimisă, termenul, „Retrimite” pe cea expirată). Vedere fără logică: containerul (TeamScreen)
   și galeria /design îi dau datele și acțiunile. Ce n-are încă contract nu apare în aplicație:
   locurile ocupate („4 din 10 angajați”, comercial, F3), „Invită o persoană” (formularul nu e
   desenat) și meniul rândului unui membru (rolul, accesul, oprirea, eliminarea). */

export type TeamMemberRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  /** null: owner și admin au toate aplicațiile afacerii (ADR-0004). */
  apps: AppName[] | null;
  stopped: boolean;
  owner: boolean;
};

export type TeamInviteRow = {
  id: string;
  email: string;
  role: string;
  /** „22 oct.” */
  sent: string;
  /** „29 oct.” — data expirării (viitoare sau trecută). */
  until: string;
  expired: boolean;
  /** Lot 2.7 · C: cel invitat a cerut o invitație nouă (newLinkRequestedAt). */
  newLinkRequested: boolean;
};

const MAX_APPS = 5;

export function TeamView({
  business,
  members,
  invites,
  seats,
  onInvite,
  memberActions,
  onResend,
  onCopyLink,
  onCancel,
}: {
  business: string;
  members: TeamMemberRow[];
  invites: TeamInviteRow[];
  /** Locurile ocupate, lângă „Invită o persoană” (comercial, F3). */
  seats?: ReactNode;
  onInvite?: () => void;
  memberActions?: (row: TeamMemberRow) => DataTableAction[];
  onResend: (row: TeamInviteRow) => void;
  onCopyLink?: (row: TeamInviteRow) => void;
  onCancel: (row: TeamInviteRow) => void;
}) {
  const t = useTranslations('hub.team');
  const labels = useDataTableLabels();

  const memberCols: DataTableColumn<TeamMemberRow>[] = [
    {
      key: 'name',
      header: t('colName'),
      primary: true,
      render: (r) => (
        <span className={s.person}>
          <Avatar name={r.name} size="sm" />
          <span className={s.who}>
            <span>{r.name}</span>
            <span className="body-small muted">{r.email}</span>
          </span>
        </span>
      ),
    },
    { key: 'role', header: t('colRole'), secondary: true },
    {
      key: 'apps',
      header: t('colApps'),
      render: (r) =>
        r.apps ? (
          <span className={s.apps}>
            {r.apps.slice(0, MAX_APPS).map((a) => (
              <AppIcon key={a} app={a} size={20} title={APPS[a]?.name} />
            ))}
            {r.apps.length > MAX_APPS && (
              <span className="caption muted">+{r.apps.length - MAX_APPS}</span>
            )}
          </span>
        ) : null,
    },
    {
      key: 'status',
      header: t('colStatus'),
      trailing: true,
      render: (r) => (
        <StatusPill tone={r.stopped ? 'neutral' : 'done'}>
          {r.stopped ? t('stopped') : t('active')}
        </StatusPill>
      ),
    },
  ];

  const inviteCols: DataTableColumn<TeamInviteRow>[] = [
    {
      key: 'email',
      header: t('colEmail'),
      primary: true,
      render: (r) =>
        r.newLinkRequested ? (
          <span className={s.who}>
            <span>{r.email}</span>
            <span className="body-small muted">{t('newLinkRequested')}</span>
          </span>
        ) : (
          r.email
        ),
    },
    { key: 'role', header: t('colRole'), secondary: true },
    {
      key: 'sent',
      header: t('colSent'),
      secondary: true,
      render: (r) => (
        <span>
          {r.sent} ·{' '}
          <span className="muted">
            {r.expired ? t('expired', { date: r.until }) : t('expires', { date: r.until })}
          </span>
        </span>
      ),
    },
    {
      key: 'status',
      header: t('colStatus'),
      trailing: true,
      render: (r) => (
        <span className={s.status}>
          <StatusPill tone={r.expired ? 'attention' : 'neutral'}>
            {r.expired ? t('statusExpired') : t('statusPending')}
          </StatusPill>
          {r.expired && (
            <Button size="sm" icon="send" onPress={() => onResend(r)}>
              {t('resend')}
            </Button>
          )}
        </span>
      ),
    },
  ];

  const inviteActions = (r: TeamInviteRow): DataTableAction[] => [
    { label: t('resendInvitation'), icon: 'send', onClick: () => onResend(r) },
    ...(onCopyLink
      ? [{ label: t('copyLink'), icon: 'copy' as const, onClick: () => onCopyLink(r) }]
      : []),
    { separator: true },
    { label: t('cancelInvitation'), icon: 'x', destructive: true, onClick: () => onCancel(r) },
  ];

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('lead', { business })}
        actions={
          seats || onInvite ? (
            <>
              {seats}
              {onInvite && (
                <Button variant="primary" icon="user-plus" onPress={onInvite}>
                  {t('invite')}
                </Button>
              )}
            </>
          ) : undefined
        }
      />
      <DataTable
        caption={t('members')}
        columns={memberCols}
        rows={members}
        rowActions={memberActions}
        labels={labels}
      />
      {invites.length > 0 && (
        <div>
          <h2 className={`heading ${s.pendingHead}`}>{t('pending')}</h2>
          <DataTable
            caption={t('invitations')}
            columns={inviteCols}
            rows={invites}
            rowActions={inviteActions}
            labels={labels}
          />
        </div>
      )}
    </>
  );
}
