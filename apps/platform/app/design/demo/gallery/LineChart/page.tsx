'use client';
import { notFound } from 'next/navigation';
import { LineChart } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

const LABELS_MONTH = ['1 oct', '8 oct', '15 oct', '22 oct', '29 oct'];
const SERIES_SINGLE = [{ label: 'Programari', values: [42, 58, 55, 71, 68], color: 0 as const }];
const SERIES_MULTI = [
  { label: 'Venituri 2026', values: [12400, 15800, 14200, 18600, 17900], color: 0 as const },
  {
    label: 'Venituri 2025',
    values: [10200, 13100, 12800, 15200, 14600],
    color: 'compare' as const,
  },
];
const LABELS_WEEK = ['Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sam', 'Dum'];
const SERIES_WEEK = [
  { label: 'Programari azi', values: [8, 12, 10, 15, 14, 9, 5], color: 0 as const },
];

export default function LineChartGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="LineChart">
      <GallerySection label="Serie singulara" column>
        <LineChart
          title="Programari in octombrie"
          labels={LABELS_MONTH}
          series={SERIES_SINGLE}
          nowIndex={3}
          nowLabel="azi"
        />
      </GallerySection>
      <GallerySection label="Multi-serie cu comparare" column>
        <LineChart
          title="Venituri comparate"
          description="2026 fata de 2025"
          labels={LABELS_MONTH}
          series={SERIES_MULTI}
          unit="lei"
          nowIndex={3}
        />
      </GallerySection>
      <GallerySection label="Saptamanal" column>
        <LineChart title="Programari pe zile" labels={LABELS_WEEK} series={SERIES_WEEK} />
      </GallerySection>
    </GalleryShell>
  );
}
