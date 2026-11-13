import { notFound } from 'next/navigation';
import { BookingStatesGallery } from './client';

// preview.html (BookingStates) → its frames: the board of states in light and dark (RO), then the
// DE (light) and IT (dark) label test. visual-check compares the first frame; the report has all.
export default function BookingStatesGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <BookingStatesGallery />;
}
