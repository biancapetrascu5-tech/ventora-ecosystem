import type { PoolClient } from 'pg';
import { AuditActions, appendAuditEventInTx, type AuditSqlExecutor } from '@ventora/audit';
import { getBillingTerms } from '@ventora/commercial';
import { BillingInvoiceIssuedV1, BillingPaymentSucceededV1 } from '@ventora/contracts';
import { uuidv7, writeOutboxEvent, type OutboxSqlClient } from '@ventora/db-kit';
import { InvalidInput } from '@ventora/errors';
import { organizationNameInTx } from '@ventora/organizations';
import { withBillingModule, withBillingRead, withBillingWrite } from './db';
import {
  InvoiceProviderError,
  getInvoiceProvider,
  type InvoiceBuyer,
  type InvoiceCurrency,
  type InvoiceLine,
  type IssuedDocument,
} from './invoice-provider';
import { reportBillingError } from './report';

/*
 * Lot 3.6 — the invoice of every payment (FAZA-3 §3.6, patterns.md: „Abonamentul și fiecare
 * cumpărătură au factura lor”).
 *
 *   1. `billing.payment.succeeded` (outbox) → the consumer writes the invoice `pending`, in the
 *      dispatcher's transaction: unique on the payment, so the same payment twice → one invoice;
 *   2. the issuing (`issueInvoice`, from the job and right after the dispatch) is outside any
 *      transaction that waits on the network:
 *        a. claim — in a short transaction: the row locked, the attempt counted, a lease
 *           (`claimed_until`), the lines and the buyer photographed at the first attempt;
 *        b. the provider is called (SmartBill);
 *        c. the result is recorded: `issued` (series, number, the outbox event for the e-mail);
 *           `pending` with the next attempt (the provider did not take it); `failed` (refused, or
 *           uncertain — Founder checks SmartBill, it is never retried by itself);
 *      a lease that ran out without a result means an attempt that may have issued: `failed`
 *      too, never a second call;
 *   3. a full refund made by Founder in Stripe (`charge.refunded`, D3-10) writes the storno,
 *      `pending`, issued once the invoice it reverses is issued.
 *
 * The package stays active whatever happens to its invoice (the payment went through).
 */

/** How long an attempt may take before its claim runs out (the provider's timeout is 20 s). */
const CLAIM_MS = 2 * 60_000;
/** The waits between attempts when the provider did not take the request. */
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000];
/** From this attempt on, a `pending` invoice is shown to Founder (and reported). */
export const INVOICE_ALERT_ATTEMPTS = 3;
/** A storno waits for its invoice this long between checks. */
const STORNO_WAIT_MS = 30 * 60_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TZ = 'Europe/Bucharest';

/** YYYY-MM-DD in Romania's time. */
export function romanianDate(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(at);
}

/** „noiembrie” */
export function romanianMonth(at: Date): string {
  return new Intl.DateTimeFormat('ro-RO', { timeZone: TZ, month: 'long' }).format(at);
}

// ── naming and buyer (set by the platform) ──────────────────────────────────────────────────

/** The display name of an application on the invoice (the platform gives the RO name). */
let appNameOf: (applicationId: string) => string = (id) => id;

export function setInvoiceApplicationNames(names: (applicationId: string) => string): void {
  appNameOf = names;
}

/** The application's name as it appears on the invoice and in its e-mail. */
export function invoiceAppName(applicationId: string): string {
  return appNameOf(applicationId);
}

/**
 * Who the invoice is for. D3-17 (DECIS: a): the billing details are entered by Founder when the
 * business is created — that profile does not exist yet (see the 3.6 report): until it does, the
 * buyer is the business's name, in Romania, without CUI.
 */
export type InvoiceBuyerResolver = (
  tx: PoolClient,
  organizationId: string,
) => Promise<InvoiceBuyer>;

