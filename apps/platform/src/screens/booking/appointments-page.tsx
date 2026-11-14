import { notFound, redirect } from 'next/navigation';
import {
  readAppointmentsPage,
  type ListPeriod,
  type ListState,
} from '@/server/booking-appointments-actions';
import { AppointmentsScreen } from '@/screens/booking/AppointmentsScreen';

/* EasyBook · „Programări” (the part of BookingList the detail stands on) and the detail of an
   appointment in a Drawer (BookingDetail + BookingStatuses; Lot B.6a / B.6b, Decision 7, screen 3).
   booking:read: the whole team (D-B4-6 = a); the actions only with booking:write. Without the
   application active for the business, its page in the catalog. */
type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);
const PERIODS: ListPeriod[] = ['today', 'week', 'month', 'all'];
const STATES: ListState[] = ['active', 'unconfirmed', 'cancelled'];

export async function renderAppointments(q: Search, openId: string | null) {
  const period = (PERIODS as string[]).includes(one(q.period) ?? '')
    ? (one(q.period) as ListPeriod)
    : 'today';
  const state = (STATES as string[]).includes(one(q.state) ?? '')
    ? (one(q.state) as ListState)
    : 'active';
  const filters = { period, state, staffId: one(q.staff) ?? 'all', query: one(q.q) ?? '' };
  const page = await readAppointmentsPage(filters);
  if (page.kind === 'signedOut') redirect('/sign-in');
  if (page.kind === 'notEnabled') redirect('/applications/booking');
  if (page.kind === 'forbidden') notFound();
  return <AppointmentsScreen initial={page.data} filters={filters} openId={openId} />;
}
