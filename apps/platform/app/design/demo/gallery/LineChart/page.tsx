/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { LineChart } from '@ventora/ui';
import { C3Pair } from '../_shared/QPair';
import { CHART_RO } from '../_shared/labels';

// preview.html → C3Themes → LCRo({ height: 220 }); datele AX_AN_* din preview
const MONTHS = [
  'nov.',
  'dec.',
  'ian.',
  'feb.',
  'mar.',
  'apr.',
  'mai',
  'iun.',
  'iul.',
  'aug.',
  'sep.',
  'oct.',
];
const REV = [36400, 44100, 33800, 35200, 39600, 41800, 43900, 45200, 38700, 34900, 43100, 48250];
const REV_LY = [32100, 39800, 30500, 31900, 35400, 37900, 39100, 41000, 36200, 33100, 39800, 43080];

function LCRo() {
  return (
    <LineChart
      title="Venituri pe lună"
      description="Ultimele 12 luni · octombrie e încă în curs"
      labels={MONTHS}
      nowIndex={11}
      nowLabel="în curs"
      series={[
        { label: 'Venituri 2025–2026', values: REV, color: 1 },
        { label: 'Cu un an înainte', values: REV_LY, color: 'compare' },
      ]}
      unit="lei"
      height={220}
      chartLabels={CHART_RO}
      locale="ro"
    />
  );
}

export default function LineChartGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <C3Pair render={() => <LCRo />} />;
}
