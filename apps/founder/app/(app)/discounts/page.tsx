import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getFounderSession } from '@ventora/identity';
import { readActiveDiscounts, readNewRequestsCount } from '@/server/commercial-actions';
import { DiscountsScreen } from '@/screens/commercial/DiscountsScreen';

export const dynamic = 'force-dynamic';

/* „Reduceri” (Lotul 3.4, S113): reducerile permanente din toate afacerile. */
export default async function DiscountsRoute() {
  const session = await getFounderSession(await headers());
  if (!session) redirect('/sign-in');
  const [discounts, requestsBadge] = await Promise.all([
    readActiveDiscounts(),
    readNewRequestsCount(),
  ]);
  if (!discounts) throw new Error('[founder] discounts unavailable');
  return (
    <DiscountsScreen
      user={{ name: session.name }}
      discounts={discounts}
      requestsBadge={requestsBadge}
    />
  );
}
