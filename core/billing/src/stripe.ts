import Stripe from 'stripe';

/*
 * Lot 3.5 — the only place that talks to Stripe (D3-4 a, D3-19). The rest of core/billing sees
 * this small gateway: the real one wraps the official SDK (`stripe`, mode test until launch); the
 * tests use a fake with the same shape (CI has no Stripe keys) and, locally, the real one against
 * the test account (stripe-live.integration.test.ts).
 *
 * Nothing about a card goes through Ventora beyond the brand, the last 4 digits, the expiry and
 * the Stripe id (§8.6): the card itself is typed into Stripe Elements, in the browser.
 *
 * Amounts are minor units (bani, cents); currencies are ISO upper case in Ventora, lower case in
 * Stripe.
 */

export type StripeCurrency = 'RON' | 'EUR';

/** A PaymentIntent as core/billing needs it. */
export interface PaymentIntentState {
  id: string;
  status:
    | 'succeeded'
    | 'processing'
    | 'requires_action'
    | 'requires_payment_method'
    | 'requires_confirmation'
    | 'requires_capture'
    | 'canceled';
  /** Only for the dialog (3-D Secure in Stripe.js); never stored. */
  clientSecret: string | null;
  amountMinor: number;
  currency: StripeCurrency;
  customerId: string | null;
  /** The charge of the latest attempt: one payment row per charge. */
  chargeId: string | null;
  /** The bank's refusal, as Stripe gives it („card_declined” / „Your card was declined.”). */
  failureCode: string | null;
  failureMessage: string | null;
  metadata: Record<string, string>;
}

