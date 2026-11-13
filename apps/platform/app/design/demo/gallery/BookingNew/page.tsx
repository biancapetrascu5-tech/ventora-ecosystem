import { notFound } from 'next/navigation';
import { BookingNewGallery } from './client';

// preview.html (BookingNew) → its frames: the screens (Desktop 1280, Tabletă 820, Telefon 390,
// light and dark), the booking started from the client's profile with „Oricine e liber”, and the
// DE / IT label test. visual-check compares the first frame; the report has all of them.
export default function BookingNewGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <BookingNewGallery />;
}
