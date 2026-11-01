import { describe, it, expect, afterAll } from 'vitest';
import Stripe from 'stripe';
import { SdkStripeGateway } from '../stripe';

// Lot 3.5 — the real gateway against the Stripe TEST account, locally only: it runs when
// STRIPE_SECRET_KEY is a test key (sk_test_…) and is skipped everywhere else (CI has no keys).
// Stripe's test cards: pm_card_visa (goes through), pm_card_chargeDeclined (refused),
// pm_card_authenticationRequired (3-D Secure). What it creates is removed at the end.

const key = process.env.STRIPE_SECRET_KEY ?? '';
const live = key.startsWith('sk_test_');
const stripe = live ? new Stripe(key) : (null as unknown as Stripe);
const gateway = live ? new SdkStripeGateway(stripe) : (null as unknown as SdkStripeGateway);
const RUN = crypto.randomUUID().slice(0, 8);
const created: { customers: string[]; subscriptions: string[] } = {
  customers: [],
  subscriptions: [],
};

afterAll(async () => {
  if (!live) return;
  for (const id of created.subscriptions) await stripe.subscriptions.cancel(id).catch(() => {});
  for (const id of created.customers) await stripe.customers.del(id).catch(() => {});
});

async function customerWith(card: string) {
  const { id: customerId } = await gateway.createCustomer({
    organizationId: crypto.randomUUID(),
    name: `Ventora test ${RUN}`,
    idempotencyKey: `test-customer-${RUN}-${card}-${crypto.randomUUID().slice(0, 8)}`,
  });
  created.customers.push(customerId);
  const si = await gateway.createSetupIntent({ customerId, organizationId: 'test' });
  // what Stripe Elements does in the browser
  await stripe.setupIntents.confirm(si.id, { payment_method: card });
  const confirmed = await gateway.retrieveSetupIntent(si.id);
  return { customerId, setupIntent: confirmed };
}

