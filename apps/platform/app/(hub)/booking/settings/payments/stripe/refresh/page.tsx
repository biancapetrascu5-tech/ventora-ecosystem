import { redirect } from 'next/navigation';
import { connectStripeAction } from '@/server/booking-stripe-actions';

export const dynamic = 'force-dynamic';

/* Lotul B.22a — linkul Stripe a expirat sau a fost folosit: proprietarul primește unul nou (Stripe
   cere ca refresh_url să facă exact asta). Ceilalți ajung înapoi în Setări · „Plăți și avans”. */
export default async function StripeRefreshPage() {
  const r = await connectStripeAction();
  redirect(r.ok ? r.value.url : '/booking/settings/payments');
}
