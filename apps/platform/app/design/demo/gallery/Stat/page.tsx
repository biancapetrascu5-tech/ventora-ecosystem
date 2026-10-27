'use client';
import { notFound } from 'next/navigation';
import { Stat, StatGroup } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

export default function StatGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="Stat">
      <GallerySection label="Simple — fara delta" column>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <Stat label="Programari azi" value={12} />
          <Stat label="Clienti activi" value={248} />
          <Stat label="Venituri octombrie" value="18.420" unit="lei" />
        </div>
      </GallerySection>
      <GallerySection label="Cu delta" column>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <Stat
            label="Programari luna aceasta"
            value={862}
            delta={{ value: '+12%', period: 'fata de luna trecuta', direction: 'up', good: true }}
          />
          <Stat
            label="Clienti noi"
            value={34}
            delta={{ value: '-8%', period: 'fata de luna trecuta', direction: 'down', good: false }}
          />
          <Stat
            label="Venituri"
            value="18.420"
            unit="lei"
            delta={{ value: '+5.2%', period: 'fata de oct 2025', direction: 'up', good: true }}
          />
        </div>
      </GallerySection>
      <GallerySection label="Cu tone" column>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <Stat label="Rezervari online" value={7} tone="attention" hint="De confirmat" />
          <Stat label="Locuri libere azi" value={3} tone="done" />
          <Stat label="Programari anulate" value={2} tone="danger" />
        </div>
      </GallerySection>
      <GallerySection label="StatGroup" column>
        <StatGroup>
          <Stat
            label="Programari azi"
            value={12}
            delta={{ value: '+2', direction: 'up', good: true }}
          />
          <Stat
            label="Venituri azi"
            value="2.840"
            unit="lei"
            delta={{ value: '+420 lei', direction: 'up', good: true }}
          />
          <Stat label="Clienti noi" value={4} />
          <Stat label="Anulate" value={1} tone="danger" />
        </StatGroup>
      </GallerySection>
    </GalleryShell>
  );
}