describe.skipIf(!live)('Lot 3.5 — the real Stripe gateway (test mode)', () => {
  it('a card saved with a SetupIntent: only brand, last 4 and expiry come back', async () => {
    const { customerId, setupIntent } = await customerWith('pm_card_visa');
    expect(setupIntent).toMatchObject({ status: 'succeeded', customerId });
    const card = await gateway.retrieveCard(setupIntent.paymentMethodId!);
    expect(card).toMatchObject({ brand: 'visa', last4: '4242', customerId });
    expect(Object.keys(card).sort()).toEqual(
      ['brand', 'customerId', 'expMonth', 'expYear', 'last4', 'paymentMethodId'].sort(),
    );
  });

  it('a PaymentIntent with the saved card: succeeded / refused by the bank / 3-D Secure', async () => {
    const ok = await customerWith('pm_card_visa');
    const paid = await gateway.createPaymentIntent({
      customerId: ok.customerId,
      paymentMethodId: ok.setupIntent.paymentMethodId!,
      amountMinor: 4900,
      currency: 'RON',
      description: 'Ventora test',
      metadata: { purchase_id: crypto.randomUUID() },
      idempotencyKey: `test-pi-${RUN}-ok`,
    });
    expect(paid).toMatchObject({ status: 'succeeded', amountMinor: 4900, currency: 'RON' });
    expect(paid.chargeId).toMatch(/^(ch|py)_/);

    const declinedCustomer = await gateway.createCustomer({
      organizationId: crypto.randomUUID(),
      name: null,
      idempotencyKey: `test-customer-${RUN}-declined`,
    });
    created.customers.push(declinedCustomer.id);
    // attached fine, refused when charged (pm_card_chargeDeclined is refused already at attach)
    const declinedPm = await stripe.paymentMethods.attach('pm_card_chargeCustomerFail', {
      customer: declinedCustomer.id,
    });
    const refused = await gateway.createPaymentIntent({
      customerId: declinedCustomer.id,
      paymentMethodId: declinedPm.id,
      amountMinor: 4900,
      currency: 'RON',
      description: 'Ventora test',
      metadata: {},
      idempotencyKey: `test-pi-${RUN}-declined`,
    });
    expect(refused).toMatchObject({
      status: 'requires_payment_method',
      failureCode: 'generic_decline',
    });
    expect(refused.failureMessage).toBeTruthy();

    const threeDsCustomer = await gateway.createCustomer({
      organizationId: crypto.randomUUID(),
      name: null,
      idempotencyKey: `test-customer-${RUN}-3ds`,
    });
    created.customers.push(threeDsCustomer.id);
    const threeDsPm = await stripe.paymentMethods.attach('pm_card_authenticationRequired', {
      customer: threeDsCustomer.id,
    });
    const action = await gateway.createPaymentIntent({
      customerId: threeDsCustomer.id,
      paymentMethodId: threeDsPm.id,
      amountMinor: 4900,
      currency: 'EUR',
      description: 'Ventora test',
      metadata: {},
      idempotencyKey: `test-pi-${RUN}-3ds`,
    });
    expect(action.status).toBe('requires_action');
    expect(action.clientSecret).toBeTruthy();
  });

  it('prices and coupons are created once; the subscription is anchored and its lines change without proration', async () => {
    const { customerId, setupIntent } = await customerWith('pm_card_visa');
    await gateway.setDefaultPaymentMethod(customerId, setupIntent.paymentMethodId!);
    const spec = {
      lookupKey: `vnt_test_${RUN}_bundle_RON_month_34900`,
      productKey: `test_${RUN}_bundle`,
      productName: `Ventora test bundle ${RUN}`,
      currency: 'RON' as const,
      unitAmountMinor: 34900,
      interval: 'month' as const,
    };
    const price = await gateway.ensurePrice(spec);
    expect(await gateway.ensurePrice(spec)).toBe(price);
    const coupon = await gateway.ensureCoupon({
      id: `vnt_test_${RUN}`,
      name: 'Reducere 20%',
      percentOff: 20,
      amountOffMinor: null,
      currency: 'RON',
      duration: 'repeating',
      durationMonths: 3,
    });
    expect(await gateway.ensureCoupon({ id: coupon } as never)).toBe(coupon);

    const anchor = new Date(Date.now() + 10 * 86_400_000);
    const sub = await gateway.createSubscription({
      customerId,
      paymentMethodId: setupIntent.paymentMethodId!,
      items: [{ ref: 'bundle', priceId: price, quantity: 1, couponIds: [] }],
      couponIds: [coupon],
      billingCycleAnchor: anchor,
      trialEnd: null,
      metadata: { organization_id: 'test' },
      idempotencyKey: `test-sub-${RUN}`,
    });
    created.subscriptions.push(sub.id);
    expect(sub.status).toBe('active');
    expect(sub.items.map((i) => i.ref)).toEqual(['bundle']);
    expect(sub.couponIds).toEqual([coupon]);
    expect(Math.abs(sub.currentPeriodEnd!.getTime() - anchor.getTime())).toBeLessThan(2000);

    const packPrice = await gateway.ensurePrice({
      ...spec,
      lookupKey: `vnt_test_${RUN}_pack_RON_month_6000`,
      productKey: `test_${RUN}_pack`,
      productName: 'Pachet test',
      unitAmountMinor: 6000,
    });
    const withPack = await gateway.updateSubscription(sub.id, {
      add: [{ ref: `pack:${crypto.randomUUID()}`, priceId: packPrice, quantity: 2, couponIds: [] }],
      remove: [],
      change: [],
      couponIds: [],
      prorateAdded: false,
    });
    expect(withPack.items).toHaveLength(2);
    expect(withPack.couponIds).toEqual([]);
    const pack = withPack.items.find((i) => i.ref?.startsWith('pack:'))!;
    const canceled = await gateway.updateSubscription(sub.id, {
      add: [],
      remove: [pack.id],
      change: [],
      prorateAdded: false,
      cancelAtPeriodEnd: true,
    });
    expect(canceled.items.map((i) => i.ref)).toEqual(['bundle']);
    expect(canceled.cancelAtPeriodEnd).toBe(true);
  });
});
