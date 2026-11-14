import { redirect } from 'next/navigation';
import { refreshStripeConnectionAction } from '@/server/booking-stripe-actions';

export const dynamic = 'force-dynamic';

/* Lotul B.22a — înapoi din formularul Stripe: starea contului se citește din nou, apoi Setări ·
   „Plăți și avans”. Fără sesiune sau fără drept: aceeași pagină decide (sign-in / 404). */
export default async function StripeReturnPage() {
  await refreshStripeConnectionAction();
  redirect('/booking/settings/payments');
}
