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

/* GrowthOffers (Lotul 5.10a, S136, doar română): lista ofertelor — tipul, acțiunea (deschide mereu
   UpgradeDialog), textele aprobate din 6, starea. O ofertă leagă un obiect din modelul comercial de
   textele ei; costurile nu se scriu de mână. */

type Mode = 'desktop' | 'mobile';

export type GrowthOfferKind = 'app' | 'addon' | 'trial' | 'plan' | 'bundle';
export type GrowthOfferState = 'active' | 'review' | 'draft' | 'stopped';

export type GrowthOfferRow = {
  id: string;
  name: string;
  kind: GrowthOfferKind;
  approved: number;
  total: number;
  state: GrowthOfferState;
};

const PILL: Record<GrowthOfferState, { tone: 'done' | 'neutral' | 'attention'; icon: IconName }> = {
  active: { tone: 'done', icon: 'check' },
  review: { tone: 'neutral', icon: 'clock' },
  draft: { tone: 'neutral', icon: 'pencil' },
  stopped: { tone: 'attention', icon: 'lock' },
};

export function GrowthOffersView({
  mode = 'desktop',
  rows,
  onNew,
  onEdit,
  onDuplicate,
  onStop,
}: {
  mode?: Mode;
  rows: GrowthOfferRow[];
  onNew?: () => void;
  onEdit?: (row: GrowthOfferRow) => void;
  onDuplicate?: (row: GrowthOfferRow) => void;
  onStop?: (row: GrowthOfferRow) => void;
}) {
  const t = useTranslations('founder.growth.offers');
  const common = useTranslations('founder.growth.common');
  const labels = useTableLabels();

  const kind = (k: GrowthOfferKind) =>
    k === 'app'
      ? t('aplicatie')
      : k === 'addon'
        ? t('addon')
        : k === 'trial'
          ? common('perioadaDeProba')
          : t('abonament');
  const action = (k: GrowthOfferKind) =>
    k === 'app'
      ? common('veziOptiunile')
      : k === 'addon'
        ? common('cumpara')
        : k === 'trial'
          ? t('tryFree')
          : t('cereAltAbonament');
  const state = (s: GrowthOfferState) =>
    s === 'active'
      ? common('activa')
      : s === 'review'
        ? t('review')
        : s === 'draft'
          ? t('ciorna')
          : t('stopped');

  const columns: DataTableColumn<GrowthOfferRow>[] = [
    { key: 'name', header: common('oferta'), primary: true },
    { key: 'kind', header: t('tip'), secondary: true, render: (r) => kind(r.kind) },
    { key: 'action', header: t('actiune'), optional: true, render: (r) => action(r.kind) },
    {
      key: 'texts',
      header: t('texteAprobate'),
      optional: true,
      render: (r) => (
        <span className="v-num">{t('textsOf', { n: r.approved, total: r.total })}</span>
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
  const actions = (r: GrowthOfferRow): DataTableAction[] => [
    { label: common('editeaza'), icon: 'pencil', onClick: () => onEdit?.(r) },
    { label: t('duplica'), icon: 'copy', onClick: () => onDuplicate?.(r) },
    { separator: true },
    { label: t('opresteOferta'), icon: 'lock', destructive: true, onClick: () => onStop?.(r) },
  ];

  return (
    <>
      <PageHeader
        title={common('oferte')}
        description={mode === 'mobile' ? undefined : t('lead')}
        actions={
          <Button variant="primary" icon="plus" onPress={onNew}>
            {t('ofertaNoua')}
          </Button>
        }
      />
      <DataTable
        caption={common('oferte')}
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