export interface CardDetails {
  paymentMethodId: string;
  customerId: string | null;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export interface SetupIntentState {
  id: string;
  status: string;
  customerId: string | null;
  paymentMethodId: string | null;
  clientSecret: string | null;
  metadata: Record<string, string>;
}

/** One line of the Stripe subscription; `ref` ties it to the commercial line (item metadata). */
export interface SubscriptionItemSpec {
  ref: string;
  priceId: string;
  quantity: number;
  /** Coupons on this line only (D3-21, a discount on one application or one pack). */
  couponIds: string[];
}

export interface SubscriptionItemState {
  id: string;
  ref: string | null;
  priceId: string;
  quantity: number;
  couponIds: string[];
}

export interface SubscriptionState {
  id: string;
  status: string;
  customerId: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  items: SubscriptionItemState[];
  couponIds: string[];
  metadata: Record<string, string>;
}

export interface PriceSpec {
  /** Stable and unique: the same spec always finds the same price (lookup_key). */
  lookupKey: string;
  productKey: string;
  productName: string;
  currency: StripeCurrency;
  unitAmountMinor: number;
  interval: 'month' | 'year';
}

export interface CouponSpec {
  /** `vnt_disc_<discount id>`: created once, found again on the next reconciliation. */
  id: string;
  name: string;
  percentOff: number | null;
  amountOffMinor: number | null;
  currency: StripeCurrency;
  duration: 'once' | 'repeating' | 'forever';
  durationMonths: number | null;
}

export interface CreateSubscriptionInput {
  customerId: string;
  paymentMethodId: string;
  items: SubscriptionItemSpec[];
  couponIds: string[];
  /** The next anchor day (D3-3), or null when the subscription starts on it today. */
  billingCycleAnchor: Date | null;
  trialEnd: Date | null;
  metadata: Record<string, string>;
  idempotencyKey: string;
}

export interface UpdateSubscriptionInput {
  add: SubscriptionItemSpec[];
  /** Item ids to remove (a line ended): no proration, no refund (D3-10). */
  remove: string[];
  /** Price or quantity changes on existing items. */
  change: Array<{ itemId: string; priceId: string; quantity: number; couponIds: string[] }>;
  /** The subscription's own coupons, when they differ. */
  couponIds?: string[];
  /** Lines the customer has not paid for yet start with a prorated amount on the next invoice. */
  prorateAdded: boolean;
  cancelAtPeriodEnd?: boolean;
}

/** A Stripe event as delivered to the webhook, after the signature is checked. */
export interface StripeEventEnvelope {
  id: string;
  type: string;
  created: number;
  object: Record<string, unknown>;
}

export interface StripeGateway {
  createCustomer(input: {
    organizationId: string;
    name: string | null;
    idempotencyKey: string;
  }): Promise<{ id: string }>;
  createSetupIntent(input: {
    customerId: string;
    organizationId: string;
  }): Promise<SetupIntentState>;
  retrieveSetupIntent(id: string): Promise<SetupIntentState>;
  retrieveCard(paymentMethodId: string): Promise<CardDetails>;
  setDefaultPaymentMethod(customerId: string, paymentMethodId: string): Promise<void>;
  /** On session (the owner in the dialog), with the saved card; 3-D Secure comes back as `requires_action`. */
  createPaymentIntent(input: {
    customerId: string;
    paymentMethodId: string;
    amountMinor: number;
    currency: StripeCurrency;
    description: string;
    metadata: Record<string, string>;
    idempotencyKey: string;
  }): Promise<PaymentIntentState>;
  retrievePaymentIntent(id: string): Promise<PaymentIntentState>;
  ensurePrice(spec: PriceSpec): Promise<string>;
  ensureCoupon(spec: CouponSpec): Promise<string>;
  createSubscription(input: CreateSubscriptionInput): Promise<SubscriptionState>;
  retrieveSubscription(id: string): Promise<SubscriptionState>;
  updateSubscription(id: string, input: UpdateSubscriptionInput): Promise<SubscriptionState>;
}

// ── The real gateway ───────────────────────────────────────────────────────────────────────

const REF_KEY = 'ventora_ref';

function upper(currency: string): StripeCurrency {
  const c = currency.toUpperCase();
  if (c !== 'RON' && c !== 'EUR') throw new Error(`[billing] unexpected currency ${currency}`);
  return c;
}

function idOf(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return (value as { id?: string }).id ?? null;
}

function piState(pi: Stripe.PaymentIntent): PaymentIntentState {
  const error = pi.last_payment_error;
  return {
    id: pi.id,
    status: pi.status as PaymentIntentState['status'],
    clientSecret: pi.client_secret,
    amountMinor: pi.amount,
    currency: upper(pi.currency),
    customerId: idOf(pi.customer),
    chargeId: idOf(pi.latest_charge),
    failureCode: error ? (error.decline_code ?? error.code ?? 'payment_failed') : null,
    failureMessage: error?.message ?? null,
    metadata: { ...(pi.metadata ?? {}) },
  };
}

function siState(si: Stripe.SetupIntent): SetupIntentState {
  return {
    id: si.id,
    status: si.status,
    customerId: idOf(si.customer),
    paymentMethodId: idOf(si.payment_method),
    clientSecret: si.client_secret,
    metadata: { ...(si.metadata ?? {}) },
  };
}

function couponIdsOf(discounts: unknown): string[] {
  if (!Array.isArray(discounts)) return [];
  return discounts
    .map((d) => {
      if (typeof d === 'string') return null; // not expanded: the reconciliation expands them
      const coupon =
        (d as { coupon?: unknown; source?: { coupon?: unknown } }).source?.coupon ??
        (d as { coupon?: unknown }).coupon;
      return idOf(coupon);
    })
    .filter((x): x is string => !!x)
    .sort();
}

function subState(sub: Stripe.Subscription): SubscriptionState {
  const periodEnds = sub.items.data
    .map((i) => (i as unknown as { current_period_end?: number }).current_period_end)
    .filter((x): x is number => typeof x === 'number');
  return {
    id: sub.id,
    status: sub.status,
    customerId: idOf(sub.customer)!,
    currentPeriodEnd: periodEnds.length ? new Date(Math.max(...periodEnds) * 1000) : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    items: sub.items.data.map((i) => ({
      id: i.id,
      ref: i.metadata?.[REF_KEY] ?? null,
      priceId: i.price.id,
      quantity: i.quantity ?? 1,
      couponIds: couponIdsOf(i.discounts),
    })),
    couponIds: couponIdsOf(sub.discounts),
    metadata: { ...(sub.metadata ?? {}) },
  };
}

const SUB_EXPAND = ['discounts', 'items.data.discounts'];

/**
 * The coupons of a subscription or a line on update. An empty list must be sent as '' — Stripe
 * ignores `discounts: []` and keeps the old ones (found with the test account, Lot 3.5).
 */
function discountsParam(couponIds: string[]): Array<{ coupon: string }> | '' {
  return couponIds.length ? couponIds.map((coupon) => ({ coupon })) : '';
}

export class SdkStripeGateway implements StripeGateway {
  constructor(private readonly stripe: Stripe) {}

