'use client';
import { notFound } from 'next/navigation';
import { Avatar, AvatarGroup } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

export default function AvatarGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="Avatar">
      <GallerySection label="Dimensiuni">
        <Avatar name="Ana Popescu" size="xs" />
        <Avatar name="Bianca Marin" size="sm" />
        <Avatar name="Cristina Dobre" size="md" />
        <Avatar name="Dan Stoica" size="lg" />
        <Avatar name="Elena Georgescu" size="xl" />
      </GallerySection>
      <GallerySection label="Cu status">
        <Avatar name="Ioana Pavel" size="md" status="done" />
        <Avatar name="Mara Enache" size="md" status="attention" />
        <Avatar name="Radu Matei" size="md" status="offline" />
      </GallerySection>
      <GallerySection label="Shape square">
        <Avatar name="Booking" size="sm" shape="square" />
        <Avatar name="CRM" size="md" shape="square" />
        <Avatar name="HR" size="lg" shape="square" />
      </GallerySection>
      <GallerySection label="AvatarGroup">
        <AvatarGroup
          people={[
            { name: 'Ana Popescu' },
            { name: 'Bianca Marin' },
            { name: 'Cristina Dobre' },
            { name: 'Dan Stoica' },
            { name: 'Elena Georgescu' },
            { name: 'Florin Ionescu' },
          ]}
          max={4}
          size="md"
        />
      </GallerySection>
    </GalleryShell>
  );
}
