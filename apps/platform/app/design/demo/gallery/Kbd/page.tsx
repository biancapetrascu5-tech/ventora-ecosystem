/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { Kbd } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

export default function KbdGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="Kbd">
      <GallerySection label="Taste">
        <Kbd keys={['mod', 'K']} />
        <Kbd keys={['shift', 'N']} />
        <Kbd keys={['Esc']} />
        <Kbd keys={['up', 'down']} />
        <Kbd keys={['enter']} />
      </GallerySection>
    </GalleryShell>
  );
}
