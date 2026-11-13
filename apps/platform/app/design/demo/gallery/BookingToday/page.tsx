import { notFound } from 'next/navigation';
import { BookingTodayGallery } from './client';

// preview.html (BookingToday) → its frames: the screens (Desktop 1280, Tabletă 820, Telefon 390,
// light and dark) and the DE / IT label test. visual-check compares the first frame; the report has
// all of them.
export default function BookingTodayGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <BookingTodayGallery />;
}
