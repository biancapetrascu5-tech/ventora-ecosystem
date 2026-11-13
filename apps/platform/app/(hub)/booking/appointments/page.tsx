import { renderAppointments } from '@/screens/booking/appointments-page';

export const dynamic = 'force-dynamic';

/* EasyBook · „Programări” (Lot B.6a / B.6b, Decision 7, screen 3): the list the detail stands on. */
export default async function BookingAppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return renderAppointments(await searchParams, null);
}
