'use client';

import { useTranslations } from 'next-intl';
import {
  Button,
  DataTable,
  PageHeader,
  StatusPill,
  type DataTableAction,
  type DataTableColumn,
  type IconName,
} from '@ventora/ui';
import { useTableLabels } from '../BusinessesView';

/* GrowthCampaigns (Lotul 5.10b, S136, doar română): cine vede o ofertă, unde și când. „Deranj” =
   „Nu mă interesează” la 100 de afișări; peste prag (5%) campania se oprește singură. */

type Mode = 'desktop' | 'mobile';

export type GrowthCampaignState = 'active' | 'scheduled' | 'draft' | 'stopped' | 'autoStopped';

export type GrowthCampaignRow = {
  id: string;
  name: string;
  /** „Automat · integrare lipsă”, „Programat · 20–30 nov.” */
  mode: string;
  /** „ClientDesk · 69 lei pe lună” */
  offer: string;
  /** „EasyBook · Azi, Launcher” */
  slots: string;
  /** Procentul de deranj; null până la primele afișări (sau fără cifre). */
  annoy: number | null;
  state: GrowthCampaignState;
};

const PILL: Record<
  GrowthCampaignState,
  { tone: 'done' | 'neutral' | 'attention'; icon: IconName }
> = {
  active: { tone: 'done', icon: 'check' },
  scheduled: { tone: 'neutral', icon: 'clock' },
  draft: { tone: 'neutral', icon: 'pencil' },
  stopped: { tone: 'neutral', icon: 'lock' },
  autoStopped: { tone: 'attention', icon: 'triangle-alert' },
};

export function GrowthCampaignsView({
  mode = 'desktop',
  rows,
  thresholdPercent = 5,
  onNew,
  onEdit,
  onResults,
  onStop,
}: {
  mode?: Mode;
  rows: GrowthCampaignRow[];
  thresholdPercent?: number;
  onNew?: () => void;
  onEdit?: (row: GrowthCampaignRow) => void;
  onResults?: (row: GrowthCampaignRow) => void;
  onStop?: (row: GrowthCampaignRow) => void;
}) {
  const t = useTranslations('founder.growth.campaigns');
  const common = useTranslations('founder.growth.common');
  const labels = useTableLabels();
  const state = (s: GrowthCampaignState) =>
    s === 'active'
      ? common('activa')
      : s === 'scheduled'
        ? common('programata')
        : s === 'autoStopped'
          ? common('opritaDeranjPestePrag')
          : s === 'draft'
            ? t('draft')
            : t('stopped');

  const columns: DataTableColumn<GrowthCampaignRow>[] = [
    { key: 'name', header: common('campanie'), primary: true },
    { key: 'mode', header: common('mod'), secondary: true },
    { key: 'offer', header: common('oferta'), optional: true },
    { key: 'slots', header: t('sloturi'), optional: true, muted: true },
    {
      key: 'annoy',
      header: common('deranj'),
      optional: true,
      align: 'end',
      render: (r) =>
        r.annoy == null ? (
          <span className="muted">—</span>
        ) : (
          <span
            className="v-num"
            style={
              r.annoy > thresholdPercent
                ? { color: 'var(--attention-ink)', fontWeight: 600 }
                : undefined
            }
          >
            {r.annoy.toLocaleString('ro-RO')}%
          </span>
        ),
    },
    {
      key: 'state',
      header: common('stare'),
      trailing: true,
      render: (r) => (
        <StatusPill tone={PILL[r.state].tone} icon={PILL[r.state].icon}>
          {state(r.state)}
        </StatusPill>
      ),
    },
  ];
  const actions = (r: GrowthCampaignRow): DataTableAction[] => [
    { label: common('editeaza'), icon: 'pencil', onClick: () => onEdit?.(r) },
    { label: t('veziRezultatele'), icon: 'chart-line', onClick: () => onResults?.(r) },
    { separator: true },
    { label: t('opresteCampania'), icon: 'lock', destructive: true, onClick: () => onStop?.(r) },
  ];

  return (
    <>
      <PageHeader
        title={common('campanii')}
        description={mode === 'mobile' ? undefined : t('lead')}
        actions={
          <Button variant="primary" icon="plus" onPress={onNew}>
            {t('campanieNoua')}
          </Button>
        }
      />
      <DataTable
        caption={common('campanii')}
        columns={columns}
        rows={rows}
        rowActions={actions}
        onRowClick={onEdit}
        labels={labels}
        locale="ro"
      />
    </>
  );
}
