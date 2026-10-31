import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession, getUserById } from '@ventora/identity';
import { supportEmail } from '@ventora/notifications';
import { readSuspendedBusiness } from '@/server/session-actions';
import { BusinessSuspendedScreen } from '@/screens/auth/BusinessSuspendedScreen';

export const dynamic = 'force-dynamic';

/* HubBusinessSuspended (S112, Lot 2.9b): în locul alegerii afacerii, când singura afacere a
   persoanei e suspendată (D3-20 a). Altfel nu are ce arăta: înapoi la Hub. */
export default async function BusinessSuspendedPage() {
  const session = await getSession(await headers());
  if (!session) redirect('/sign-in');
  const business = await readSuspendedBusiness();
  if (!business) redirect('/');
  const user = await getUserById(session.userId);
  return (
    <BusinessSuspendedScreen
      userName={user?.name ?? ''}
      business={business.name}
      supportEmail={supportEmail()}
    />
  );
}
