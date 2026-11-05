/*
 * Lot 3.6 — who issues the invoices (FAZA-3 §3.6): an `InvoiceProvider`, as for e-mail. The
 * platform never calls SmartBill directly: it issues through core/billing, which uses the provider
 * set here (SmartBill from the environment; the test provider in CI and in the tests).
 *
 * A provider error says what is known about the document:
 *   - `retryable`: the provider did not take the request (down, overloaded, credentials, not
 *     configured) — nothing was issued, the invoice stays `pending` and is tried again;
 *   - `rejected`:  the provider answered with an error (data, series, account limit) — nothing was
 *     issued, retrying the same request gives the same answer: `failed`, Founder looks at it;
 *   - `ambiguous`: the request may have been processed (timeout, 500, connection lost after
 *     sending) — retrying could issue a second invoice, so it is `failed` for Founder to check in
 *     SmartBill, never retried by itself.
 */

import { SmartBillInvoiceProvider, smartBillConfigFromEnv } from './smartbill';

export type InvoiceProviderName = 'smartbill' | 'test';
export type InvoiceCurrency = 'RON' | 'EUR';

export interface InvoiceBuyer {
  name: string;
  /** CUI / CIF; null for a business without one yet (see the 3.6 report, D3-17). */
  vatCode: string | null;
  regCom: string | null;
  address: string | null;
  city: string | null;
  county: string | null;
  country: string;
  email: string | null;
  isTaxPayer: boolean;
}

export interface InvoiceLine {
  /** „Abonament Business · noiembrie”, „Pachet în plus · 500 SMS” (the glossary). */
  name: string;
  /** A stable product code (SmartBill asks for one when the account uses product codes). */
  code: string;
  quantity: number;
  /** The unit price in minor units (bani / cents). */
  unitMinor: number;
}

export interface IssueInvoiceInput {
  /** Ventora's id of the invoice: sent as the observation, so it can be found in SmartBill. */
  reference: string;
  /** YYYY-MM-DD, in Romania's time. */
  issueDate: string;
  currency: InvoiceCurrency;
  buyer: InvoiceBuyer;
  lines: InvoiceLine[];
  /** The card payment it is for: the invoice is issued as paid („încasată”). */
  paid: { amountMinor: number; date: string } | null;
  /** Lot 3.8: a transfer invoice's due date (YYYY-MM-DD); null for one paid by card. */
  dueDate?: string | null;
}

/** Lot 3.8 (N16): a transfer received for an issued invoice, recorded with the provider. */
export interface RecordPaymentInput {
  reference: string;
  series: string;
  number: string;
  /** YYYY-MM-DD, the day the money arrived. */
  date: string;
  amountMinor: number;
  currency: InvoiceCurrency;
  buyer: InvoiceBuyer;
}

export interface IssuedDocument {
  series: string;
  number: string;
  /** The provider's id of the document, when it gives one. */
  documentId: string | null;
}

export interface ReverseInvoiceInput {
  reference: string;
  series: string;
  number: string;
  issueDate: string;
}

export type InvoiceErrorKind = 'retryable' | 'rejected' | 'ambiguous';

export class InvoiceProviderError extends Error {
  constructor(
    readonly kind: InvoiceErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'InvoiceProviderError';
  }
}

export interface InvoiceProvider {
  readonly name: InvoiceProviderName;
  issue(input: IssueInvoiceInput): Promise<IssuedDocument>;
  /** The storno of an issued invoice (D3-10: the refund made by Founder). */
  reverse(input: ReverseInvoiceInput): Promise<IssuedDocument>;
  /** The PDF of an issued invoice, served to the Hub through a signed link (never a public one). */
  fetchPdf(series: string, number: string): Promise<Uint8Array>;
  /**
   * Lot 3.8 (N16): the receipt („încasare”) of a transfer invoice. Optional: a provider without
   * it leaves the receipt to be recorded by hand in its own interface.
   */
  recordPayment?(input: RecordPaymentInput): Promise<{ number: string | null }>;
}

/** No provider configured: nothing is issued, every attempt waits (`retryable`). */
export class UnconfiguredInvoiceProvider implements InvoiceProvider {
  readonly name = 'smartbill' as const;
  private fail(): never {
    throw new InvoiceProviderError('retryable', 'Invoice provider not configured');
  }
  async issue(): Promise<IssuedDocument> {
    this.fail();
  }
  async reverse(): Promise<IssuedDocument> {
    this.fail();
  }
  async fetchPdf(): Promise<Uint8Array> {
    this.fail();
  }
}

let provider: InvoiceProvider | undefined;
let factory: (() => InvoiceProvider) | undefined;

/** How the provider is made; by default SmartBill from the environment (SMARTBILL_*). */
export function setInvoiceProviderFactory(make: () => InvoiceProvider): void {
  factory = make;
  provider = undefined;
}

function fromEnv(): InvoiceProvider {
  const config = smartBillConfigFromEnv();
  return config ? new SmartBillInvoiceProvider(config) : new UnconfiguredInvoiceProvider();
}

export function getInvoiceProvider(): InvoiceProvider {
  provider ??= (factory ?? fromEnv)();
  return provider;
}

/** Tests: the provider to use (null: back to the factory). */
export function setInvoiceProviderForTests(next: InvoiceProvider | null): void {
  provider = next ?? undefined;
}
