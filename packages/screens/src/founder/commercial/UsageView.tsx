'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  BarChart,
  DataTable,
  LineChart,
  PageHeader,
  StatusPill,
  type ChartLabels,
  type DataTableColumn,
} from '@ventora/ui';
import { useIsPhone } from '../../screens/hooks';
import { useTableLabels } from '../BusinessesView';
import styles from '../business.module.css';
import s from './commercial.module.css';

/* FounderUsage (Lotul 3.4, doar română): cum se folosesc limitele în toate afacerile — cele patru
   cifre, afacerile aproape de limită pe resursă, consumul pe zi, lista afacerilor peste 80% cu
   data estimată a atingerii limitei („Prea devreme” sub 7 zile de date în perioadă) și „Adaugă o
   excepție”. Cifrele vin din ecran; nu se inventează nimic. */

export type UsageRow = {
  id: string | number;
  business: string;
  resource: string;
  /** „920 din 1.000” */
  usage: string;
  /** „26 oct.”, „Atinsă” sau „Prea devreme” (cu nota). */
  estimate: ReactNode;
  /** „92%” sau „La limită” */
  status: string;
};

export function useChartLabels(): ChartLabels {
  const t = useTranslations('founder.chart');
  return { viewTable: t('viewTable'), viewChart: t('viewChart'), millions: t('millions') };
}

export function UsageView({
  lead,
  stats,
  byResource,
  daily,
  rows,
  onOpen,
  onException,
  phone: phoneProp,
}: {
  /** „Cum se folosesc limitele în toate afacerile, în octombrie, până azi.” */
  lead: string;
  /** Cele patru cifre (Stat), din ecran. */
  stats: ReactNode;
  byResource: { label: string; value: number }[];
  daily: {
    title: string;
    description: string;
    labels: string[];
    values: number[];
    nowIndex?: number;
  };
  rows: UsageRow[];
  onOpen: (row: UsageRow) => void;
  onException: (row: UsageRow) => void;
  phone?: boolean;
}) {
  const t = useTranslations('founder.usage');
  const labels = useTableLabels();
  const chartLabels = useChartLabels();
  const viewportPhone = useIsPhone();
  const phone = phoneProp ?? viewportPhone;
  const columns: DataTableColumn<UsageRow>[] = [
    { key: 'business', header: t('col.business'), primary: true },
    { key: 'resource', header: t('col.resource'), secondary: true },
    {
      key: 'usage',
      header: t('col.usage'),
      secondary: true,
      render: (r) => <span className="v-num">{r.usage}</span>,
    },
    { key: 'estimate', header: t('col.estimate'), optional: true, render: (r) => r.estimate },
    {
      key: 'status',
      header: t('col.status'),
      trailing: true,
      render: (r) => (
        <StatusPill tone="attention" icon="triangle-alert">
          {r.status}
        </StatusPill>
      ),
    },
  ];
  return (
    <>
      <PageHeader title={t('title')} description={phone ? undefined : lead} />
      <div className={styles.axb}>
        {stats}
        <div className={s.charts}>
          <BarChart
            orientation="horizontal"
            title={t('byResource')}
            description={t('byResourceHelp')}
            data={byResource}
            unit={t('businessesUnit')}
            chartLabels={chartLabels}
            locale="ro"
          />
          <LineChart
            title={daily.title}
            description={daily.description}
            labels={daily.labels}
            series={[{ label: t('smsSeries'), values: daily.values }]}
            nowIndex={daily.nowIndex}
            nowLabel={t('inProgress')}
            height={220}
            chartLabels={chartLabels}
            locale="ro"
          />
        </div>
        <DataTable
          caption={t('caption')}
          columns={columns}
          rows={rows}
          rowActions={(r) => [
            { label: t('open'), icon: 'external-link', onClick: () => onOpen(r) },
            { label: t('addException'), icon: 'sliders-horizontal', onClick: () => onException(r) },
          ]}
          empty={<p className="body muted">{t('empty')}</p>}
          labels={labels}
          locale="ro"
        />
      </div>
    </>
  );
}

/** „Prea devreme” · „Estimăm data după primele 7 zile ale lunii.” (FounderStates) */
export function TooEarly() {
  const t = useTranslations('founder.usage');
  return (
    <span className={s.tight}>
      <span className="body-small muted">{t('tooEarly')}</span>
      <span className="caption muted">{t('tooEarlyHelp')}</span>
    </span>
  );
}
