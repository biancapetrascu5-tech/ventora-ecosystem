import { notFound } from 'next/navigation';
import { BookingMessageTemplatesGallery } from './client';

// preview.html (S127) → the 7 frames, each Desktop · 1280, Tabletă portret · 820, Telefon · 390,
// light and dark. visual-check compares the first frame; the report has all of them.
export default function BookingMessageTemplatesGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <BookingMessageTemplatesGallery />;
}
