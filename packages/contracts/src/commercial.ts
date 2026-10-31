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

export interface SubscriptionSummary {
  planCode: string;
  planName: string;
  versionNumber: number;
  status: SubscriptionStatus;
  interval: BillingInterval;
  currency: Currency;
  /** The price of the subscription's interval, in its currency. */
  priceMinor: number;
  startedOn: string;
  /** D3-3: the next billing date, on the anchor day. */
  nextBillingDate: string;
  /** The monthly reset of flow quotas ("De la {date}, pornim de la zero"). */
  quotaPeriod: { start: string; end: string };
  trialEndsAt: string | null;
  /** A move to another version already scheduled (the 30-day notice, D-COM-9). */
  pendingChange: { effectiveAt: string; classification: 'advantage' | 'disadvantage' } | null;
  applications: string[];
  /** Only the limited quotas: an unlimited one is not shown in the Hub (D3-14). */
  quotas: Array<{ key: string; limit: number }>;
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
