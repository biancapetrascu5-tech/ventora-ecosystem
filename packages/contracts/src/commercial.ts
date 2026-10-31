/**
 * Lot 3.2 (D-ROAD-4): what the Hub screens read from the commercial model (HubAdminPlan,
 * UsageMeter, AddonPurchase — Lot 3.7). Implemented by core/commercial; the screens depend only
 * on these shapes. Prices are in minor units (bani / cents), in the business's currency (D3-2).
 */

/** D3-2: lei and euro; fixed per business from Founder; no conversion. */
export type Currency = 'RON' | 'EUR';

/** D3-3: monthly at full price or yearly with a discount (the yearly price is set directly). */
export type BillingInterval = 'month' | 'year';

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled';

/** D3-7, D3-9: bought / activated directly, or through a request to the Ventora team. */
export type PurchaseMode = 'direct' | 'on_request';

/** The plan version + active add-ons + active exceptions + active trials (ARCHITECTURE §8.5). */
export interface EffectiveEntitlements {
  organizationId: string;
  subscription: {
    id: string;
    planVersionId: string;
    status: SubscriptionStatus;
    interval: BillingInterval;
    currency: Currency;
    /** 'YYYY-MM-DD'; its day is the anchor day (D3-3). */
    startedOn: string;
    anchorDay: number;
    trialEndsAt: string | null;
  } | null;
  /** Purchasable applications included now (the platform itself is always on). */
  applications: string[];
  features: string[];
  /** Every active quota key of the registry: a number, or `null` for unlimited (D3-14). */
  quotas: Record<string, number | null>;
}

/** D3-21: a percentage (1–100, 100 = free) or a fixed amount in the business's currency. */
export type DiscountKind = 'percent' | 'amount';

/** D3-21: the next invoice only, N months, or until ended (Stripe: once / repeating / forever). */
export type DiscountDuration = 'once' | 'repeating' | 'forever';

/** One line of an invoice at full price: the plan, an application added, a monthly add-on. */
export interface InvoiceLinePreview {
  kind: 'plan' | 'application' | 'addon';
  /** The plan code, the application id or the add-on code. */
  key: string;
  /** The application or add-on line (null for the plan). */
  lineId: string | null;
  amountMinor: number;
}

/** A discount shown as its own line (D3-21), with what it takes off this invoice. */
export interface InvoiceDiscountPreview {
  discountId: string;
  /** The whole subscription, or one application / add-on line (`lineId`). */
  scope: 'subscription' | 'application' | 'addon';
  lineId: string | null;
  kind: DiscountKind;
  percentOff: number | null;
  amountOffMinor: number | null;
  duration: DiscountDuration;
  durationMonths: number | null;
  /** What it takes off this invoice (never more than what it applies to). */
  appliedMinor: number;
}

/** The next invoice: full prices, the discounts as separate lines, the total. */
export interface InvoicePreview {
  date: string;
  currency: Currency;
  lines: InvoiceLinePreview[];
  discounts: InvoiceDiscountPreview[];
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
}

export interface SubscriptionSummary {
  planCode: string;
  planName: string;
  versionNumber: number;
  status: SubscriptionStatus;
  interval: BillingInterval;
  currency: Currency;
  /** The plan's full price for the subscription's interval, in its currency. */
  priceMinor: number;
  /** D3-21: the next invoice — full price, discounts as separate lines, total. */
  nextInvoice: InvoicePreview;
  startedOn: string;
  /** D3-3: the next billing date, on the anchor day. */
  nextBillingDate: string;
  /** The monthly reset of flow quotas ("De la {date}, pornim de la zero"). */
  quotaPeriod: { start: string; end: string };
  trialEndsAt: string | null;
  /** A move to another version already scheduled (the 30-day notice, D-COM-9). */
  pendingChange: { effectiveAt: string; classification: 'advantage' | 'disadvantage' } | null;
  applications: string[];
  /**
   * Only the limited quotas: an unlimited one is not shown in the Hub (D3-14). `used` is the
   * current monthly period for a flow quota (D3-3), the counter for a stock quota (Lot 3.3).
   */
  quotas: Array<{ key: string; limit: number; used: number }>;
}

export interface AddonOffer {
  id: string;
  code: string;
  name: string;
  quotaKey: string;
  quantity: number;
  validity: 'current_month' | 'monthly';
  /** The add-on's switch; card and manual payment are combined with it in Lot 3.5 / 3.7. */
  purchaseMode: PurchaseMode;
  currency: Currency;
  priceMinor: number;
  setupMinor: number;
}
