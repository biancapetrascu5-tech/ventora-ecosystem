import { notFound } from 'next/navigation';
import { BookingClientManageGallery } from './client';

// preview.html (BookingClientManage) → its frames at 1280 / 820 / 390, light and dark, the S146
// link states with their DE / IT test and the S148 brand section. visual-check compares the first
// frame; the report has the pairs at 1280 and 390.
export default function BookingClientManageGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <BookingClientManageGallery />;
}
