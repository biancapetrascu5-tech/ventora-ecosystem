import { notFound, redirect } from 'next/navigation';
import { readMessagesPage } from '@/server/booking-messages-actions';
import { MessagesScreen } from '@/screens/booking/MessagesScreen';

export const dynamic = 'force-dynamic';

/* EasyBook · Setări · „Mesaje” (BookingMessageTemplates, S127; Lot B.14b). Only for booking:settings
   (owner, admin, application_manager); the others get 404. Without the application active for the
   business, its page in the catalog. */
export default async function BookingMessagesPage() {
  const page = await readMessagesPage();
  if (page.kind === 'signedOut') redirect('/sign-in');
  if (page.kind === 'notEnabled') redirect('/applications/booking');
  if (page.kind === 'forbidden') notFound();
  return <MessagesScreen initial={page.data} />;
}