  async createCustomer(input: {
    organizationId: string;
    name: string | null;
    idempotencyKey: string;
  }) {
    const c = await this.stripe.customers.create(
      {
        ...(input.name ? { name: input.name } : {}),
        metadata: { organization_id: input.organizationId },
      },
      { idempotencyKey: input.idempotencyKey },
    );
    return { id: c.id };
  }

  async createSetupIntent(input: { customerId: string; organizationId: string }) {
    const si = await this.stripe.setupIntents.create({
      customer: input.customerId,
      usage: 'off_session',
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      metadata: { organization_id: input.organizationId },
    });
    return siState(si);
  }

  async retrieveSetupIntent(id: string) {
    return siState(await this.stripe.setupIntents.retrieve(id));
  }

  async retrieveCard(paymentMethodId: string): Promise<CardDetails> {
    const pm = await this.stripe.paymentMethods.retrieve(paymentMethodId);
    if (!pm.card) throw new Error('[billing] the payment method is not a card');
    return {
      paymentMethodId: pm.id,
      customerId: idOf(pm.customer),
      brand: pm.card.brand,
      last4: pm.card.last4,
      expMonth: pm.card.exp_month,
      expYear: pm.card.exp_year,
    };
  }

  async setDefaultPaymentMethod(customerId: string, paymentMethodId: string) {
    await this.stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
  }

  async createPaymentIntent(input: {
    customerId: string;
    paymentMethodId: string;
    amountMinor: number;
    currency: StripeCurrency;
    description: string;
    metadata: Record<string, string>;
    idempotencyKey: string;
  }): Promise<PaymentIntentState> {
    try {
      const pi = await this.stripe.paymentIntents.create(
        {
          amount: input.amountMinor,
          currency: input.currency.toLowerCase(),
          customer: input.customerId,
          payment_method: input.paymentMethodId,
          automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
          confirm: true,
          // the owner is in the dialog: 3-D Secure is confirmed there with Stripe.js
          use_stripe_sdk: true,
          description: input.description,
          metadata: input.metadata,
        },
        { idempotencyKey: input.idempotencyKey },
      );
      return piState(pi);
    } catch (err) {
      // a refused card: the PaymentIntent exists, with the bank's reason
      const pi = (err as { raw?: { payment_intent?: Stripe.PaymentIntent } }).raw?.payment_intent;
      if (err instanceof Stripe.errors.StripeCardError && pi) return piState(pi);
      throw err;
    }
  }

  async retrievePaymentIntent(id: string) {
    return piState(await this.stripe.paymentIntents.retrieve(id));
  }

  async ensurePrice(spec: PriceSpec): Promise<string> {
    const found = await this.stripe.prices.list({ lookup_keys: [spec.lookupKey], limit: 1 });
    if (found.data[0]) return found.data[0].id;
    const productId = await this.ensureProduct(spec.productKey, spec.productName);
    const price = await this.stripe.prices.create(
      {
        product: productId,
        currency: spec.currency.toLowerCase(),
        unit_amount: spec.unitAmountMinor,
        recurring: { interval: spec.interval },
        lookup_key: spec.lookupKey,
        metadata: { ventora_lookup_key: spec.lookupKey },
      },
      { idempotencyKey: `price-${spec.lookupKey}` },
    );
    return price.id;
  }