const defaultBuyer: InvoiceBuyerResolver = async (tx, organizationId) => ({
  name: (await organizationNameInTx(tx, organizationId)) || 'Client Ventora',
  vatCode: null,
  regCom: null,
  address: null,
  city: null,
  county: null,
  country: 'Romania',
  email: null,
  isTaxPayer: false,
});

let buyerOf: InvoiceBuyerResolver = defaultBuyer;

export function setInvoiceBuyerResolver(resolver: InvoiceBuyerResolver | null): void {
  buyerOf = resolver ?? defaultBuyer;
}

// ── 1. the consumer: one pending invoice per payment ────────────────────────────────────────

/** Writes the invoice row (`pending`); the same payment again → nothing. */
async function insertPendingInvoice(
  tx: Pick<OutboxSqlClient, 'query'>,
  p: { organizationId: string; paymentId: string; amountMinor: number; currency: string },
): Promise<void> {
  await tx.query(
    `INSERT INTO billing.invoice (id, organization_id, kind, payment_id, provider, amount_minor, currency)
     VALUES ($1, $2, 'invoice', $3, $4, $5, $6)
     ON CONFLICT (payment_id) WHERE kind = 'invoice' DO NOTHING`,
    [uuidv7(), p.organizationId, p.paymentId, getInvoiceProvider().name, p.amountMinor, p.currency],
  );
}

export const invoiceIssueConsumer = {
  name: 'billing.invoice-issue',
  handles: [{ type: BillingPaymentSucceededV1.type, version: BillingPaymentSucceededV1.version }],
  async handle(
    envelope: { organizationId: string; payload: unknown },
    tx: OutboxSqlClient,
  ): Promise<void> {
    const p = BillingPaymentSucceededV1.parse(envelope.payload);
    await insertPendingInvoice(tx, {
      organizationId: envelope.organizationId,
      paymentId: p.paymentId,
      amountMinor: p.amountMinor,
      currency: p.currency,
    });
  },
};

// ── 2. issuing ──────────────────────────────────────────────────────────────────────────────

interface InvoiceRow {
  id: string;
  organization_id: string;
  kind: 'invoice' | 'storno';
  payment_id: string | null;
  reverses_invoice_id: string | null;
  provider: string;
  status: 'pending' | 'issued' | 'failed';
  series: string | null;
  number: string | null;
  issue_date: string | null;
  amount_minor: string;
  currency: InvoiceCurrency;
  lines: InvoiceLine[] | null;
  buyer: InvoiceBuyer | null;
  attempts: number;
  next_attempt_at: Date;
  claimed_until: Date | null;
}

const COLUMNS = `id, organization_id, kind, payment_id, reverses_invoice_id, provider, status, series,
  number, issue_date::text AS issue_date, amount_minor::text AS amount_minor, currency, lines, buyer,
  attempts, next_attempt_at, claimed_until`;

interface Snapshot {
  lines: InvoiceLine[];
  paidOn: string;
}

