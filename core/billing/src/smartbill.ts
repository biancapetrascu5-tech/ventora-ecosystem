import {
  InvoiceProviderError,
  type InvoiceProvider,
  type IssueInvoiceInput,
  type IssuedDocument,
  type RecordPaymentInput,
  type ReverseInvoiceInput,
} from './invoice-provider';

/*
 * Lot 3.6 — the SmartBill adapter (API V1, https://ws.smartbill.ro/SBORO/api, the OpenAPI spec
 * from api.smartbill.ro): Basic auth with the account's e-mail and API token.
 *
 *   POST /invoice/v2       the invoice, issued as paid by card („încasată”)
 *   POST /invoice/reverse  the storno of an invoice
 *   GET  /invoice/pdf      the PDF (Accept must not be application/pdf: 406)
 *   POST /payment          Lot 3.8 (N16): the receipt of a transfer invoice („Ordin plata”).
 *                          DE VALIDAT TEHNIC: the spec page (api.smartbill.ro, rendered in the
 *                          browser) could not be read by the agent; the body follows the V1
 *                          receipt shape and the call runs only with SMARTBILL_RECORD_PAYMENTS=1,
 *                          after one check on the test account.
 *
 * V1 answers with `errorText`: empty = success. Rate limit: 30 calls / 10 s per token (blocked
 * for 10 minutes beyond it) — the job issues one at a time.
 *
 * Ventora Systems SRL is not a VAT payer: no VAT fields on the lines (the spec's example 14),
 * unless SMARTBILL_TAX_NAME / SMARTBILL_TAX_PERCENTAGE are set. The mention printed on the
 * invoice is SMARTBILL_VAT_MENTION — DE CONFIRMAT CU CONTABILUL (FAZA-3 §6, întrebarea 1); the
 * default below is only a proposal.
 */

const BASE_URL = 'https://ws.smartbill.ro/SBORO/api';
const TIMEOUT_MS = 20_000;

/** PROPUS — de confirmat cu contabilul (FAZA-3 §6.1): the mention for a company without VAT. */
export const DEFAULT_VAT_MENTION =
  'Furnizor neplătitor de TVA (regim special de scutire, art. 310 din Codul fiscal).';

export interface SmartBillConfig {
  user: string;
  token: string;
  /** The company's CIF, exactly as in SmartBill Cloud. */
  cif: string;
  /** The invoice series, as configured in the account (TST on the test account). */
  series: string;
  vatMention: string;
  /** Must exist in the account (case-sensitive). */
  measuringUnit: string;
  /** Only for a VAT payer, or when the accountant asks for an explicit 0% rate. */
  tax: { name: string; percentage: number } | null;
  /** Lot 3.8 (N16): record transfer receipts in SmartBill (off until validated on the test account). */
  recordPayments?: boolean;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** The SmartBill configuration from the environment; null when it is not complete. */
export function smartBillConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): SmartBillConfig | null {
  const user = env.SMARTBILL_USER?.trim();
  const token = env.SMARTBILL_TOKEN?.trim();
  const cif = env.SMARTBILL_CIF?.trim();
  const series = env.SMARTBILL_SERIES?.trim();
  if (!user || !token || !cif || !series) return null;
  const taxName = env.SMARTBILL_TAX_NAME?.trim();
  const taxPct = env.SMARTBILL_TAX_PERCENTAGE?.trim();
  return {
    user,
    token,
    cif,
    series,
    vatMention: env.SMARTBILL_VAT_MENTION?.trim() || DEFAULT_VAT_MENTION,
    measuringUnit: env.SMARTBILL_MEASURING_UNIT?.trim() || 'buc',
    tax:
      taxName && taxPct && !Number.isNaN(Number(taxPct))
        ? { name: taxName, percentage: Number(taxPct) }
        : null,
    recordPayments: env.SMARTBILL_RECORD_PAYMENTS?.trim() === '1',
  };
}

const money = (minor: number) => Math.round(minor) / 100;

// connection errors before anything was sent: SmartBill never saw the request
const NOT_SENT = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
]);

