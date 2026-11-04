'use server';

import './access-config';
import './billing-config';
import { headers } from 'next/headers';
import { authorize, PLATFORM_APPLICATION_ID } from '@ventora/access';
import {
  confirmCardSetup,
  confirmPurchase,
  getBillingAccount,
  previewPurchase,
  purchase,
  PurchaseRefused,
  startCardSetup,
  type PurchaseResult,
  type SavedCard,
} from '@ventora/billing';
import { billingPeriod, calendarDate, type PurchaseItem } from '@ventora/commercial';
import { Forbidden, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { getSession } from '@ventora/identity';
import { reportActionError } from './report-error';

/* Lotul 3.5 — plățile cu cardul din Hub (ARCHITECTURE §8.6, D-COM-6). Doar cine are
   `billing.purchase` (D3-8: owner-ul) salvează cardul și cumpără; afacerea vine din sesiune prin
   authorize(), niciodată din client, iar prețul se citește pe server. Ecranele care le folosesc
   (Lotul 3.7): HubAdminPlan și cumpărarea unui pachet (screens/plan), activarea unei aplicații
   (screens/apps); Stripe.js e în src/billing/stripe-client.ts.

   Erorile neașteptate merg în jurnal și în Sentry (reportActionError); refuzurile așteptate
   (la cerere, plată manuală, fără card) se întorc ca motiv, pentru „Cere activare”. */

export type BillingRefusal =
  | 'on_request'
  | 'manual_payment'
  | 'no_card'
  | 'needs_monthly_subscription'
  | 'subscription_not_on_card'
  | 'already_active'
  | 'not_available'
  | 'forbidden'
  | 'error';

type Refused = { ok: false; reason: BillingRefusal };

async function buyer() {
  const session = await getSession(await headers());
  if (!session) throw new Forbidden();
  return authorize({
    sessionToken: session.token,
    applicationId: PLATFORM_APPLICATION_ID,
    permission: 'billing.purchase',
  });
}

function refusal(action: string, err: unknown): Refused {
  reportActionError(action, err, { quietIfExpected: true });
  if (err instanceof PurchaseRefused) return { ok: false, reason: err.reason };
  if (err instanceof InvalidInput) {
    if (err.field === 'card') return { ok: false, reason: 'no_card' };
    if (err.field === 'interval') return { ok: false, reason: 'needs_monthly_subscription' };
    if (err.field === 'subscription') return { ok: false, reason: 'subscription_not_on_card' };
  }
  if (err instanceof ResourceNotFound) return { ok: false, reason: 'not_available' };
  if ((err as { code?: string }).code === 'CONFLICT')
    return { ok: false, reason: 'already_active' };
  if (err instanceof Forbidden || (err as { status?: number }).status === 403) {
    return { ok: false, reason: 'forbidden' };
  }
  return { ok: false, reason: 'error' };
}

/** Cardul salvat (marca, ultimele 4 cifre, expirarea) și cheia publică pentru Stripe.js. */
export async function readBilling(): Promise<
  | { ok: true; card: SavedCard | null; manualPayment: boolean; publishableKey: string | null }
  | Refused
> {
  try {
    const ctx = await buyer();
    return {
      ok: true,
      ...(await getBillingAccount(ctx)),
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? null,
    };
  } catch (err) {
    return refusal('readBilling', err);
  }
}

/** „Salvează cardul”: SetupIntent pentru StripeSlot; cardul se scrie în Stripe Elements. */
export async function startCard(): Promise<
  { ok: true; setupIntentId: string; clientSecret: string } | Refused
> {
  try {
    return { ok: true, ...(await startCardSetup(await buyer())) };
  } catch (err) {
    return refusal('startCard', err);
  }
}

/** După confirmarea din Stripe Elements: cardul salvat (și abonamentul plătit cu el). */
export async function confirmCard(
  setupIntentId: string,
): Promise<{ ok: true; card: SavedCard | null } | Refused> {
  try {
    return { ok: true, ...(await confirmCardSetup(await buyer(), setupIntentId)) };
  } catch (err) {
    return refusal('confirmCard', err);
  }
}

/**
 * Cât se plătește acum (și, pentru o linie a abonamentului, de la factura următoare). Lotul 3.7:
 * `until` e ziua până la care se plătește proporțional (următoarea plată a abonamentului); o
 * aplicație se poate previzualiza și fără card salvat (`card: null`), pentru dialogul care
 * salvează cardul în Stripe Elements înainte de plată.
 */
export async function previewBuy(item: PurchaseItem): Promise<
  | {
      ok: true;
      amountDueMinor: number;
      recurringMinor: number | null;
      setupMinor: number;
      currency: 'RON' | 'EUR';
      card: { brand: string; last4: string } | null;
      until: string | null;
    }
  | Refused
> {
  try {
    const p = await previewPurchase(await buyer(), item, {
      withoutCard: item.kind === 'application',
    });
    return {
      ok: true,
      amountDueMinor: p.amountDueMinor,
      recurringMinor: p.recurringMinor,
      setupMinor: p.quote.setupMinor,
      currency: p.quote.currency,
      card: p.card,
      until: p.quote.recurring
        ? billingPeriod(
            { startedOn: p.quote.startedOn, interval: p.quote.interval },
            calendarDate(new Date()),
          ).end
        : null,
    };
  } catch (err) {
    return refusal('previewBuy', err);
  }
}

/** Cumpărarea cu cardul salvat: gata, 3-D Secure (clientSecret pentru Stripe.js), în procesare sau refuzată de bancă. */
export async function buy(item: PurchaseItem): Promise<({ ok: true } & PurchaseResult) | Refused> {
  try {
    return { ok: true, ...(await purchase(await buyer(), item)) };
  } catch (err) {
    return refusal('buy', err);
  }
}

/** După 3-D Secure în dialog: starea plății, aplicată ca din webhook (oricare vine primul). */
export async function confirmBuy(
  purchaseId: string,
): Promise<({ ok: true } & PurchaseResult) | Refused> {
  try {
    return { ok: true, ...(await confirmPurchase(await buyer(), purchaseId)) };
  } catch (err) {
    return refusal('confirmBuy', err);
  }
}
