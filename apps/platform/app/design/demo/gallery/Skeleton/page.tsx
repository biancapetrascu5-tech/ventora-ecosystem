/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { Skeleton, SkeletonText } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

export default function SkeletonGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="Skeleton">
      <GallerySection label="Cu avatar + text + bloc" column>
        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'flex-start',
            padding: '1rem',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <Skeleton shape="circle" width={40} height={40} />
          <div style={{ flex: 1 }}>
            <SkeletonText lines={2} />
          </div>
        </div>
        <Skeleton shape="block" height={64} />
      </GallerySection>
      <GallerySection label="Text" column>
        <SkeletonText lines={4} />
      </GallerySection>
    </GalleryShell>
  );
}