/** The lines of an invoice, from its payment (the glossary's texts). */
async function linesOf(
  client: PoolClient,
  organizationId: string,
  paymentId: string,
): Promise<Snapshot> {
  const { rows } = await client.query<{
    kind: 'purchase' | 'subscription';
    amount_minor: string;
    occurred_at: Date;
    purchase_kind: 'addon' | 'application' | null;
    item_name: string | null;
    application_id: string | null;
    packs: number | null;
    setup_minor: string | null;
  }>(
    `SELECT p.kind, p.amount_minor::text AS amount_minor, p.occurred_at, u.kind AS purchase_kind,
            u.item_name, u.application_id, u.packs, u.setup_minor::text AS setup_minor
       FROM billing.payment p
       LEFT JOIN billing.purchase u ON u.id = p.purchase_id
      WHERE p.id = $1 AND p.status = 'succeeded'`,
    [paymentId],
  );
  const p = rows[0];
  if (!p) throw new Error(`[billing] payment ${paymentId} not found or not paid`);
  const amount = Number(p.amount_minor);
  const month = romanianMonth(p.occurred_at);
  const paidOn = romanianDate(p.occurred_at);
  if (p.kind === 'subscription') {
    const terms = await getBillingTerms(organizationId);
    const plan = terms?.bundle?.planName?.trim() || 'Ventora';
    const period =
      terms?.subscription.interval === 'year'
        ? String(new Date(p.occurred_at).getFullYear())
        : month;
    return {
      lines: [
        { name: `Abonament ${plan} · ${period}`, code: 'VNT-SUB', quantity: 1, unitMinor: amount },
      ],
      paidOn,
    };
  }
  // a purchase from the Hub: the implementation cost on its own line (D3-23)
  const setup = Math.min(Number(p.setup_minor ?? 0), amount);
  const rest = amount - setup;
  const lines: InvoiceLine[] = [];
  if (p.purchase_kind === 'application' && p.application_id) {
    const app = appNameOf(p.application_id);
    if (rest > 0 || setup === 0) {
      lines.push({ name: `${app} · ${month}`, code: 'VNT-APP', quantity: 1, unitMinor: rest });
    }
    if (setup > 0) {
      lines.push({
        name: `Implementare ${app} · o singură dată`,
        code: 'VNT-SETUP',
        quantity: 1,
        unitMinor: setup,
      });
    }
  } else {
    const packs = Math.max(1, p.packs ?? 1);
    const even = packs > 1 && rest % packs === 0;
    if (rest > 0 || setup === 0) {
      lines.push({
        name: `Pachet în plus · ${p.item_name ?? ''}`.trim(),
        code: 'VNT-PACK',
        quantity: even ? packs : 1,
        unitMinor: even ? rest / packs : rest,
      });
    }
    if (setup > 0) {
      lines.push({
        name: `Implementare ${p.item_name ?? ''} · o singură dată`.replace(/\s+/g, ' '),
        code: 'VNT-SETUP',
        quantity: 1,
        unitMinor: setup,
      });
    }
  }
  return { lines, paidOn };
}

export type IssueOutcome =
  | 'issued'
  | 'pending'
  | 'failed'
  /** Not due, already issued / failed, claimed by another run, or a storno waiting. */
  | 'skipped';

const backoff = (attempts: number) =>
  BACKOFF_MS[Math.min(Math.max(attempts, 1), BACKOFF_MS.length) - 1]!;

async function lockRow(client: PoolClient, invoiceId: string): Promise<InvoiceRow | null> {
  const { rows } = await client.query<InvoiceRow>(
    `SELECT ${COLUMNS} FROM billing.invoice WHERE id = $1 FOR UPDATE`,
    [invoiceId],
  );
  return rows[0] ?? null;
}

async function markFailedInTx(
  client: PoolClient,
  exec: AuditSqlExecutor,
  row: InvoiceRow,
  error: string,
  kind: 'rejected' | 'ambiguous',
): Promise<void> {
  await client.query(
    `UPDATE billing.invoice
        SET status = 'failed', failed_at = now(), claimed_until = NULL, last_error = $2,
            updated_at = now()
      WHERE id = $1`,
    [row.id, error.slice(0, 500)],
  );
  await appendAuditEventInTx(exec, {
    category: 'commercial',
    action: AuditActions.billingInvoiceFailed,
    outcome: 'failure',
    actorType: 'system',
    organizationId: row.organization_id,
    targetType: 'invoice',
    targetId: row.id,
    metadata: { kind: row.kind, errorKind: kind, attempts: row.attempts },
  });
}

/**
 * One attempt at one invoice, in its business's context. Safe to call from several runs at once:
 * only the run holding the claim calls the provider.
 */
