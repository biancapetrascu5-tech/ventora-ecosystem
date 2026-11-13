import { notFound } from 'next/navigation';
import { BookingDetailGallery } from './client';

// preview.html (BookingDetail) → its frames: the drawer over the list (Desktop 1280, Tabletă 820,
// Telefon 390, light and dark), the main button by state (în desfășurare, încheiată) and the DE / IT
// label test. visual-check compares the first frame; the report has all of them.
export default function BookingDetailGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <BookingDetailGallery />;
}
