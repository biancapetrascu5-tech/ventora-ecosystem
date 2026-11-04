import { requireFounderSession } from '@ventora/identity';
import { withBillingFounderList } from './db';
import { INVOICE_ALERT_ATTEMPTS } from './invoices';

/*
 * Lot 3.6 — Founder · Prezentare (FounderOverview, S118): what needs the team about money, across
 * businesses. Every call needs the Founder session with 2FA; the rows come only through the
 * SECURITY DEFINER functions granted to founder_runtime (billing.founder_*), read only. Only ids
 * and amounts: the business's name comes from core/organizations, in the Founder app.
 */

/**
 * „Răspunde în Stripe”: the dispute in the Stripe dashboard — the test one until the live keys
 * (sk_live_ / pk_live_) are set.
 */
export function stripeDisputeUrl(disputeId: string): string {
  const live = [process.env.STRIPE_SECRET_KEY, process.env.STRIPE_PUBLISHABLE_KEY].some((k) =>
    (k ?? '').includes('_live_'),
  );
  return `https://dashboard.stripe.com/${live ? '' : 'test/'}disputes/${encodeURIComponent(disputeId)}`;
}

type FounderParams = { founderHeaders: Headers; limit?: number };

export interface FounderFailedPayment {
  paymentId: string;
  organizationId: string;
  stripeInvoiceId: string;
  /** What is left to collect (the subscription's invoice). */
  amountMinor: number;
  currency: 'RON' | 'EUR';
  attempt: number;
  /** When Stripe tries again; null: no more automatic attempts. */
  nextAttemptAt: Date | null;
  failedAt: Date;
}

/** The subscription invoices whose last attempt was refused and that are still unpaid. */
export async function listFailedPaymentsForFounder(
  params: FounderParams,
): Promise<FounderFailedPayment[]> {
  await requireFounderSession(params.founderHeaders);
  return withBillingFounderList(async (client) => {
    const { rows } = await client.query<{
      payment_id: string;
      organization_id: string;
      stripe_invoice_id: string;
      amount_minor: string;
      currency: 'RON' | 'EUR';
      attempt: number;
      next_attempt_at: Date | null;
      failed_at: Date;
    }>(`SELECT * FROM billing.founder_failed_payments($1)`, [params.limit ?? 100]);
    return rows.map((r) => ({
      paymentId: r.payment_id,
      organizationId: r.organization_id,
      stripeInvoiceId: r.stripe_invoice_id,
      amountMinor: Number(r.amount_minor),
      currency: r.currency,
      attempt: r.attempt,
      nextAttemptAt: r.next_attempt_at,
      failedAt: r.failed_at,
    }));
  });
}

export interface FounderOpenDispute {
  disputeId: string;
  organizationId: string;
  amountMinor: number;
  currency: 'RON' | 'EUR';
  reason: string;
  /** Stripe's state: needs_response, under_review (and the warning_* inquiries). */
  status: string;
  /** The deadline to answer in Stripe (evidence_details.due_by); null when Stripe gave none. */
  evidenceDueBy: Date | null;
  openedAt: Date;
}

/** The disputes not closed yet, the nearest deadline first. */
export async function listOpenDisputesForFounder(
  params: FounderParams,
): Promise<FounderOpenDispute[]> {
  await requireFounderSession(params.founderHeaders);
  return withBillingFounderList(async (client) => {
    const { rows } = await client.query<{
      stripe_dispute_id: string;
      organization_id: string;
      amount_minor: string;
      currency: 'RON' | 'EUR';
      reason: string;
      status: string;
      evidence_due_by: Date | null;
      created_at: Date;
    }>(`SELECT * FROM billing.founder_open_disputes($1)`, [params.limit ?? 100]);
    return rows.map((r) => ({
      disputeId: r.stripe_dispute_id,
      organizationId: r.organization_id,
      amountMinor: Number(r.amount_minor),
      currency: r.currency,
      reason: r.reason,
      status: r.status,
      evidenceDueBy: r.evidence_due_by,
      openedAt: r.created_at,
    }));
  });
}

export interface FounderInvoiceAttention {
  invoiceId: string;
  organizationId: string;
  kind: 'invoice' | 'storno';
  /** failed: refused or uncertain (check SmartBill); pending: not issued after several attempts. */
  status: 'pending' | 'failed';
  amountMinor: number;
  currency: 'RON' | 'EUR';
  attempts: number;
  lastError: string | null;
  createdAt: Date;
}

/** The invoices that need the team (the plan's alert in Founder when SmartBill is down). */
export async function listInvoicesNeedingAttentionForFounder(
  params: FounderParams,
): Promise<FounderInvoiceAttention[]> {
  await requireFounderSession(params.founderHeaders);
  return withBillingFounderList(async (client) => {
    const { rows } = await client.query<{
      id: string;
      organization_id: string;
      kind: 'invoice' | 'storno';
      status: 'pending' | 'failed';
      amount_minor: string;
      currency: 'RON' | 'EUR';
      attempts: number;
      last_error: string | null;
      created_at: Date;
    }>(`SELECT * FROM billing.founder_invoices_attention($1, $2)`, [
      INVOICE_ALERT_ATTEMPTS,
      params.limit ?? 100,
    ]);
    return rows.map((r) => ({
      invoiceId: r.id,
      organizationId: r.organization_id,
      kind: r.kind,
      status: r.status,
      amountMinor: Number(r.amount_minor),
      currency: r.currency,
      attempts: r.attempts,
      lastError: r.last_error,
      createdAt: r.created_at,
    }));
  });
}