export async function issueInvoice(
  organizationId: string,
  invoiceId: string,
): Promise<IssueOutcome> {
  if (!UUID_RE.test(organizationId ?? '')) throw new InvalidInput('organizationId');
  if (!UUID_RE.test(invoiceId ?? '')) throw new InvalidInput('invoiceId');
  const provider = getInvoiceProvider();

  // the lines are read before the claim (the plan's name comes from core/commercial)
  const first = await withBillingRead(organizationId, async (client) => {
    const { rows } = await client.query<InvoiceRow>(
      `SELECT ${COLUMNS} FROM billing.invoice WHERE id = $1`,
      [invoiceId],
    );
    const row = rows[0];
    if (!row || row.status !== 'pending' || row.kind !== 'invoice' || row.lines) return null;
    return linesOf(client, organizationId, row.payment_id!);
  });

  // a. claim
  const claim = await withBillingWrite(organizationId, async (client, exec) => {
    const row = await lockRow(client, invoiceId);
    if (!row || row.status !== 'pending') return { outcome: 'skipped' as const };
    const now = Date.now();
    if (row.next_attempt_at.getTime() > now) return { outcome: 'skipped' as const };
    if (row.claimed_until) {
      if (row.claimed_until.getTime() > now) return { outcome: 'skipped' as const };
      // an attempt ended without a result: it may have issued — Founder checks, no second call
      await markFailedInTx(
        client,
        exec,
        row,
        'ambiguous: the previous attempt did not finish; check SmartBill before retrying',
        'ambiguous',
      );
      return { outcome: 'failed' as const, row };
    }
    let original: InvoiceRow | null = null;
    if (row.kind === 'storno') {
      const { rows } = await client.query<InvoiceRow>(
        `SELECT ${COLUMNS} FROM billing.invoice WHERE id = $1`,
        [row.reverses_invoice_id],
      );
      original = rows[0] ?? null;
      if (!original || original.status !== 'issued') {
        // the storno waits for its invoice (not an attempt)
        await client.query(
          `UPDATE billing.invoice SET next_attempt_at = now() + $2 * interval '1 millisecond',
                  updated_at = now() WHERE id = $1`,
          [row.id, STORNO_WAIT_MS],
        );
        return { outcome: 'skipped' as const };
      }
    }
    if (row.provider !== provider.name) {
      // written for another provider (test data under SmartBill, or the reverse): it waits
      await client.query(
        `UPDATE billing.invoice SET last_error = $2, next_attempt_at = now() + interval '1 hour',
                updated_at = now() WHERE id = $1`,
        [row.id, `provider mismatch: invoice for ${row.provider}, configured ${provider.name}`],
      );
      return { outcome: 'pending' as const, row };
    }
    let lines = row.lines;
    let buyer = row.buyer;
    if (row.kind === 'invoice' && !lines)
      lines = (first ?? (await linesOf(client, organizationId, row.payment_id!))).lines;
    if (row.kind === 'invoice' && !buyer) buyer = await buyerOf(client, organizationId);
    const { rows } = await client.query<InvoiceRow>(
      `UPDATE billing.invoice
          SET attempts = attempts + 1, claimed_until = now() + $2 * interval '1 millisecond',
              lines = $3::jsonb, buyer = $4::jsonb, updated_at = now()
        WHERE id = $1
        RETURNING ${COLUMNS}`,
      [
        row.id,
        CLAIM_MS,
        lines ? JSON.stringify(lines) : null,
        buyer ? JSON.stringify(buyer) : null,
      ],
    );
    let paidOn: string | null = null;
    if (row.kind === 'invoice') {
      const { rows: pay } = await client.query<{ occurred_at: Date }>(
        `SELECT occurred_at FROM billing.payment WHERE id = $1`,
        [row.payment_id],
      );
      paidOn = pay[0] ? romanianDate(pay[0].occurred_at) : null;
    }
    return { outcome: 'claimed' as const, row: rows[0]!, original, paidOn };
  });
  if (claim.outcome !== 'claimed') return claim.outcome;

  // b. the provider
  const row = claim.row;
  const issueDate = romanianDate(new Date());
  let doc: IssuedDocument;
  try {
    doc =
      row.kind === 'storno'
        ? await provider.reverse({
            reference: row.id,
            series: claim.original!.series!,
            number: claim.original!.number!,
            issueDate,
          })
        : await provider.issue({
            reference: row.id,
            issueDate,
            currency: row.currency,
            buyer: row.buyer!,
            lines: row.lines!,
            paid: { amountMinor: Number(row.amount_minor), date: claim.paidOn ?? issueDate },
          });
  } catch (err) {
    const kind = err instanceof InvoiceProviderError ? err.kind : 'ambiguous';
    const message = err instanceof Error ? err.message : String(err);
    // c. not issued (or uncertain)
    await withBillingWrite(organizationId, async (client, exec) => {
      if (kind === 'retryable') {
        await client.query(
          `UPDATE billing.invoice
              SET claimed_until = NULL, last_error = $2,
                  next_attempt_at = now() + $3 * interval '1 millisecond', updated_at = now()
            WHERE id = $1`,
          [row.id, message.slice(0, 500), backoff(row.attempts)],
        );
      } else {
        await markFailedInTx(client, exec, row, `${kind}: ${message}`, kind);
      }
    });
    if (kind !== 'retryable' || row.attempts >= INVOICE_ALERT_ATTEMPTS) {
      reportBillingError(`invoice ${kind}`, err, { organizationId });
    }
    return kind === 'retryable' ? 'pending' : 'failed';
  }

  // c. issued
  await withBillingWrite(organizationId, async (client, exec) => {
    await client.query(
      `UPDATE billing.invoice
          SET status = 'issued', series = $2, number = $3, provider_document_id = $4,
              issue_date = $5::date, issued_at = now(), claimed_until = NULL, last_error = NULL,
              updated_at = now()
        WHERE id = $1`,
      [
        row.id,
        doc.series.slice(0, 16),
        doc.number.slice(0, 32),
        doc.documentId?.slice(0, 64) ?? null,
        issueDate,
      ],
    );
    await appendAuditEventInTx(exec, {
      category: 'commercial',
      action: AuditActions.billingInvoiceIssued,
      outcome: 'success',
      actorType: 'system',
      organizationId,
      targetType: 'invoice',
      targetId: row.id,
      metadata: {
        kind: row.kind,
        series: doc.series,
        number: doc.number,
        amountMinor: Number(row.amount_minor),
        currency: row.currency,
      },
    });
    await writeOutboxEvent(client, 'billing', BillingInvoiceIssuedV1, {
      organizationId,
      sourceApp: BillingInvoiceIssuedV1.sourceApp,
      resourceId: row.id,
      payload: {
        invoiceId: row.id,
        kind: row.kind,
        paymentId: row.payment_id,
        amountMinor: Number(row.amount_minor),
        currency: row.currency,
      },
    });
  });
  return 'issued';
}

