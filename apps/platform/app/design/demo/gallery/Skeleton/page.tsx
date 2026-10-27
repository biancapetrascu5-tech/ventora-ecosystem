'use client';
import { notFound } from 'next/navigation';
import { Skeleton, SkeletonText } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

export default function SkeletonGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="Skeleton">
      <GallerySection label="Block — diverse dimensiuni" column>
        <Skeleton shape="block" width={320} height={20} />
        <Skeleton shape="block" width={240} height={20} />
        <Skeleton shape="block" width={180} height={20} />
      </GallerySection>
      <GallerySection label="Circle">
        <Skeleton shape="circle" width={40} height={40} />
        <Skeleton shape="circle" width={32} height={32} />
        <Skeleton shape="circle" width={24} height={24} />
      </GallerySection>
      <GallerySection label="Card skeleton" column>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Skeleton shape="circle" width={40} height={40} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
            <Skeleton shape="block" width={160} height={16} />
            <Skeleton shape="block" width={100} height={14} />
          </div>
        </div>
      </GallerySection>
      <GallerySection label="SkeletonText" column>
        <div style={{ width: 320 }}>
          <SkeletonText lines={3} />
        </div>
        <div style={{ width: 320 }}>
          <SkeletonText lines={5} />
        </div>
      </GallerySection>
    </GalleryShell>
  );
}
