/**
 * Lot 3.1 (ARCHITECTURE §8.4): what an application manifest declares. The keys of features and
 * quotas are synced into the commercial registry at deploy (scripts/sync-commercial-registry.ts);
 * Founder sets values only for keys that exist there. A new feature means a new key, so code.
 */

/** `flow`: consumed per period (SMS, campaigns). `stock`: the number of items that exist now. */
export type QuotaKind = 'flow' | 'stock';

/**
 * Flow quotas reset monthly on the subscription's anchor day (D3-3: the day it started; 29–31 →
 * the last day of shorter months), on yearly subscriptions too. Stock quotas have no period.
 */
export type QuotaPeriod = 'month';

/** D3-6 (a): over the limit, only creating is blocked; reading and export stay. */
export type QuotaOverflow = 'block';

export interface QuotaDeclaration {
  key: string;
  kind: QuotaKind;
  /** What one unit is: `member`, `sms`, `gb`… */
  unit: string;
  /** `month` for a flow quota, `null` for a stock quota. */
  period: QuotaPeriod | null;
  overflow: QuotaOverflow;
  /** `refundQuota` is allowed only when true (ARCHITECTURE §8.3). */
  refundable: boolean;
  description?: string;
}

export interface FeatureDeclaration {
  key: string;
  description?: string;
}

export interface ApplicationManifest {
  applicationId: string;
  permissions: ReadonlyArray<{ name: string; description?: string }>;
  defaultGrants: Readonly<Record<string, readonly string[] | '*'>>;
  features?: readonly FeatureDeclaration[];
  quotas?: readonly QuotaDeclaration[];
}