/**
 * The platform job (`commercial.invoice-retry`, and right after the outbox dispatch): every
 * invoice due, each in its business's context, one at a time (SmartBill: 30 calls / 10 s).
 */
export async function runInvoiceIssueJob(opts: { limit?: number } = {}): Promise<{
  due: number;
  outcomes: Record<IssueOutcome, number>;
  errors: Array<{ invoiceId: string; organizationId: string; error: unknown }>;
}> {
  const { rows } = await withBillingModule((client) =>
    client.query<{ id: string; organization_id: string }>(
      `SELECT id, organization_id FROM billing.invoices_due($1)`,
      [opts.limit ?? 20],
    ),
  );
  const outcomes: Record<IssueOutcome, number> = { issued: 0, pending: 0, failed: 0, skipped: 0 };
  const errors: Array<{ invoiceId: string; organizationId: string; error: unknown }> = [];
  for (const r of rows) {
    try {
      outcomes[await issueInvoice(r.organization_id, r.id)]++;
    } catch (error) {
      errors.push({ invoiceId: r.id, organizationId: r.organization_id, error });
    }
  }
  return { due: rows.length, outcomes, errors };
}

// ── 3. the storno: a full refund made by Founder in Stripe (D3-10) ──────────────────────────

/**
 * `charge.refunded` (in the webhook's transaction): a full refund of a payment Ventora recorded
 * asks for the storno of its invoice. A partial refund changes nothing here: it is reported for
 * Founder (the storno of a part is not decided, see the 3.6 report).
 */
