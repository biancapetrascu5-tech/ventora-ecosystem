import { redirect } from 'next/navigation';

/* EasyBook opens on „Azi” (BookingToday, Lot B.6b); until B.6b it led to Setări · „Servicii”. */
export default function BookingRedirect(): never {
  redirect('/booking/today');
}
