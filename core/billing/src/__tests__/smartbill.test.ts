import { describe, it, expect } from 'vitest';
import {
  DEFAULT_VAT_MENTION,
  InvoiceProviderError,
  SmartBillInvoiceProvider,
  TestInvoiceProvider,
  romanianDate,
  romanianMonth,
  smartBillConfigFromEnv,
  type IssueInvoiceInput,
  type SmartBillConfig,
} from '../index';

/* Lot 3.6 — the SmartBill adapter without the network: what is sent (API V1, the OpenAPI spec of
   api.smartbill.ro) and how each answer is classified (retryable / rejected / ambiguous). The
   real call runs once, locally, on the SmartBill test account (see the 3.6 report). */

const INPUT: IssueInvoiceInput = {
  reference: '0190e7f4-0000-7000-8000-000000000001',
  issueDate: '2026-11-04',
  currency: 'RON',
  buyer: {
    name: 'Salon Ana SRL',
    vatCode: 'RO123',
    regCom: null,
    address: null,
    city: 'Sibiu',
    county: 'Sibiu',
    country: 'Romania',
    email: null,
    isTaxPayer: false,
  },
  lines: [{ name: 'Pachet în plus · 500 SMS', code: 'VNT-PACK', quantity: 2, unitMinor: 4950 }],
  paid: { amountMinor: 9900, date: '2026-11-03' },
};

type Call = { url: string; init: RequestInit };

function provider(
  answer: () => Response | Promise<Response>,
  extra: Partial<SmartBillConfig> = {},
) {
  const calls: Call[] = [];
  const fetchFake = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return answer();
  }) as unknown as typeof fetch;
  const p = new SmartBillInvoiceProvider({
    user: 'api@test.local',
    token: 'tok-test', // gitleaks:allow
    cif: 'RO999',
    series: 'TST',
    vatMention: DEFAULT_VAT_MENTION,
    measuringUnit: 'buc',
    tax: null,
    fetch: fetchFake,
    ...extra,
  });
  return { p, calls };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function kindOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'ok';
  } catch (err) {
    return err instanceof InvoiceProviderError ? err.kind : `other: ${String(err)}`;
  }
}

