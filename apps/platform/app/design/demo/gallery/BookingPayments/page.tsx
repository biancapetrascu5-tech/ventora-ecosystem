import { notFound } from 'next/navigation';
import { BookingPaymentsGallery } from './client';

// preview.html (BookingPayments) → its frames at 1280 and 390, light and dark, and the DE / IT
// label test. visual-check compares the first frame; the report has all of them.
export default function BookingPaymentsGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <BookingPaymentsGallery />;
}
