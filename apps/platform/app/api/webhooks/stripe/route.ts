import * as Sentry from '@sentry/nextjs';
import { handleStripeWebhook, WebhookSignatureError } from '@ventora/billing';
import { summarizeError } from '@ventora/errors';
import '@/server/billing-config';
import { safeErrorForSentry } from '@/server/report-error';

/* Webhook-ul Stripe (Lotul 3.5, FAZA-3 §3.5). Corpul brut, ca Stripe să-i poată verifica semnătura
   (STRIPE_WEBHOOK_SECRET); o semnătură greșită → 400, fără niciun efect. Restul e în core/billing:
   event.id procesat o singură dată, afacerea aflată din clientul Stripe, ordinea greșită a
   evenimentelor nu dă starea înapoi. O eroare → 500 (jurnal + Sentry), iar Stripe reîncearcă. */

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  try {
    const outcome = await handleStripeWebhook(body, request.headers.get('stripe-signature'));
    if (outcome.disputeOpened) {
      // decizia rămâne la Founder (§3.5): echipa află din Sentry până există un canal Founder
      Sentry.captureMessage('Stripe: dispută deschisă', {
        level: 'warning',
        tags: {
          app: 'platform',
          area: 'billing',
          organizationId: outcome.organizationId ?? 'unknown',
        },
        extra: { eventId: outcome.eventId },
      });
    }
    return Response.json({ received: true, status: outcome.status });
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      console.warn('[platform] stripe webhook: invalid signature');
      return Response.json({ received: false }, { status: 400 });
    }
    const summary = summarizeError(err);
    console.error('[platform] stripe webhook failed', summary);
    Sentry.captureException(safeErrorForSentry(err, summary), {
      tags: { app: 'platform', area: 'billing', ...(summary.code ? { code: summary.code } : {}) },
    });
    return Response.json({ received: false }, { status: 500 });
  }
}
