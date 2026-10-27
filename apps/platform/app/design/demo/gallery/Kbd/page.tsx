'use client';
import { notFound } from 'next/navigation';
import { Kbd } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

export default function KbdGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="Kbd">
      <GallerySection label="Taste simple">
        <Kbd keys={['Enter']} />
        <Kbd keys={['Escape']} />
        <Kbd keys={['Tab']} />
        <Kbd keys={['Space']} />
        <Kbd keys={['Backspace']} />
      </GallerySection>
      <GallerySection label="Combinatii">
        <Kbd keys={['Cmd', 'S']} />
        <Kbd keys={['Cmd', 'K']} />
        <Kbd keys={['Cmd', 'Shift', 'P']} />
        <Kbd keys={['Ctrl', 'Alt', 'Delete']} />
        <Kbd keys={['Cmd', 'Z']} />
        <Kbd keys={['Cmd', 'Shift', 'Z']} />
      </GallerySection>
      <GallerySection label="Taste directionale">
        <Kbd keys={['ArrowUp']} />
        <Kbd keys={['ArrowDown']} />
        <Kbd keys={['ArrowLeft']} />
        <Kbd keys={['ArrowRight']} />
      </GallerySection>
    </GalleryShell>
  );
}
