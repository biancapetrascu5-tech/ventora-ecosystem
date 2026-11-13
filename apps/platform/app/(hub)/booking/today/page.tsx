import { notFound, redirect } from 'next/navigation';
import { readTodayPage } from '@/server/booking-today-actions';
import { readHubShell } from '@/server/shell-actions';
import { TodayScreen } from '@/screens/booking/TodayScreen';
import { TodayErrorScreen } from '@/screens/booking/TodayErrorScreen';

export const dynamic = 'force-dynamic';

/* EasyBook · „Azi” (BookingToday; Lot B.6b, Decision 7, screen 1). booking:read: the whole team
   (D-B4-6 = a); the quick actions only with booking:write. Without the application active for the
   business, its page in the catalog. */
export default async function BookingTodayPage() {
  // BookingStates „Azi · eroare la încărcare”: a failed read shows the retry, not an error page
  const [page, shell] = await Promise.all([
    readTodayPage().catch(() => ({ kind: 'error' as const })),
    readHubShell(),
  ]);
  if (page.kind === 'error') return <TodayErrorScreen />;
  if (page.kind === 'signedOut') redirect('/sign-in');
  if (page.kind === 'notEnabled') redirect('/applications/booking');
  if (page.kind === 'forbidden') notFound();
  return <TodayScreen initial={page.data} userName={shell?.user.name ?? ''} />;
}
