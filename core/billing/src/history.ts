import { InvalidInput } from '@ventora/errors';
import { withBillingRead } from './db';

/*
 * Lot 3.7 — the payments shown under „Facturi” in HubAdminPlan: every payment that went through
 * (a pack or an application bought from the Hub, a renewal of the subscription), newest first.
 *
 * The invoice itself comes with Lot 3.6 (SmartBill): until then each row has `invoice: null` and
 * the Hub shows the design's „Factura se emite” (billing.invoices.pending, S111). 3.6 fills
 * `invoice` here from its `invoice` table, linked to the payment (one payment = one invoice), and
 * the Hub then shows the number, „Plătită” and „Descarcă PDF” (a signed link).
 *
 * Read in the business's context (RLS), as billing_rw, with the grants of Lot 3.5.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** At most this many payments are listed (the newest). */
export const PAYMENTS_LISTED = 24;

export interface PaymentRow {
  id: string;
  /** `subscription`: the subscription's invoice in Stripe Billing; `purchase`: bought in the Hub. */
  kind: 'purchase' | 'subscription';
  /** For a purchase: a pack (`addon`) or an application, its name and how many packs. */
  item: { kind: 'addon' | 'application'; name: string; packs: number } | null;
  amountMinor: number;
  currency: 'RON' | 'EUR';
  /** When it was paid (ISO). */
  paidAt: string;
  /** Lot 3.6: the invoice of this payment; null until it is issued („Factura se emite”). */
  invoice: { number: string } | null;
}

export async function listPayments(ctx: { organizationId: string }): Promise<PaymentRow[]> {
  if (!UUID_RE.test(ctx?.organizationId ?? '')) throw new InvalidInput('organizationId');
  return withBillingRead(ctx.organizationId, async (client) => {
    const { rows } = await client.query<{
      id: string;
      kind: 'purchase' | 'subscription';
      purchase_kind: 'addon' | 'application' | null;
      item_name: string | null;
      packs: number | null;
      amount_minor: string;
      currency: 'RON' | 'EUR';
      occurred_at: Date;
    }>(
      `SELECT p.id, p.kind, u.kind AS purchase_kind, u.item_name, u.packs,
              p.amount_minor::text AS amount_minor, p.currency, p.occurred_at
         FROM billing.payment p
         LEFT JOIN billing.purchase u ON u.id = p.purchase_id
        WHERE p.status = 'succeeded'
        ORDER BY p.occurred_at DESC, p.created_at DESC
        LIMIT $1`,
      [PAYMENTS_LISTED],
    );
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      item:
        r.kind === 'purchase' && r.purchase_kind && r.item_name
          ? { kind: r.purchase_kind, name: r.item_name, packs: r.packs ?? 1 }
          : null,
      amountMinor: Number(r.amount_minor),
      currency: r.currency,
      paidAt: r.occurred_at.toISOString(),
      invoice: null,
    }));
  });
}