  private async ensureProduct(key: string, name: string): Promise<string> {
    // the product id is ours: created once, found again by id
    const id = `vnt_${key}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
    try {
      return (await this.stripe.products.retrieve(id)).id;
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode !== 404) throw err;
      return (await this.stripe.products.create({ id, name }, { idempotencyKey: `product-${id}` }))
        .id;
    }
  }

  async ensureCoupon(spec: CouponSpec): Promise<string> {
    try {
      return (await this.stripe.coupons.retrieve(spec.id)).id;
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode !== 404) throw err;
    }
    const coupon = await this.stripe.coupons.create(
      {
        id: spec.id,
        name: spec.name,
        ...(spec.percentOff !== null
          ? { percent_off: spec.percentOff }
          : { amount_off: spec.amountOffMinor!, currency: spec.currency.toLowerCase() }),
        duration: spec.duration,
        ...(spec.duration === 'repeating' ? { duration_in_months: spec.durationMonths! } : {}),
      },
      { idempotencyKey: `coupon-${spec.id}` },
    );
    return coupon.id;
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<SubscriptionState> {
    const sub = await this.stripe.subscriptions.create(
      {
        customer: input.customerId,
        default_payment_method: input.paymentMethodId,
        items: input.items.map((i) => ({
          price: i.priceId,
          quantity: i.quantity,
          metadata: { [REF_KEY]: i.ref },
          discounts: i.couponIds.map((coupon) => ({ coupon })),
        })),
        discounts: input.couponIds.map((coupon) => ({ coupon })),
        ...(input.billingCycleAnchor
          ? {
              billing_cycle_anchor: Math.floor(input.billingCycleAnchor.getTime() / 1000),
              proration_behavior: 'create_prorations' as const,
            }
          : {}),
        ...(input.trialEnd ? { trial_end: Math.floor(input.trialEnd.getTime() / 1000) } : {}),
        // created from the webhook or the job: the owner is not there; a card that needs
        // authentication fails the first invoice, then Stripe retries (D3-12, Lot 3.8)
        off_session: true,
        payment_behavior: 'allow_incomplete',
        metadata: input.metadata,
        expand: SUB_EXPAND,
      },
      { idempotencyKey: input.idempotencyKey },
    );
    return subState(sub);
  }

  async retrieveSubscription(id: string) {
    return subState(await this.stripe.subscriptions.retrieve(id, { expand: SUB_EXPAND }));
  }

  async updateSubscription(id: string, input: UpdateSubscriptionInput): Promise<SubscriptionState> {
    const items: Stripe.SubscriptionUpdateParams.Item[] = [
      ...input.add.map((i) => ({
        price: i.priceId,
        quantity: i.quantity,
        metadata: { [REF_KEY]: i.ref },
        discounts: i.couponIds.map((coupon) => ({ coupon })),
      })),
      ...input.change.map((c) => ({
        id: c.itemId,
        price: c.priceId,
        quantity: c.quantity,
        discounts: discountsParam(c.couponIds),
      })),
      ...input.remove.map((itemId) => ({ id: itemId, deleted: true })),
    ];
    const sub = await this.stripe.subscriptions.update(id, {
      ...(items.length ? { items } : {}),
      ...(input.couponIds ? { discounts: discountsParam(input.couponIds) } : {}),
      ...(input.cancelAtPeriodEnd !== undefined
        ? { cancel_at_period_end: input.cancelAtPeriodEnd }
        : {}),
      proration_behavior: input.prorateAdded ? 'create_prorations' : 'none',
      expand: SUB_EXPAND,
    });
    return subState(sub);
  }
}

export function toEnvelope(event: Stripe.Event): StripeEventEnvelope {
  return {
    id: event.id,
    type: event.type,
    created: event.created,
    object: event.data.object as unknown as Record<string, unknown>,
  };
}

/** The webhook signature check without the API client (the tests sign their own events). */
export function verifyStripeSignature(
  rawBody: string,
  signature: string,
  secret: string,
): StripeEventEnvelope {
  return toEnvelope(Stripe.webhooks.constructEvent(rawBody, signature, secret));
}

/** A signature header for a payload, as Stripe would send it (tests only). */
export function signStripePayload(payload: string, secret: string): string {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret });
}

// ── Which gateway ──────────────────────────────────────────────────────────────────────────

let current: StripeGateway | null = null;

/** The gateway in use: the tests set a fake; otherwise the SDK with STRIPE_SECRET_KEY. */
export function getStripeGateway(): StripeGateway {
  if (current) return current;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('[billing] STRIPE_SECRET_KEY is not set');
  current = new SdkStripeGateway(
    new Stripe(key, { maxNetworkRetries: 2, appInfo: { name: 'Ventora' } }),
  );
  return current;
}

export function setStripeGatewayForTests(gateway: StripeGateway | null): void {
  current = gateway;
}

/** Stripe's lower-case currency in an event object, as Ventora's. */
export const currencyOf = upper;
