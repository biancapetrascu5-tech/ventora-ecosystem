import { notFound } from 'next/navigation';
import { BookingMoneyGallery } from './client';

// preview.html (BookingMoney) → its 12 frames at 1280 / 820 / 390, light and dark. visual-check
// compares the first frame; the report has the pairs at 1280 and 390.
export default function BookingMoneyGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <BookingMoneyGallery />;
}
