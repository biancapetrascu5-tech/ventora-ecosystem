import type {
  CardDetails,
  CouponSpec,
  CreateSubscriptionInput,
  PaymentIntentState,
  PriceSpec,
  SetupIntentState,
  StripeGateway,
  SubscriptionState,
  UpdateSubscriptionInput,
} from '../stripe';

/*
 * A Stripe for the integration tests (CI has no Stripe keys): the same gateway shape, in memory,
 * with the behaviour of Stripe's test cards —
 *   pm_card_visa                  → the payment goes through (Visa •••• 4242)
 *   pm_card_chargeCustomerFail    → saved, then refused when charged: „Your card was declined.”
 *   pm_card_threeDSecure2Required → requires_action until the test completes 3-D Secure
 *   pm_card_processing            → processing (the bank answers later)
 * The events the webhook gets are built from the same objects (`eventFor`).
 */

const CARDS: Record<string, Omit<CardDetails, 'paymentMethodId' | 'customerId'>> = {
  pm_card_visa: { brand: 'visa', last4: '4242', expMonth: 12, expYear: 2034 },
  pm_card_chargeCustomerFail: { brand: 'visa', last4: '0341', expMonth: 12, expYear: 2034 },
  pm_card_threeDSecure2Required: { brand: 'visa', last4: '3220', expMonth: 12, expYear: 2034 },
  pm_card_processing: { brand: 'mastercard', last4: '4444', expMonth: 12, expYear: 2034 },
};

let n = 0;
const kindOf = (paymentMethodId: string) => paymentMethodId.split('__')[0]!;
// unique across runs on the same test database (the rows of an earlier run stay)
const RUN = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
const id = (prefix: string) => `${prefix}_test${RUN}${(++n).toString(36).padStart(6, '0')}`;

export class FakeStripe implements StripeGateway {
  customers = new Map<string, { organizationId: string; defaultPm: string | null }>();
  setupIntents = new Map<string, SetupIntentState>();
  paymentIntents = new Map<string, PaymentIntentState & { paymentMethodId: string }>();
  prices = new Map<string, PriceSpec & { id: string }>();
  coupons = new Map<string, CouponSpec>();
  subscriptions = new Map<
    string,
    SubscriptionState & { anchor: Date | null; trialEnd: Date | null }
  >();
  calls: string[] = [];
  private idempotency = new Map<string, unknown>();

  async createCustomer(input: {
    organizationId: string;
    name: string | null;
    idempotencyKey: string;
  }) {
    const known = this.idempotency.get(input.idempotencyKey) as { id: string } | undefined;
    if (known) return known;
    const c = { id: id('cus') };
    this.customers.set(c.id, { organizationId: input.organizationId, defaultPm: null });
    this.idempotency.set(input.idempotencyKey, c);
    this.calls.push('createCustomer');
    return c;
  }

  async createSetupIntent(input: { customerId: string; organizationId: string }) {
    const si: SetupIntentState = {
      id: id('seti'),
      status: 'requires_payment_method',
      customerId: input.customerId,
      paymentMethodId: null,
      clientSecret: `seti_secret_${n}`,
      metadata: { organization_id: input.organizationId },
    };
    this.setupIntents.set(si.id, si);
    return si;
  }

  /** What Stripe Elements does in the browser: the card typed in, confirmed. */
  confirmSetup(setupIntentId: string, card: keyof typeof CARDS): SetupIntentState {
    const si = this.setupIntents.get(setupIntentId)!;
    si.status = 'succeeded';
    // as Stripe: a new payment method for each card attached (the test card decides its behaviour)
    si.paymentMethodId = `${card}__${id('pm')}`;
    return si;
  }

  async retrieveSetupIntent(setupIntentId: string) {
    const si = this.setupIntents.get(setupIntentId);
    if (!si) throw Object.assign(new Error('No such setupintent'), { statusCode: 404 });
    return { ...si };
  }

