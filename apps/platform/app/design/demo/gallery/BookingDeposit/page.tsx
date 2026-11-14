import { notFound } from 'next/navigation';
import { BookingDepositGallery } from './client';

// preview.html (BookingDeposit) → its frames at 1280 and 390, light and dark, and the language
// tests. visual-check compares the first frame; the report has all of them.
export default function BookingDepositGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <BookingDepositGallery />;
}
