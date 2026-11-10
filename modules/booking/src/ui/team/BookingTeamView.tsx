'use client';

import {
  Avatar,
  Button,
  DataTable,
  EmptyState,
  Icon,
  Notice,
  Sheet,
  SheetSection,
  type DataTableAction,
  type DataTableColumn,
  type IconName,
} from '@ventora/ui';
import { useTableLabels } from '../services/texts';
import type { ScreenMode } from '../services/BookingServicesView';
import type { BusinessDayData, IntervalData } from './team-format';
import { weekText } from './team-format';
import { useTeamTexts, type StaffNextData } from './team-texts';
import sv from '../services/services.module.css';
import s from './team.module.css';

/* BookingTeamSchedule (S124): EasyBook · Setări · „Programul echipei” — the members in the calendar
   (their week and what comes next) and the ones no longer in the team. Members join and leave from
   Hub · Echipă și invitații: no „add” or „remove” here. Only props: the page and the gallery. */

export type TeamMemberRow = {
  id: string;
  name: string;
  /** The role in Hub (owner / admin / member), shown under the name (decision 4). */
  role: string;
  week: { weekday: number; intervals: IntervalData[] }[];
  next: StaffNextData;
};
export type RemovedMemberRow = {
  id: string;
  name: string;
  /** The role under the name, when known (the contract has none for them: decision 4). */
  role?: string;
  /** „Scos din calendar pe {date}”, already formatted. */
  since: string;
  /** B.4: the past appointments that stay in the history; null until they exist. */
  past: number | null;
};
/** B.4: someone who left with future appointments (the Notice on top). */
export type LeftWithBookings = { name: string; count: number };

export type BookingTeamViewProps = {
  mode: ScreenMode;
  business: readonly BusinessDayData[];
  members: TeamMemberRow[];
  removed: RemovedMemberRow[];
  leftWithBookings?: LeftWithBookings | null;
  onEdit?: (id: string) => void;
  onException?: (id: string) => void;
  onLeave?: (id: string) => void;
  onBusinessEdit?: () => void;
  onBookings?: () => void;
  onOpenTeam?: () => void;
};

const NEXT_ICON: Record<string, IconName> = { leave: 'plane', off: 'calendar-off', other: 'clock' };

function Person({ name, role, muted }: { name: string; role?: string; muted?: boolean }) {
  return (
    <span className={s.person}>
      <Avatar name={name} size="sm" status={muted ? 'offline' : undefined} />
      <span className={s.pname}>
        <span className={`body-strong${muted ? ' muted' : ''}`}>{name}</span>
        {role ? <span className="body-small muted">{role}</span> : null}
      </span>
    </span>
  );
}

export function BookingTeamView(p: BookingTeamViewProps) {
  const x = useTeamTexts();
  const { t } = x;
  const labels = useTableLabels();
  const mob = p.mode === 'mobile';

  if (p.members.length === 0 && p.removed.length === 0) {
    return (
      <div className={sv.body}>
        <Sheet>
          <SheetSection>
            <EmptyState
              icon="users"
              title={t('empty.title')}
              description={t('empty.body')}
              actions={
                <Button variant="secondary" icon="external-link" onPress={p.onOpenTeam}>
                  {t('empty.action')}
                </Button>
              }
            />
          </SheetSection>
        </Sheet>
      </div>
    );
  }

  const columns: DataTableColumn<TeamMemberRow>[] = [
    {
      key: 'name',
      header: t('col.member'),
      primary: true,
      render: (r) => <Person name={r.name} role={x.role(r.role)} />,
    },
    {
      key: 'week',
      header: t('col.week'),
      secondary: true,
      render: (r) => weekText(r.week, x.dayShort) || t('week.dayOff'),
    },
    {
      key: 'next',
      header: t('col.next'),
      optional: true,
      width: '200px',
      render: (r) =>
        r.next ? (
          <span className={s.next}>
            <Icon icon={NEXT_ICON[r.next.kind] ?? 'clock'} size={14} />
            {x.next(r.next)}
          </span>
        ) : (
          <span className="muted">{x.next(null)}</span>
        ),
    },
  ];
  const actions = (r: TeamMemberRow): DataTableAction[] => [
    { label: t('action.edit'), icon: 'pencil', onClick: () => p.onEdit?.(r.id) },
    { label: t('action.exception'), icon: 'calendar-off', onClick: () => p.onException?.(r.id) },
    { label: t('action.leave'), icon: 'plane', onClick: () => p.onLeave?.(r.id) },
  ];
  const removedColumns: DataTableColumn<RemovedMemberRow>[] = [
    {
      key: 'name',
      header: t('col.member'),
      primary: true,
      render: (r) => <Person name={r.name} role={r.role ? x.role(r.role) : undefined} muted />,
    },
    {
      key: 'since',
      header: '',
      secondary: true,
      render: (r) => t('inactive.since', { date: r.since }),
    },
    ...(p.removed.some((r) => r.past !== null)
      ? [
          {
            key: 'past',
            header: '',
            trailing: true,
            render: (r: RemovedMemberRow) =>
              r.past === null ? null : (
                <span className="body-small muted">{x.pastCount(r.past)}</span>
              ),
          },
        ]
      : []),
  ];

  return (
    <div className={sv.body}>
      {p.leftWithBookings ? (
        <div className={mob ? s.pad : undefined}>
          <Notice
            className={sv.notice}
            tone="attention"
            icon="calendar-clock"
            title={t('inactive.future.title', {
              name: p.leftWithBookings.name,
              n: p.leftWithBookings.count,
            })}
          >
            <div className={sv.stack}>
              <p>{t('inactive.future.body')}</p>
              <div>
                <Button size="sm" variant="secondary" icon="arrow-right" onPress={p.onBookings}>
                  {t('inactive.future.action')}
                </Button>
              </div>
            </div>
          </Notice>
        </div>
      ) : null}
      <Sheet>
        <SheetSection
          title={t('title')}
          description={t('business', { text: x.business(p.business) })}
          actions={
            mob ? undefined : (
              <Button size="sm" variant="quiet" icon="settings" onPress={p.onBusinessEdit}>
                {t('businessEdit')}
              </Button>
            )
          }
        >
          <DataTable
            caption={t('title')}
            columns={columns}
            rows={p.members}
            rowActions={actions}
            onRowClick={(r) => p.onEdit?.(r.id)}
            labels={labels}
          />
        </SheetSection>
        {p.removed.length > 0 && (
          <SheetSection title={t('inactive.title')} description={t('inactive.lead')}>
            <div className={sv.stack}>
              <DataTable
                caption={t('inactive.title')}
                columns={removedColumns}
                rows={p.removed}
                labels={labels}
              />
              <p className={`${sv.xline} body-small`}>
                <Icon icon="info" size={16} />
                {t('inactive.why')}
              </p>
            </div>
          </SheetSection>
        )}
      </Sheet>
    </div>
  );
}
