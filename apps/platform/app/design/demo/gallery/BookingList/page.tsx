import { notFound } from 'next/navigation';
import { BookingListGallery } from './client';

// preview.html (BookingList) → its frames: the list (1280 / 820 / 390, light and dark), the states
// „fără rezultate” and „export”, then the DE / IT label test. visual-check compares the first frame.
export default function BookingListGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <BookingListGallery />;
}
