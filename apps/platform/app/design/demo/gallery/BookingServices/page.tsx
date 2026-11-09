import { notFound } from 'next/navigation';
import { BookingServicesGallery } from './client';

// preview.html (S123) → the 15 frames, each Desktop · 1280, Tabletă portret · 820, Telefon · 390,
// light and dark. visual-check compares the first frame; the report has all of them.
export default function BookingServicesGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <BookingServicesGallery />;
}
