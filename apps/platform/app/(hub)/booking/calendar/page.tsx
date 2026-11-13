import { notFound, redirect } from 'next/navigation';
import { readCalendarPage } from '@/server/booking-calendar-actions';
import { CalendarScreen } from '@/screens/booking/CalendarScreen';

export const dynamic = 'force-dynamic';

/* EasyBook · Calendar (BookingCalendar; Lot B.6a, Decision 7, screen 1). booking:read: the whole
   team reads the calendar (D-B4-6 = a). Without the application active for the business, its page
   in the catalog. */
export default async function BookingCalendarPage() {
  const page = await readCalendarPage();
  if (page.kind === 'signedOut') redirect('/sign-in');
  if (page.kind === 'notEnabled') redirect('/applications/booking');
  if (page.kind === 'forbidden') notFound();
  return <CalendarScreen initial={page.data} />;
}
