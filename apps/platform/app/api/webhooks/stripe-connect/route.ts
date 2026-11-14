import * as Sentry from '@sentry/nextjs';
import { ConnectNotificationSignatureError, parseConnectNotification } from '@ventora/billing';
import { refreshStripeAccountFromNotification } from '@ventora/booking';
import { summarizeError } from '@ventora/errors';
import { safeErrorForSentry } from '@/server/report-error';

/* Lotul B.22a — notificările conturilor Stripe ale saloanelor (Connect, evenimente v2 „thin”,
   STRIPE_CONNECT_WEBHOOK_SECRET). Corpul brut, ca semnătura să poată fi verificată; o semnătură
   greșită → 400, fără efect. Notificarea spune doar ce cont s-a schimbat: starea lui se citește din
   nou de la Stripe și se scrie în contextul afacerii, deci aceeași notificare primită de două ori
   dă aceeași stare. O eroare → 500, iar Stripe reîncearcă. */

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  try {
    const n = parseConnectNotification(body, request.headers.get('stripe-signature'));
    const known = n.accountId ? await refreshStripeAccountFromNotification(n.accountId) : false;
    return Response.json({ received: true, account: known ? 'updated' : 'ignored' });
  } catch (err) {
    if (err instanceof ConnectNotificationSignatureError) {
      console.warn('[platform] stripe connect webhook: invalid signature');
      return Response.json({ received: false }, { status: 400 });
    }
    const summary = summarizeError(err);
    console.error('[platform] stripe connect webhook failed', summary);
    Sentry.captureException(safeErrorForSentry(err, summary), {
      tags: {
        app: 'platform',
        area: 'booking-connect',
        ...(summary.code ? { code: summary.code } : {}),
      },
    });
    return Response.json({ received: false }, { status: 500 });
  }
}
