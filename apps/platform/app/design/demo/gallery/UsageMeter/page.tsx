'use client';
import { notFound } from 'next/navigation';
import { UsageMeter } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

export default function UsageMeterGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="UsageMeter">
      <GallerySection label="Normal (sub 85%)" column>
        <div style={{ width: 320 }}>
          <UsageMeter label="Programari in octombrie" used={432} limit={1000} unit="programari" />
        </div>
        <div style={{ width: 320 }}>
          <UsageMeter label="Spatiu de stocare" used={2.4} limit={10} unit="GB" />
        </div>
      </GallerySection>
      <GallerySection label="Avertisment (85%+)" column>
        <div style={{ width: 320 }}>
          <UsageMeter label="Programari in octombrie" used={862} limit={1000} unit="programari" />
        </div>
      </GallerySection>
      <GallerySection label="Plin (100%)" column>
        <div style={{ width: 320 }}>
          <UsageMeter label="Programari in octombrie" used={1000} limit={1000} unit="programari" />
        </div>
        <div style={{ width: 320 }}>
          <UsageMeter
            label="Programari in octombrie"
            used={1000}
            limit={1000}
            unit="programari"
            onUpgrade={() => {}}
          />
        </div>
      </GallerySection>
      <GallerySection label="Compact (Spine)">
        <div style={{ width: 220 }}>
          <UsageMeter compact label="Programari in octombrie" used={862} limit={1000} />
        </div>
      </GallerySection>
      <GallerySection label="Fara limita" column>
        <div style={{ width: 320 }}>
          <UsageMeter label="Mesaje trimise" used={1247} unit="mesaje" />
        </div>
      </GallerySection>
    </GalleryShell>
  );
}
