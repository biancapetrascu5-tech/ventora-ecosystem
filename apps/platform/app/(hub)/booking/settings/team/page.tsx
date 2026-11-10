import { notFound, redirect } from 'next/navigation';
import { readTeamPage } from '@/server/booking-team-actions';
import { TeamScreen } from '@/screens/booking/TeamScreen';

export const dynamic = 'force-dynamic';

/* EasyBook · Setări · „Programul echipei” (BookingTeamSchedule, S124; Lot B.2-UI). Decision 2: the
   Spine's „Echipa” opens this tab. Decision 3: only for booking:settings (owner, admin,
   application_manager); the others get 404. Without the application active for the business, its
   page in the catalog. */
export default async function BookingTeamPage() {
  const page = await readTeamPage();
  if (page.kind === 'signedOut') redirect('/sign-in');
  if (page.kind === 'notEnabled') redirect('/applications/booking');
  if (page.kind === 'forbidden') notFound();
  return <TeamScreen initial={page.data} />;
}