export async function refundInTx(
  client: PoolClient,
  exec: AuditSqlExecutor,
  organizationId: string,
  charge: Record<string, unknown>,
): Promise<'storno' | 'partial' | 'unknown'> {
  const chargeId = String(charge.id);
  const amount = Number(charge.amount);
  const refunded = Number(charge.amount_refunded);
  const stripeInvoice =
    typeof charge.invoice === 'string'
      ? charge.invoice
      : ((charge.invoice as { id?: string } | null)?.id ?? null);
  const { rows } = await client.query<{ id: string; amount_minor: string; currency: string }>(
    `SELECT id, amount_minor::text AS amount_minor, currency FROM billing.payment
      WHERE status = 'succeeded'
        AND (idempotency_key = $1 OR ($2::text IS NOT NULL AND stripe_invoice_id = $2))
      ORDER BY occurred_at DESC LIMIT 1`,
    [chargeId, stripeInvoice],
  );
  const payment = rows[0];
  if (!payment) return 'unknown';
  const full = refunded >= amount && amount > 0;
  await appendAuditEventInTx(exec, {
    category: 'commercial',
    action: AuditActions.billingPaymentRefunded,
    outcome: 'success',
    actorType: 'system',
    organizationId,
    targetType: 'payment',
    targetId: payment.id,
    metadata: { refundedMinor: refunded, amountMinor: amount, full },
  });
  if (!full) {
    reportBillingError('partial refund: no storno', new Error('partial refund'), {
      organizationId,
    });
    return 'partial';
  }
  // the invoice exists, or is written now (the refund came before the consumer)
  await insertPendingInvoice(client, {
    organizationId,
    paymentId: payment.id,
    amountMinor: Number(payment.amount_minor),
    currency: payment.currency,
  });
  await client.query(
    `INSERT INTO billing.invoice
       (id, organization_id, kind, payment_id, reverses_invoice_id, provider, amount_minor, currency)
     SELECT $1, i.organization_id, 'storno', i.payment_id, i.id, i.provider, i.amount_minor, i.currency
       FROM billing.invoice i
      WHERE i.payment_id = $2 AND i.kind = 'invoice'
     ON CONFLICT (reverses_invoice_id) DO NOTHING`,
    [uuidv7(), payment.id],
  );
  return 'storno';
}

// ── reads ───────────────────────────────────────────────────────────────────────────────────

export interface InvoiceSummary {
  id: string;
  paymentId: string | null;
  kind: 'invoice' | 'storno';
  status: 'pending' | 'issued' | 'failed';
  series: string | null;
  number: string | null;
  issueDate: string | null;
  amountMinor: number;
  currency: InvoiceCurrency;
}

/** The invoices of these payments, in the business's context (the Hub's list, Lot 3.7). */
export async function invoicesOfPaymentsInTx(
  client: PoolClient,
  paymentIds: string[],
): Promise<Map<string, InvoiceSummary>> {
  if (!paymentIds.length) return new Map();
  const { rows } = await client.query<{
    id: string;
    payment_id: string;
    kind: 'invoice' | 'storno';
    status: 'pending' | 'issued' | 'failed';
    series: string | null;
    number: string | null;
    issue_date: string | null;
    amount_minor: string;
    currency: InvoiceCurrency;
  }>(
    `SELECT id, payment_id, kind, status, series, number, issue_date::text AS issue_date,
            amount_minor::text AS amount_minor, currency
       FROM billing.invoice
      WHERE kind = 'invoice' AND payment_id = ANY($1::uuid[])`,
    [paymentIds],
  );
  return new Map(
    rows.map((r) => [
      r.payment_id,
      {
        id: r.id,
        paymentId: r.payment_id,
        kind: r.kind,
        status: r.status,
        series: r.series,
        number: r.number,
        issueDate: r.issue_date,
        amountMinor: Number(r.amount_minor),
        currency: r.currency,
      },
    ]),
  );
}
