import { notFound } from 'next/navigation';
import { BookingLimitGallery } from './client';

// preview.html (BookingLimit) → its frames: the limit reached while creating an appointment
// (Desktop 1280, Tabletă 820, Telefon 390; light = the owner, dark = a member) and the DE / IT
// label test. visual-check compares the first frame; the report has all of them.
export default function BookingLimitGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <BookingLimitGallery />;
}