  async retrieveCard(paymentMethodId: string): Promise<CardDetails> {
    const card = CARDS[kindOf(paymentMethodId)];
    if (!card) throw new Error(`unknown test card ${paymentMethodId}`);
    const customer = [...this.setupIntents.values()].find(
      (s) => s.paymentMethodId === paymentMethodId,
    )?.customerId;
    return { paymentMethodId, customerId: customer ?? null, ...card };
  }

  async setDefaultPaymentMethod(customerId: string, paymentMethodId: string) {
    this.customers.get(customerId)!.defaultPm = paymentMethodId;
  }

  async createPaymentIntent(input: {
    customerId: string;
    paymentMethodId: string;
    amountMinor: number;
    currency: 'RON' | 'EUR';
    description: string;
    metadata: Record<string, string>;
    idempotencyKey: string;
  }): Promise<PaymentIntentState> {
    const known = this.idempotency.get(input.idempotencyKey) as PaymentIntentState | undefined;
    if (known) return { ...known };
    const piId = id('pi');
    const base = {
      id: piId,
      clientSecret: `${piId}_secret_x`,
      amountMinor: input.amountMinor,
      currency: input.currency,
      customerId: input.customerId,
      metadata: { ...input.metadata },
      paymentMethodId: input.paymentMethodId,
    };
    let pi: PaymentIntentState & { paymentMethodId: string };
    switch (kindOf(input.paymentMethodId)) {
      case 'pm_card_visa':
        pi = {
          ...base,
          status: 'succeeded',
          chargeId: id('ch'),
          failureCode: null,
          failureMessage: null,
        };
        break;
      case 'pm_card_chargeCustomerFail':
        pi = {
          ...base,
          status: 'requires_payment_method',
          chargeId: id('ch'),
          failureCode: 'card_declined',
          failureMessage: 'Your card was declined.',
        };
        break;
      case 'pm_card_threeDSecure2Required':
        pi = {
          ...base,
          status: 'requires_action',
          chargeId: null,
          failureCode: null,
          failureMessage: null,
        };
        break;
      default:
        pi = {
          ...base,
          status: 'processing',
          chargeId: id('ch'),
          failureCode: null,
          failureMessage: null,
        };
    }
    this.paymentIntents.set(piId, pi);
    this.idempotency.set(input.idempotencyKey, pi);
    this.calls.push('createPaymentIntent');
    return { ...pi };
  }

  /** 3-D Secure done in the dialog (or the bank answered): the PaymentIntent's new state. */
  settle(piId: string, outcome: 'succeeded' | 'failed'): PaymentIntentState {
    const pi = this.paymentIntents.get(piId)!;
    if (outcome === 'succeeded') {
      Object.assign(pi, {
        status: 'succeeded',
        chargeId: pi.chargeId ?? id('ch'),
        failureCode: null,
        failureMessage: null,
      });
    } else {
      Object.assign(pi, {
        status: 'requires_payment_method',
        chargeId: pi.chargeId ?? id('ch'),
        failureCode: 'authentication_required',
        failureMessage: 'The bank could not authenticate the payment.',
      });
    }
    return { ...pi };
  }

  refunds: Array<{ id: string; paymentIntentId: string }> = [];

  async refundPaymentIntent(paymentIntentId: string, idempotencyKey: string) {
    const found = this.refunds.find((r) => r.id === `re_${idempotencyKey}`);
    if (found) return { id: found.id };
    const refund = { id: `re_${idempotencyKey}`, paymentIntentId };
    this.refunds.push(refund);
    return { id: refund.id };
  }

  async retrievePaymentIntent(piId: string) {
    const pi = this.paymentIntents.get(piId);
    if (!pi) throw Object.assign(new Error('No such payment_intent'), { statusCode: 404 });
    return { ...pi };
  }

  async ensurePrice(spec: PriceSpec) {
    const found = [...this.prices.values()].find((p) => p.lookupKey === spec.lookupKey);
    if (found) return found.id;
    const price = { ...spec, id: id('price') };
    this.prices.set(price.id, price);
    return price.id;
  }

