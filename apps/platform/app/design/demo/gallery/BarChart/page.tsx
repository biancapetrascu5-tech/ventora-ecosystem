'use client';
import { notFound } from 'next/navigation';
import { BarChart } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

const DATA_WEEK = [
  { label: 'Lun', value: 8 },
  { label: 'Mar', value: 12 },
  { label: 'Mie', value: 10 },
  { label: 'Joi', value: 15 },
  { label: 'Vin', value: 14, now: true, nowLabel: 'azi' },
  { label: 'Sam', value: 9 },
  { label: 'Dum', value: 5 },
];

const DATA_COMPARE = [
  { label: 'Ian', value: 42, compare: 38 },
  { label: 'Feb', value: 55, compare: 40 },
  { label: 'Mar', value: 61, compare: 52 },
  { label: 'Apr', value: 48, compare: 55 },
  { label: 'Mai', value: 72, compare: 60 },
  { label: 'Iun', value: 68, compare: 65 },
];

const DATA_HORIZONTAL = [
  { label: 'Booking', value: 432, share: '45%' },
  { label: 'CRM', value: 280, share: '29%' },
  { label: 'HR', value: 154, share: '16%' },
  { label: 'Finance', value: 98, share: '10%' },
];

export default function BarChartGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="BarChart">
      <GallerySection label="Vertical — saptamana curenta" column>
        <BarChart title="Programari pe zile" data={DATA_WEEK} />
      </GallerySection>
      <GallerySection label="Vertical — cu comparare" column>
        <BarChart
          title="Programari lunare"
          description="2026 vs 2025"
          data={DATA_COMPARE}
          compareLabel="2025"
        />
      </GallerySection>
      <GallerySection label="Orizontal — distributie" column>
        <BarChart
          title="Utilizare aplicatii"
          data={DATA_HORIZONTAL}
          orientation="horizontal"
          unit="sesiuni"
        />
      </GallerySection>
    </GalleryShell>
  );
}
