import {
  InvoiceProviderError,
  type InvoiceErrorKind,
  type InvoiceProvider,
  type IssueInvoiceInput,
  type IssuedDocument,
  type RecordPaymentInput,
  type ReverseInvoiceInput,
} from './invoice-provider';

/*
 * Lot 3.6 — the test provider (CI, local tests, and the platform when it runs on test data): keeps
 * the documents in memory, numbers them in its own series and can be made to fail, to prove the
 * `pending` → retry → `issued` path without a second invoice.
 */

export interface TestInvoiceDocument {
  series: string;
  number: string;
  kind: 'invoice' | 'storno';
  input: IssueInvoiceInput | ReverseInvoiceInput;
}

export class TestInvoiceProvider implements InvoiceProvider {
  readonly name = 'test' as const;
  readonly documents: TestInvoiceDocument[] = [];
  /** Calls made, including the failed ones. */
  calls = 0;
  private failures: InvoiceErrorKind[] = [];
  private next: number;

  /** `firstNumber`: where the numbering starts (a test database kept between runs). */
  constructor(
    readonly series = 'TEST',
    firstNumber = 1,
  ) {
    this.next = firstNumber;
  }

  /** The next `n` calls fail with this kind (SmartBill down: `retryable`). */
  failNext(kind: InvoiceErrorKind, n = 1): void {
    for (let i = 0; i < n; i++) this.failures.push(kind);
  }

  private take(kind: 'invoice' | 'storno', input: TestInvoiceDocument['input']): IssuedDocument {
    this.calls++;
    const failure = this.failures.shift();
    if (failure) throw new InvoiceProviderError(failure, `test provider: ${failure}`);
    const number = String(this.next++).padStart(4, '0');
    this.documents.push({ series: this.series, number, kind, input });
    return { series: this.series, number, documentId: `test-${number}` };
  }

  async issue(input: IssueInvoiceInput): Promise<IssuedDocument> {
    return this.take('invoice', input);
  }

  async reverse(input: ReverseInvoiceInput): Promise<IssuedDocument> {
    if (!this.documents.some((d) => d.series === input.series && d.number === input.number)) {
      this.calls++;
      throw new InvoiceProviderError('rejected', 'test provider: invoice not found');
    }
    return this.take('storno', input);
  }

  /** Lot 3.8: the receipts recorded (N16). */
  readonly payments: RecordPaymentInput[] = [];

  async recordPayment(input: RecordPaymentInput): Promise<{ number: string | null }> {
    this.calls++;
    const failure = this.failures.shift();
    if (failure) throw new InvoiceProviderError(failure, `test provider: ${failure}`);
    if (!this.documents.some((d) => d.series === input.series && d.number === input.number)) {
      throw new InvoiceProviderError('rejected', 'test provider: invoice not found');
    }
    this.payments.push(input);
    return { number: String(this.payments.length) };
  }

  async fetchPdf(series: string, number: string): Promise<Uint8Array> {
    if (!this.documents.some((d) => d.series === series && d.number === number)) {
      throw new InvoiceProviderError('rejected', 'test provider: invoice not found');
    }
    return new TextEncoder().encode(`%PDF-1.4\n% Ventora test invoice ${series}-${number}\n`);
  }
}
