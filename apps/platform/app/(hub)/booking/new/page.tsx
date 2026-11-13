import { notFound, redirect } from 'next/navigation';
import { readNewPage } from '@/server/booking-new-actions';
import { NewScreen } from '@/screens/booking/NewScreen';

export const dynamic = 'force-dynamic';

/* EasyBook · „Programare nouă” (BookingNew; Lot B.6c, Decision 7, screen 2). booking:write (D-B4-6
   = a: a member books only for themselves). The calendar opens it with `?service=&staff=&date=
   &time=` (an empty time or „Primul loc liber”); a client's profile with `?client=` (the client
   comes first). Without the application active for the business, its page in the catalog. */
type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

export default async function BookingNewPage({ searchParams }: { searchParams: Promise<Search> }) {
  const q = await searchParams;
  const page = await readNewPage({ clientId: one(q.client) });
  if (page.kind === 'signedOut') redirect('/sign-in');
  if (page.kind === 'notEnabled') redirect('/applications/booking');
  if (page.kind === 'forbidden') notFound();
  return (
    <NewScreen
      initial={page.data}
      start={{
        serviceId: one(q.service),
        staffId: one(q.staff),
        date: one(q.date),
        time: one(q.time),
      }}
    />
  );
}