describe('Lot 3.6 — SmartBill adapter', () => {
  it('sends the invoice as paid by card, without VAT fields, with the configured mention', async () => {
    const { p, calls } = provider(() =>
      json(200, { errorText: '', number: '0007', series: 'TST', documentId: 42 }),
    );
    expect(await p.issue(INPUT)).toEqual({ series: 'TST', number: '0007', documentId: '42' });
    expect(calls[0]!.url).toBe('https://ws.smartbill.ro/SBORO/api/invoice/v2');
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from('api@test.local:tok-test').toString('base64')}`,
    );
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body).toMatchObject({
      companyVatCode: 'RO999',
      seriesName: 'TST',
      issueDate: '2026-11-04',
      currency: 'RON',
      language: 'RO',
      sendEmail: false,
      useStock: false,
      mentions: DEFAULT_VAT_MENTION,
      client: {
        name: 'Salon Ana SRL',
        vatCode: 'RO123',
        city: 'Sibiu',
        country: 'Romania',
        saveToDb: false,
      },
      products: [
        {
          name: 'Pachet în plus · 500 SMS',
          code: 'VNT-PACK',
          isService: true,
          quantity: 2,
          price: 49.5,
          measuringUnitName: 'buc',
          saveToDb: false,
        },
      ],
      payment: { value: 99, type: 'Card', isCash: false },
      paymentDate: '2026-11-03',
    });
    expect(body.products[0]).not.toHaveProperty('taxPercentage');
    expect(body.client).not.toHaveProperty('regCom');
  });

  it('with a tax configured: the rate on every line, the price with it included', async () => {
    const { p, calls } = provider(() => json(200, { errorText: '', number: '1', series: 'TST' }), {
      tax: { name: 'SDD', percentage: 0 },
    });
    await p.issue(INPUT);
    expect(JSON.parse(String(calls[0]!.init.body)).products[0]).toMatchObject({
      taxName: 'SDD',
      taxPercentage: 0,
      isTaxIncluded: true,
    });
  });

  it('classifies the answers: down → retryable, refused → rejected, maybe processed → ambiguous', async () => {
    const cases: Array<[() => Response | Promise<Response>, string]> = [
      [() => json(503, {}), 'retryable'],
      [() => json(502, {}), 'retryable'],
      [() => json(429, {}), 'retryable'],
      [() => json(401, {}), 'retryable'],
      [() => json(500, {}), 'ambiguous'],
      [() => json(504, {}), 'ambiguous'],
      [() => json(200, { errorText: 'Seria nu a fost gasita!' }), 'rejected'],
      [() => json(400, { errorText: 'Client invalid!' }), 'rejected'],
      [
        () =>
          json(400, {
            type: 'invalid_request_error',
            errors: [{ code: 'json_mapping_error', message: 'Could not map property: x.' }],
          }),
        'rejected',
      ],
      [() => json(200, { errorText: '' }), 'ambiguous'],
      [() => new Response('not json', { status: 200 }), 'ambiguous'],
      [
        () => {
          throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
        },
        'retryable',
      ],
      [
        () => {
          throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
        },
        'ambiguous',
      ],
      [
        () => {
          throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        },
        'ambiguous',
      ],
    ];
    for (const [answer, expected] of cases) {
      const { p } = provider(answer);
      expect(await kindOf(p.issue(INPUT))).toBe(expected);
    }
  });

  it('the error message never carries the token', async () => {
    const { p } = provider(() => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
    });
    const err = await p.issue(INPUT).catch((e: unknown) => e as Error);
    expect(String((err as Error).message)).not.toContain('tok-test');
  });

  it('the storno: the original series and number', async () => {
    const { p, calls } = provider(() =>
      json(200, { errorText: '', number: '0008', series: 'TST' }),
    );
    expect(
      await p.reverse({ reference: 'x', series: 'TST', number: '0007', issueDate: '2026-11-05' }),
    ).toMatchObject({ series: 'TST', number: '0008' });
    expect(calls[0]!.url).toBe('https://ws.smartbill.ro/SBORO/api/invoice/reverse');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      companyVatCode: 'RO999',
      seriesName: 'TST',
      number: '0007',
      issueDate: '2026-11-05',
    });
  });

  it('the PDF: never Accept application/pdf; a 502 (missing invoice) is not a PDF', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.4 test');
    const { p, calls } = provider(() => new Response(pdf, { status: 200 }));
    expect(await p.fetchPdf('TST', '0007')).toEqual(pdf);
    expect(calls[0]!.url).toBe(
      'https://ws.smartbill.ro/SBORO/api/invoice/pdf?cif=RO999&seriesname=TST&number=0007',
    );
    expect((calls[0]!.init.headers as Record<string, string>).Accept).toBe(
      'application/octet-stream',
    );
    const missing = provider(() => new Response('<html>502</html>', { status: 502 }));
    expect(await kindOf(missing.p.fetchPdf('TST', '9999'))).toBe('retryable');
    const html = provider(() => new Response('<html>ok</html>', { status: 200 }));
    expect(await kindOf(html.p.fetchPdf('TST', '1'))).toBe('rejected');
  });

  it('the configuration from the environment: complete or nothing; the mention and the unit with defaults', () => {
    expect(smartBillConfigFromEnv({ SMARTBILL_USER: 'a', SMARTBILL_TOKEN: 'b' })).toBeNull();
    const c = smartBillConfigFromEnv({
      SMARTBILL_USER: 'a',
      SMARTBILL_TOKEN: 'b',
      SMARTBILL_CIF: 'RO1',
      SMARTBILL_SERIES: 'TST',
    })!;
    expect(c).toMatchObject({
      series: 'TST',
      vatMention: DEFAULT_VAT_MENTION,
      measuringUnit: 'buc',
      tax: null,
    });
    expect(
      smartBillConfigFromEnv({
        SMARTBILL_USER: 'a',
        SMARTBILL_TOKEN: 'b',
        SMARTBILL_CIF: 'RO1',
        SMARTBILL_SERIES: 'TST',
        SMARTBILL_VAT_MENTION: 'Altă mențiune',
        SMARTBILL_TAX_NAME: 'SDD',
        SMARTBILL_TAX_PERCENTAGE: '0',
      }),
    ).toMatchObject({ vatMention: 'Altă mențiune', tax: { name: 'SDD', percentage: 0 } });
  });
});

describe('Lot 3.6 — the test provider and the dates', () => {
  it('numbers its documents, fails on request, reverses only what it issued', async () => {
    const t = new TestInvoiceProvider('TST');
    t.failNext('retryable');
    expect(await kindOf(t.issue(INPUT))).toBe('retryable');
    expect(await t.issue(INPUT)).toMatchObject({ series: 'TST', number: '0001' });
    expect(
      await kindOf(
        t.reverse({ reference: 'x', series: 'TST', number: '0099', issueDate: '2026-11-04' }),
      ),
    ).toBe('rejected');
    expect(
      await t.reverse({ reference: 'x', series: 'TST', number: '0001', issueDate: '2026-11-04' }),
    ).toMatchObject({
      number: '0002',
    });
    expect(t.calls).toBe(4);
  });

  it('the day and the month in Romania’s time', () => {
    // 31 October 23:30 UTC is already 1 November in Romania (EET, UTC+2)
    const at = new Date('2026-10-31T23:30:00Z');
    expect(romanianDate(at)).toBe('2026-11-01');
    expect(romanianMonth(at)).toBe('noiembrie');
  });
});