function causeCode(err: unknown): string | undefined {
  const cause = (err as { cause?: { code?: string } } | null)?.cause;
  return cause?.code ?? (err as { code?: string } | null)?.code;
}

export class SmartBillInvoiceProvider implements InvoiceProvider {
  readonly name = 'smartbill' as const;
  private readonly base: string;
  private readonly doFetch: typeof fetch;
  private readonly auth: string;

  constructor(private readonly config: SmartBillConfig) {
    this.base = (config.baseUrl ?? BASE_URL).replace(/\/+$/, '');
    this.doFetch = config.fetch ?? fetch;
    this.auth = `Basic ${Buffer.from(`${config.user}:${config.token}`).toString('base64')}`;
  }

  private async call(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? TIMEOUT_MS);
    try {
      return await this.doFetch(`${this.base}${path}`, {
        ...init,
        headers: { Authorization: this.auth, ...(init.headers ?? {}) },
        signal: controller.signal,
      });
    } catch (err) {
      // the token never goes into a message
      const code = causeCode(err);
      if (code && NOT_SENT.has(code)) {
        throw new InvoiceProviderError('retryable', `SmartBill unreachable (${code})`);
      }
      if ((err as { name?: string } | null)?.name === 'AbortError') {
        throw new InvoiceProviderError('ambiguous', 'SmartBill did not answer in time');
      }
      throw new InvoiceProviderError(
        'ambiguous',
        `SmartBill connection lost (${code ?? 'unknown'})`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /** POST a document; the answer's `errorText` decides (empty = success). */
  private async postDocument(path: string, body: unknown): Promise<IssuedDocument> {
    const res = await this.call(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const status = res.status;
    if (status === 429 || status === 502 || status === 503 || status === 401 || status === 403) {
      // not processed: overloaded, down, or the credentials / rights (fixed, then retried)
      throw new InvoiceProviderError('retryable', `SmartBill HTTP ${status}`, status);
    }
    if (status >= 500) {
      throw new InvoiceProviderError('ambiguous', `SmartBill HTTP ${status}`, status);
    }
    let json: Record<string, unknown> = {};
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      throw new InvoiceProviderError(
        status >= 200 && status < 300 ? 'ambiguous' : 'rejected',
        `SmartBill HTTP ${status}: unreadable answer`,
        status,
      );
    }
    const errorText = typeof json.errorText === 'string' ? json.errorText.trim() : '';
    const mapping = Array.isArray(json.errors)
      ? (json.errors as Array<{ code?: string; message?: string }>)
          .map((e) => e.message ?? e.code)
          .join('; ')
      : '';
    if (errorText || mapping || status >= 400) {
      throw new InvoiceProviderError(
        'rejected',
        `SmartBill: ${(errorText || mapping || `HTTP ${status}`).slice(0, 400)}`,
        status,
      );
    }
    const series = typeof json.series === 'string' ? json.series : '';
    const number = typeof json.number === 'string' ? json.number : String(json.number ?? '');
    if (!series || !number) {
      throw new InvoiceProviderError('ambiguous', 'SmartBill answered without series or number');
    }
    const documentId =
      json.documentId === undefined || json.documentId === null || json.documentId === -1
        ? null
        : String(json.documentId);
    return { series, number, documentId };
  }

  async issue(input: IssueInvoiceInput): Promise<IssuedDocument> {
    const c = this.config;
    const b = input.buyer;
    const client: Record<string, unknown> = {
      name: b.name,
      country: b.country,
      isTaxPayer: b.isTaxPayer,
      saveToDb: false,
    };
    if (b.vatCode) client.vatCode = b.vatCode;
    if (b.regCom) client.regCom = b.regCom;
    if (b.address) client.address = b.address;
    if (b.city) client.city = b.city;
    if (b.county) client.county = b.county;
    if (b.email) client.email = b.email;
    const products = input.lines.map((l) => ({
      name: l.name,
      code: l.code,
      isService: true,
      quantity: l.quantity,
      measuringUnitName: c.measuringUnit,
      price: money(l.unitMinor),
      currency: input.currency,
      saveToDb: false,
      ...(c.tax
        ? { isTaxIncluded: true, taxName: c.tax.name, taxPercentage: c.tax.percentage }
        : {}),
    }));
    const body: Record<string, unknown> = {
      companyVatCode: c.cif,
      seriesName: c.series,
      issueDate: input.issueDate,
      client,
      products,
      currency: input.currency,
      language: 'RO',
      precision: 2,
      useStock: false,
      sendEmail: false,
      mentions: c.vatMention,
      observations: `Ventora Systems ${input.reference}`,
    };
    if (input.paid) {
      body.payment = { value: money(input.paid.amountMinor), type: 'Card', isCash: false };
      body.paymentDate = input.paid.date;
    }
    // Lot 3.8: a transfer invoice, unpaid, with its due date (D3-11)
    if (input.dueDate) body.dueDate = input.dueDate;
    return this.postDocument('/invoice/v2', body);
  }

  async reverse(input: ReverseInvoiceInput): Promise<IssuedDocument> {
    return this.postDocument('/invoice/reverse', {
      companyVatCode: this.config.cif,
      seriesName: input.series,
      number: input.number,
      issueDate: input.issueDate,
    });
  }

  /** Lot 3.8 (N16): the receipt of a transfer invoice; skipped until SMARTBILL_RECORD_PAYMENTS=1. */
  async recordPayment(input: RecordPaymentInput): Promise<{ number: string | null }> {
    if (!this.config.recordPayments) {
      throw new InvoiceProviderError(
        'retryable',
        'SmartBill receipts are off (SMARTBILL_RECORD_PAYMENTS)',
      );
    }
    const b = input.buyer;
    const client: Record<string, unknown> = {
      name: b.name,
      country: b.country,
      isTaxPayer: b.isTaxPayer,
      saveToDb: false,
    };
    if (b.vatCode) client.vatCode = b.vatCode;
    if (b.address) client.address = b.address;
    if (b.city) client.city = b.city;
    if (b.county) client.county = b.county;
    const res = await this.call('/payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        companyVatCode: this.config.cif,
        client,
        issueDate: input.date,
        currency: input.currency,
        precision: 2,
        value: money(input.amountMinor),
        isDraft: false,
        type: 'Ordin plata',
        isCash: false,
        useInvoiceDetails: false,
        invoicesList: [{ seriesName: input.series, number: input.number }],
        observation: `Ventora Systems ${input.reference}`,
      }),
    });
    if (
      res.status === 429 ||
      res.status === 502 ||
      res.status === 503 ||
      res.status === 401 ||
      res.status === 403
    ) {
      throw new InvoiceProviderError('retryable', `SmartBill HTTP ${res.status}`, res.status);
    }
    let json: Record<string, unknown> = {};
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      throw new InvoiceProviderError(
        'ambiguous',
        `SmartBill HTTP ${res.status}: unreadable answer`,
        res.status,
      );
    }
    const errorText = typeof json.errorText === 'string' ? json.errorText.trim() : '';
    if (errorText || res.status >= 400) {
      throw new InvoiceProviderError(
        res.status >= 500 ? 'ambiguous' : 'rejected',
        `SmartBill: ${(errorText || `HTTP ${res.status}`).slice(0, 400)}`,
        res.status,
      );
    }
    return {
      number: json.number === undefined || json.number === null ? null : String(json.number),
    };
  }

  async fetchPdf(series: string, number: string): Promise<Uint8Array> {
    const q = new URLSearchParams({ cif: this.config.cif, seriesname: series, number });
    const res = await this.call(`/invoice/pdf?${q}`, {
      method: 'GET',
      headers: { Accept: 'application/octet-stream' },
    });
    // a missing invoice or parameter is a 502 with an HTML body (the spec)
    if (!res.ok) {
      throw new InvoiceProviderError(
        res.status === 502 || res.status === 503 || res.status === 429 ? 'retryable' : 'rejected',
        `SmartBill PDF HTTP ${res.status}`,
        res.status,
      );
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length < 5 || String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') {
      throw new InvoiceProviderError('rejected', 'SmartBill PDF: not a PDF');
    }
    return bytes;
  }
}
