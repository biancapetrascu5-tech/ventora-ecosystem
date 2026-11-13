import { renderAppointments } from '@/screens/booking/appointments-page';

export const dynamic = 'force-dynamic';

/* EasyBook · an appointment's detail in the Drawer over „Programări” (BookingDetail +
   BookingStatuses). „Azi” and the calendar open it with /booking/appointments/{id}. */
export default async function BookingAppointmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  return renderAppointments(q, id);
}
