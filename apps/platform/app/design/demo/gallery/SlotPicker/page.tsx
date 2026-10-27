'use client';
import { notFound } from 'next/navigation';
import { SlotPicker } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

const SLOTS_MORNING = [
  { time: '09:00', available: true },
  { time: '09:30', available: true },
  { time: '10:00', available: false },
  { time: '10:30', available: true },
  { time: '11:00', available: true },
  { time: '11:30', available: false },
  { time: '12:00', available: true },
];

const SLOTS_AFTERNOON = [
  { time: '13:00', available: true },
  { time: '13:30', available: false },
  { time: '14:00', available: false },
  { time: '14:30', available: true },
  { time: '15:00', available: true },
  { time: '15:30', available: true },
  { time: '16:00', available: false },
  { time: '16:30', available: true },
];

export default function SlotPickerGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="SlotPicker">
      <GallerySection label="Dimineata — fara selectie" column>
        <div style={{ maxWidth: 360 }}>
          <SlotPicker label="Dimineata" slots={SLOTS_MORNING} />
        </div>
      </GallerySection>
      <GallerySection label="Dimineata — cu selectie" column>
        <div style={{ maxWidth: 360 }}>
          <SlotPicker label="Dimineata" slots={SLOTS_MORNING} value="10:30" />
        </div>
      </GallerySection>
      <GallerySection label="Dupa-amiaza" column>
        <div style={{ maxWidth: 360 }}>
          <SlotPicker label="Dupa-amiaza" slots={SLOTS_AFTERNOON} value="14:30" />
        </div>
      </GallerySection>
    </GalleryShell>
  );
}
