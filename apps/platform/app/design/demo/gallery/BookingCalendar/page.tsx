import { notFound } from 'next/navigation';
import { BookingCalendarGallery } from './client';

// preview.html (BookingCalendar) → its frames: the screens (Desktop 1280, Tabletă 820, Telefon 390,
// light and dark), „Primul loc liber” and the DE / IT label test. visual-check compares the first
// frame; the report has all of them.
export default function BookingCalendarGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <BookingCalendarGallery />;
}
