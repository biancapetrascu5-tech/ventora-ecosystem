import { createHmac, timingSafeEqual } from 'node:crypto';
import { InvalidInput, ResourceNotFound } from '@ventora/errors';
import { assertBuyer, type BillingContext } from './account';
import { withBillingRead } from './db';
import { getInvoiceProvider } from './invoice-provider';

/*
 * Lot 3.6 — „Descarcă PDF” in the Hub (HubAdminPlan · Facturi): never SmartBill's public link. The
 * owner asks for a link (after authorize with `billing.purchase`, D3-8); the link is ours,
 * `/invoices/<token>` on the platform, signed (HMAC SHA-256) and valid for 5 minutes, bound to the
 * invoice and its business. Opening it checks the signature and the expiry, reads the invoice in
 * its business's context (RLS, issued only) and streams the PDF fetched from the provider.
 *
 * The key is FILES_LINK_SECRET (the same server-only secret as the files' links, Lot 4.7), with
 * its own prefix (`billing.invoice.`): a file token is never a valid invoice token, and back.
 */

export class InvoiceLinkRefused extends Error {
  readonly code = 'INVOICE_LINK_REFUSED';
  readonly status: number;
  constructor(readonly reason: 'invalid' | 'expired') {
    super(reason === 'expired' ? 'The invoice link has expired' : 'The invoice link is not valid');
    this.name = 'InvoiceLinkRefused';
    this.status = reason === 'expired' ? 410 : 404;
  }
}

const LINK_SECONDS = 5 * 60;
const MIN_SECRET_LENGTH = 32;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function secret(): string {
  const value = process.env.FILES_LINK_SECRET ?? '';
  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error('[billing] FILES_LINK_SECRET is not set (at least 32 characters, server only)');
  }
  return value;
}

const b64 = (buf: Buffer) => buf.toString('base64url');
const sign = (body: string) =>
  createHmac('sha256', secret()).update(`billing.invoice.${body}`).digest();

export interface InvoiceLinkClaims {
  invoiceId: string;
  organizationId: string;
  /** Unix seconds. */
  expiresAt: number;
}

export function signInvoiceToken(claims: InvoiceLinkClaims): string {
  const body = b64(
    Buffer.from(
      JSON.stringify({ i: claims.invoiceId, o: claims.organizationId, e: claims.expiresAt }),
    ),
  );
  return `${body}.${b64(sign(body))}`;
}

export function verifyInvoiceToken(token: string, now: Date = new Date()): InvoiceLinkClaims {
  const [body, signature, extra] = String(token ?? '').split('.');
  if (!body || !signature || extra !== undefined) throw new InvoiceLinkRefused('invalid');
  const expected = sign(body);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new InvoiceLinkRefused('invalid');
  }
  let raw: { i?: unknown; o?: unknown; e?: unknown };
  try {
    raw = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw new InvoiceLinkRefused('invalid');
  }
  if (
    typeof raw.i !== 'string' ||
    !UUID.test(raw.i) ||
    typeof raw.o !== 'string' ||
    !UUID.test(raw.o) ||
    typeof raw.e !== 'number' ||
    !Number.isSafeInteger(raw.e)
  ) {
    throw new InvoiceLinkRefused('invalid');
  }
  if (raw.e <= Math.floor(now.getTime() / 1000)) throw new InvoiceLinkRefused('expired');
  return { invoiceId: raw.i, organizationId: raw.o, expiresAt: raw.e };
}

interface IssuedRow {
  series: string;
  number: string;
  provider: string;
}

async function issuedInvoice(organizationId: string, invoiceId: string): Promise<IssuedRow | null> {
  return withBillingRead(organizationId, async (client) => {
    const { rows } = await client.query<IssuedRow>(
      `SELECT series, number, provider FROM billing.invoice WHERE id = $1 AND status = 'issued'`,
      [invoiceId],
    );
    return rows[0] ?? null;
  });
}

/**
 * The owner's link to an issued invoice of the business (relative: `/invoices/<token>`). The
 * context comes from authorize() with `billing.purchase`; an invoice of another business, or not
 * issued, is „not found”.
 */
export async function getInvoiceDownloadPath(
  ctx: BillingContext,
  invoiceId: string,
  now: Date = new Date(),
): Promise<string> {
  assertBuyer(ctx);
  if (!UUID.test(invoiceId ?? '')) throw new InvalidInput('invoiceId');
  if (!(await issuedInvoice(ctx.organizationId, invoiceId))) {
    throw new ResourceNotFound('Invoice not found');
  }
  const token = signInvoiceToken({
    invoiceId,
    organizationId: ctx.organizationId,
    expiresAt: Math.floor(now.getTime() / 1000) + LINK_SECONDS,
  });
  return `/invoices/${token}`;
}

/** Opens a link: the PDF and its file name; refused when invalid, expired or not issued. */
export async function openInvoiceLink(
  token: string,
  now: Date = new Date(),
): Promise<{ pdf: Uint8Array; fileName: string }> {
  const claims = verifyInvoiceToken(token, now);
  const row = await issuedInvoice(claims.organizationId, claims.invoiceId);
  if (!row) throw new InvoiceLinkRefused('invalid');
  const provider = getInvoiceProvider();
  if (row.provider !== provider.name) throw new InvoiceLinkRefused('invalid');
  const pdf = await provider.fetchPdf(row.series, row.number);
  const safe = `${row.series}-${row.number}`.replace(/[^A-Za-z0-9-]/g, '');
  return { pdf, fileName: `factura-${safe}.pdf` };
}
