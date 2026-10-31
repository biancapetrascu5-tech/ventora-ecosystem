import type {
  BillingInterval,
  DiscountDuration,
  DiscountKind,
  InvoiceDiscountPreview,
  InvoiceLinePreview,
} from '@ventora/contracts';
import { addMonthsAnchored, calendarDate, nextBillingDate } from './period';

/*
 * Lot 3.2 (D3-21): the price of an invoice with its discounts — full prices, each discount as a
 * separate line, the total. Pure, so the Hub preview (3.7) and the Stripe mapping (3.5) can be
 * checked against the same rules. Amounts are minor units; nothing goes below zero.
 */

export interface DiscountTerms {
  id: string;
  scope: 'subscription' | 'application' | 'addon';
  /** The application or add-on line; null for the whole subscription. */
  lineId: string | null;
  kind: DiscountKind;
  percentOff: number | null;
  amountOffMinor: number | null;
  duration: DiscountDuration;
  durationMonths: number | null;
  createdAt: Date;
  endedAt: Date | null;
}

/** The first invoice a discount reaches: the first billing date after the day it was created. */
export function firstDiscountedInvoice(
  subscription: { startedOn: string; interval: BillingInterval },
  createdAt: Date,
): string {
  return nextBillingDate(subscription, calendarDate(createdAt));
}

/**
 * Whether a discount applies to the invoice of `invoiceDate` (a billing date), seen at `at`:
 * - once: only the first invoice after it was created (Stripe `once`);
 * - repeating N: the invoices in the N months from that first one (Stripe `repeating`);
 * - forever: every invoice from that first one (Stripe `forever`);
 * an ended discount applies to nothing from then on.
 */
export function discountApplies(
  discount: DiscountTerms,
  subscription: { startedOn: string; interval: BillingInterval; anchorDay: number },
  invoiceDate: string,
  at: Date,
): boolean {
  if (discount.endedAt && discount.endedAt <= at) return false;
  const first = firstDiscountedInvoice(subscription, discount.createdAt);
  if (invoiceDate < first) return false;
  if (discount.duration === 'once') return invoiceDate === first;
  if (discount.duration === 'repeating') {
    return (
      invoiceDate < addMonthsAnchored(first, discount.durationMonths ?? 0, subscription.anchorDay)
    );
  }
  return true;
}

function takeOff(discount: DiscountTerms, base: number): number {
  if (base <= 0) return 0;
  const off =
    discount.kind === 'percent'
      ? Math.round((base * (discount.percentOff ?? 0)) / 100)
      : (discount.amountOffMinor ?? 0);
  return Math.min(off, base);
}

/**
 * The invoice: line discounts first, on their line; then the subscription discount, on what is
 * left. 100% = free; a fixed amount above what it applies to stops at zero.
 */
export function priceInvoice(
  lines: readonly InvoiceLinePreview[],
  discounts: readonly DiscountTerms[],
): {
  discounts: InvoiceDiscountPreview[];
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
} {
  const subtotalMinor = lines.reduce((sum, l) => sum + l.amountMinor, 0);
  const preview = (d: DiscountTerms, appliedMinor: number): InvoiceDiscountPreview => ({
    discountId: d.id,
    scope: d.scope,
    lineId: d.lineId,
    kind: d.kind,
    percentOff: d.percentOff,
    amountOffMinor: d.amountOffMinor,
    duration: d.duration,
    durationMonths: d.durationMonths,
    appliedMinor,
  });

  const out: InvoiceDiscountPreview[] = [];
  let lineOff = 0;
  for (const d of discounts.filter((x) => x.scope !== 'subscription')) {
    const line = lines.find((l) => l.lineId === d.lineId);
    if (!line) continue;
    const applied = takeOff(d, line.amountMinor);
    lineOff += applied;
    out.push(preview(d, applied));
  }
  let subOff = 0;
  for (const d of discounts.filter((x) => x.scope === 'subscription')) {
    const applied = takeOff(d, subtotalMinor - lineOff - subOff);
    subOff += applied;
    out.push(preview(d, applied));
  }
  const discountMinor = lineOff + subOff;
  return {
    discounts: out,
    subtotalMinor,
    discountMinor,
    totalMinor: subtotalMinor - discountMinor,
  };
}
