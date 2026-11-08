import { permanentRedirect } from 'next/navigation';

/* Lot B.1-UI (S123-1): the catalog of services has one page, in Setări · „Servicii”. Until the
   EasyBook screens of B.6 exist, /booking, /booking/settings and /booking/services lead there. */
export default function BookingRedirect(): never {
  permanentRedirect('/booking/settings/services');
}
