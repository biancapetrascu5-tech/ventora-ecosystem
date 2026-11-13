import { notFound } from 'next/navigation';
import { BookingStatusesGallery } from './client';

// preview.html (BookingStatuses) → its frames: the map of the 7 states and a drawer per state
// (Desktop 1280, Telefon 390, light and dark), then the pills in the 6 languages. visual-check
// compares the first frame; the report has all of them.
export default function BookingStatusesGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <BookingStatusesGallery />;
}
