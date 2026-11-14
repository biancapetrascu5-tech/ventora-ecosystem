import { notFound, redirect } from 'next/navigation';
import { readClientCard } from '@/server/booking-clients-actions';
import { ClientScreen } from '@/screens/booking/ClientScreen';

export const dynamic = 'force-dynamic';

/* EasyBook · „Fișa clientului” (BookingClientCard, S116 c; Decision 7, screen 4). booking:read;
   the whole history and the note only with booking:admin (S116-D11). „Programare nouă” and the
   appointment's detail link here with /booking/clients/{id}. */
export default async function BookingClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const page = await readClientCard(id);
  if (page.kind === 'signedOut') redirect('/sign-in');
  if (page.kind === 'notEnabled') redirect('/applications/booking');
  if (page.kind !== 'ok') notFound();
  return <ClientScreen initial={page.data} />;
}
