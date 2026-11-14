'use server';

import './access-config';
import { headers } from 'next/headers';
import {
  disconnectStripe,
  getStripeConnection,
  refreshStripeConnection,
  startStripeConnection,
  type StripeConnection,
} from '@ventora/booking';
import { getSession } from '@ventora/identity';
import { reportActionError } from './report-error';

/* Lotul B.22a — EasyBook · Setări · „Plăți și avans” (BookingPayments, S116 d): contul Stripe al
   salonului. Afacerea și persoana vin doar din sesiune; contractele încep cu authorize()
   (booking:settings), iar conectarea și deconectarea sunt doar ale proprietarului. Ecranul îl leagă
   agentul UI. */

export type PaymentsActionError = 'forbidden' | 'failed';
export type PaymentsActionResult<T> =
  { ok: true; value: T } | { ok: false; error: PaymentsActionError };

const codeOf = (err: unknown) => (err as { code?: string } | null)?.code;

async function run<T>(
  action: string,
  fn: (token: string) => Promise<T>,
): Promise<PaymentsActionResult<T>> {
  const session = await getSession(await headers());
  if (!session?.token) return { ok: false, error: 'forbidden' };
  try {
    return { ok: true, value: await fn(session.token) };
  } catch (err) {
    reportActionError(action, err, { quietIfExpected: true });
    const code = codeOf(err);
    if (code === 'FORBIDDEN' || code === 'NOT_AUTHENTICATED' || code === 'APP_NOT_ENABLED')
      return { ok: false, error: 'forbidden' };
    return { ok: false, error: 'failed' };
  }
}

export async function readStripeConnection(): Promise<PaymentsActionResult<StripeConnection>> {
  return run('booking.payments.stripe.read', (sessionToken) =>
    getStripeConnection({ sessionToken }),
  );
}

/** „Conectează Stripe” / „Continuă” / „Rezolvă în Stripe”: the URL of Stripe's form. */
export async function connectStripeAction(): Promise<PaymentsActionResult<{ url: string }>> {
  return run('booking.payments.stripe.connect', (sessionToken) =>
    startStripeConnection({ sessionToken }),
  );
}

export async function disconnectStripeAction(): Promise<PaymentsActionResult<StripeConnection>> {
  return run('booking.payments.stripe.disconnect', (sessionToken) =>
    disconnectStripe({ sessionToken }),
  );
}

export async function refreshStripeConnectionAction(): Promise<
  PaymentsActionResult<StripeConnection>
> {
  return run('booking.payments.stripe.refresh', (sessionToken) =>
    refreshStripeConnection({ sessionToken }),
  );
}
