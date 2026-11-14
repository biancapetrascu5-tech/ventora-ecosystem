import { notFound } from 'next/navigation';
import { BookingPublicGallery } from './client';

// preview.html (BookingPublic) → its frames at 1280 and 390, light and dark, the language tests
// and the S148 brand section. visual-check compares the first frame; the report has all of them.
export default function BookingPublicGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <BookingPublicGallery />;
}
