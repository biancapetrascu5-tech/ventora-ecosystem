'use client';
import { notFound } from 'next/navigation';
import { RuleBuilder } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

const CRITERIA = [
  {
    value: 'industrie',
    label: 'Industrie',
    operators: ['este', 'nu este'],
    values: [
      { value: 'beauty', label: 'Beauty & Wellness' },
      { value: 'food', label: 'Food & Beverage' },
      { value: 'retail', label: 'Retail' },
    ],
  },
  {
    value: 'angajati',
    label: 'Numar angajati',
    operators: ['mai mic de', 'mai mare de', 'intre'],
    unit: 'angajati',
  },
  {
    value: 'abonament',
    label: 'Plan abonament',
    operators: ['este', 'nu este'],
    values: ['Starter', 'Growth', 'Business', 'Enterprise'],
  },
  {
    value: 'inregistrat',
    label: 'Inregistrat acum',
    operators: ['mai putin de', 'mai mult de'],
    unit: 'zile',
  },
];

const INITIAL_RULES = [
  { id: 'r1', criterion: 'industrie', operator: 'este', value: 'beauty' },
  { id: 'r2', criterion: 'angajati', operator: 'mai mare de', value: '3' },
];

export default function RuleBuilderGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="RuleBuilder">
      <GallerySection label="Cu reguli initiale" column>
        <div style={{ maxWidth: 640 }}>
          <RuleBuilder
            criteria={CRITERIA}
            rules={INITIAL_RULES}
            estimate={247}
            estimateLabel="organizatii estimate"
          />
        </div>
      </GallerySection>
      <GallerySection label="Gol (nicio regula)" column>
        <div style={{ maxWidth: 640 }}>
          <RuleBuilder criteria={CRITERIA} rules={[]} estimateLabel="organizatii estimate" />
        </div>
      </GallerySection>
    </GalleryShell>
  );
}
