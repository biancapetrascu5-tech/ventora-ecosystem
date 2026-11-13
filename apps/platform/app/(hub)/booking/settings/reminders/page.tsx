import { permanentRedirect } from 'next/navigation';

/* B.14b (S127): the „Reamintiri” tab is now „Mesaje”. */
export default function BookingRemindersRedirect(): never {
  permanentRedirect('/booking/settings/messages');
}
