/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { Avatar, AvatarGroup } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

const PEOPLE = [
  'Ana Popescu',
  'Andrei Ionescu',
  'Bianca Marin',
  'Cristina Dobre',
  'Dan Stoica',
  'Elena Georgescu',
  'Ioana Pavel',
].map((name) => ({ name }));

export default function AvatarGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="Avatar">
      <GallerySection label="Mărimi">
        {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((s) => (
          <Avatar key={s} size={s} name="Bianca Petrașcu" />
        ))}
      </GallerySection>
      <GallerySection label="Stare">
        <Avatar name="Ioana Pavel" status="done" />
        <Avatar name="Mara Enache" status="attention" />
        <Avatar name="Radu Matei" status="offline" />
        <Avatar name="Salon Aurora" shape="square" />
      </GallerySection>
      <GallerySection label="Grup">
        <AvatarGroup people={PEOPLE} max={4} />
        <AvatarGroup people={PEOPLE.slice(0, 3)} size="md" />
      </GallerySection>
    </GalleryShell>
  );
}
