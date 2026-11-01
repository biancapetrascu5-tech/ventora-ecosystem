import { loadStripe, type Stripe, type StripeElements } from '@stripe/stripe-js';

/* Lotul 3.5 — Stripe.js în browser (D3-19): datele cardului se scriu doar în câmpul Stripe
   (Payment Element, montat în StripeSlot) și nu ajung niciodată la Ventora (§8.6). Aici sunt doar
   pașii fără text propriu: încărcarea, montarea câmpului, confirmarea cardului salvat și 3-D Secure
   pentru o plată. Dialogul care le folosește (AddonPurchase, cu textele lui) se montează în
   ecranele Lotului 3.7 (HubAdminPlan, cumpărarea unui pachet). */

const loaded = new Map<string, Promise<Stripe | null>>();

/** Stripe.js, o singură dată pe cheie publică (`readBilling().publishableKey`). */
export function stripeClient(publishableKey: string): Promise<Stripe | null> {
  let promise = loaded.get(publishableKey);
  if (!promise) {
    promise = loadStripe(publishableKey);
    loaded.set(publishableKey, promise);
  }
  return promise;
}

export interface CardForm {
  stripe: Stripe;
  elements: StripeElements;
  unmount: () => void;
}

/** Câmpul de card al Stripe în `container` (interiorul StripeSlot), pentru SetupIntent-ul din `startCard()`. */
export async function mountCardForm(
  publishableKey: string,
  clientSecret: string,
  container: HTMLElement,
  locale: 'ro' | 'en' | 'fr' | 'es' | 'de' | 'it',
): Promise<CardForm> {
  const stripe = await stripeClient(publishableKey);
  if (!stripe) throw new Error('[billing] Stripe.js could not be loaded');
  const elements = stripe.elements({ clientSecret, locale });
  const field = elements.create('payment', { layout: 'tabs' });
  field.mount(container);
  return { stripe, elements, unmount: () => field.destroy() };
}

/**
 * „Salvează cardul”: confirmarea în Stripe (cu 3-D Secure, dacă banca îl cere). Apoi
 * `confirmCard(setupIntentId)` îl înregistrează; webhook-ul face același lucru.
 */
export async function confirmCardForm(
  form: CardForm,
): Promise<{ setupIntentId: string } | { error: string }> {
  const { error, setupIntent } = await form.stripe.confirmSetup({
    elements: form.elements,
    redirect: 'if_required',
  });
  if (error || !setupIntent) return { error: error?.message ?? 'setup_failed' };
  return { setupIntentId: setupIntent.id };
}

/**
 * 3-D Secure pentru o plată cu cardul salvat (`buy()` → `requires_action`): confirmarea băncii
 * în dialog; apoi `confirmBuy(purchaseId)`. Dacă dialogul se închide, plata se activează tot,
 * din webhook.
 */
export async function completeThreeDSecure(
  publishableKey: string,
  clientSecret: string,
): Promise<{ ok: true } | { error: string }> {
  const stripe = await stripeClient(publishableKey);
  if (!stripe) return { error: 'stripe_unavailable' };
  const { error } = await stripe.handleNextAction({ clientSecret });
  return error ? { error: error.message ?? 'authentication_failed' } : { ok: true };
}