  async ensureCoupon(spec: CouponSpec) {
    if (!this.coupons.has(spec.id)) this.coupons.set(spec.id, spec);
    return spec.id;
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<SubscriptionState> {
    const known = this.idempotency.get(input.idempotencyKey) as SubscriptionState | undefined;
    if (known) return structuredClone(known);
    const sub = {
      id: id('sub'),
      status: input.trialEnd ? 'trialing' : 'active',
      customerId: input.customerId,
      currentPeriodEnd: input.billingCycleAnchor ?? new Date(Date.now() + 30 * 86_400_000),
      cancelAtPeriodEnd: false,
      items: input.items.map((i) => ({
        id: id('si'),
        ref: i.ref,
        priceId: i.priceId,
        quantity: i.quantity,
        couponIds: [...i.couponIds].sort(),
      })),
      couponIds: [...input.couponIds].sort(),
      metadata: { ...input.metadata },
      anchor: input.billingCycleAnchor,
      trialEnd: input.trialEnd,
    };
    this.subscriptions.set(sub.id, sub);
    this.idempotency.set(input.idempotencyKey, sub);
    this.calls.push('createSubscription');
    return structuredClone(sub);
  }

  async retrieveSubscription(subId: string) {
    const sub = this.subscriptions.get(subId);
    if (!sub) throw Object.assign(new Error('No such subscription'), { statusCode: 404 });
    return structuredClone(sub);
  }

  async updateSubscription(
    subId: string,
    input: UpdateSubscriptionInput,
  ): Promise<SubscriptionState> {
    const sub = this.subscriptions.get(subId)!;
    this.calls.push(`updateSubscription:${input.prorateAdded ? 'prorate' : 'none'}`);
    sub.items = sub.items.filter((i) => !input.remove.includes(i.id));
    for (const c of input.change) {
      const item = sub.items.find((i) => i.id === c.itemId)!;
      Object.assign(item, {
        priceId: c.priceId,
        quantity: c.quantity,
        couponIds: [...c.couponIds].sort(),
      });
    }
    for (const a of input.add) {
      sub.items.push({
        id: id('si'),
        ref: a.ref,
        priceId: a.priceId,
        quantity: a.quantity,
        couponIds: [...a.couponIds].sort(),
      });
    }
    if (input.couponIds) sub.couponIds = [...input.couponIds].sort();
    if (input.cancelAtPeriodEnd !== undefined) sub.cancelAtPeriodEnd = input.cancelAtPeriodEnd;
    return structuredClone(sub);
  }

  // ── events, as Stripe sends them ──────────────────────────────────────────────────────────

  piObject(piId: string): Record<string, unknown> {
    const pi = this.paymentIntents.get(piId)!;
    return {
      id: pi.id,
      object: 'payment_intent',
      status: pi.status,
      amount: pi.amountMinor,
      currency: pi.currency.toLowerCase(),
      customer: pi.customerId,
      latest_charge: pi.chargeId,
      last_payment_error: pi.failureCode
        ? { code: 'card_declined', decline_code: pi.failureCode, message: pi.failureMessage }
        : null,
      metadata: pi.metadata,
    };
  }

  subscriptionObject(subId: string, patch: Record<string, unknown> = {}): Record<string, unknown> {
    const sub = this.subscriptions.get(subId)!;
    return {
      id: sub.id,
      object: 'subscription',
      status: sub.status,
      customer: sub.customerId,
      cancel_at_period_end: sub.cancelAtPeriodEnd,
      items: {
        data: sub.items.map((i) => ({
          id: i.id,
          current_period_end: Math.floor((sub.currentPeriodEnd ?? new Date()).getTime() / 1000),
        })),
      },
      ...patch,
    };
  }
}

export function eventFor(
  type: string,
  object: Record<string, unknown>,
  created = Math.floor(Date.now() / 1000),
) {
  return JSON.stringify({
    id: id('evt'),
    object: 'event',
    type,
    created,
    api_version: '2025-09-30.clover',
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: { object },
  });
}
