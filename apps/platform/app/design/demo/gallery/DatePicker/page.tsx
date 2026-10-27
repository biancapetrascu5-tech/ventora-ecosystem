'use client';
import { notFound } from 'next/navigation';
import { DatePicker } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

export default function DatePickerGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="DatePicker">
      <GallerySection label="Mod data — implicit" column>
        <DatePicker mode="date" placeholder="Selecteaza data" />
      </GallerySection>
      <GallerySection label="Mod data — cu valoare" column>
        <DatePicker mode="date" value="2026-10-27" placeholder="Selecteaza data" />
      </GallerySection>
      <GallerySection label="Mod interval" column>
        <DatePicker mode="range" placeholder="Selecteaza intervalul" />
      </GallerySection>
      <GallerySection label="Mod ora" column>
        <DatePicker mode="time" placeholder="Selecteaza ora" />
      </GallerySection>
      <GallerySection label="Dezactivat" column>
        <DatePicker mode="date" placeholder="Selecteaza data" disabled />
      </GallerySection>
    </GalleryShell>
  );
}
