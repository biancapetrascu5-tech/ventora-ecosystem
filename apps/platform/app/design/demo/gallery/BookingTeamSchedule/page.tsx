import { notFound } from 'next/navigation';
import { BookingTeamScheduleGallery } from './client';

// preview.html (S124) → the 10 frames, each Desktop · 1280, Tabletă portret · 820, Telefon · 390,
// light and dark. visual-check compares the first frame; the report has all of them.
export default function BookingTeamScheduleGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <BookingTeamScheduleGallery />;
}
