import { notFound } from 'next/navigation';
import { BookingClientCardGallery } from './client';

// preview.html (BookingClientCard) → its frames: the owner, the member, „Șterge nota…”, the note
// removed (1280 / 390, light and dark), then the DE / IT label test. visual-check: the first frame.
export default function BookingClientCardGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <BookingClientCardGallery />;
}
