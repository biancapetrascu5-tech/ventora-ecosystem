import { notFound, redirect } from 'next/navigation';
import { readServicesPage } from '@/server/booking-services-actions';
import { ServicesScreen } from '@/screens/booking/ServicesScreen';

export const dynamic = 'force-dynamic';

/* EasyBook · Setări · „Servicii” (BookingServices, S123; Lot B.1-UI). S123-1: the only page of
   the catalog, opened also from Spine · „Servicii”. S123-8: only for booking:settings (owner,
   admin, application_manager); the others get 404. Without the application active for the
   business, its page in the catalog. `?view=archived`: the „Arhivate” filter. */
export default async function BookingServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const page = await readServicesPage();
  if (page.kind === 'signedOut') redirect('/sign-in');
  if (page.kind === 'notEnabled') redirect('/applications/booking');
  if (page.kind === 'forbidden') notFound();
  const view = (await searchParams).view === 'archived' ? 'archived' : 'active';
  return <ServicesScreen initial={page.data} initialView={view} />;
}
