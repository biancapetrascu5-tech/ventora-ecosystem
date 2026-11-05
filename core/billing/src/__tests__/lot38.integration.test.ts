import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { checkRomanianCui } from '../billing-profile';

// Lot 3.8 · Etapa 1 — modelul (migrarea 20261104000021_billing_lifecycle), pe rolurile de runtime
// reale: app_runtime → billing_rw (Hub, job-uri, webhook), founder_runtime → billing_founder
// (echipa, rol nou). Profilul de facturare (D-3.6-1), plata prin transfer (D3-11), factura
// neemisă (D-3.6-5), implementarea plătită cu cardul. Fixturile: DIRECT_URL (postgres).

const adminPool = new Pool({ connectionString: process.env.DIRECT_URL, max: 2 });
const appPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const founderPool = new Pool({ connectionString: process.env.DATABASE_URL_FOUNDER, max: 2 });
let admin: PoolClient;
const q = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;
const newUuid = () => crypto.randomUUID();
/** Every business this file touches: cleaned up in afterAll (the 3.6 job must not see them). */
const touched = new Set<string>();
const founderId = newUuid();
const RUN = newUuid().slice(0, 6).toUpperCase();

type Role = 'billing_rw' | 'billing_founder';

async function as<T>(role: Role, org: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  touched.add(org);
  const client = await (role === 'billing_rw' ? appPool : founderPool).connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${role}`);
    await client.query(`SELECT set_config('app.organization_id', $1, true)`, [org]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
const rw = <T>(org: string, fn: (c: PoolClient) => Promise<T>) => as('billing_rw', org, fn);
const fo = <T>(org: string, fn: (c: PoolClient) => Promise<T>) => as('billing_founder', org, fn);
const one = async (c: PoolClient, sql: string, params: unknown[] = []) =>
  (await c.query(sql, params)).rows[0];

beforeAll(async () => {
  admin = await adminPool.connect();
});

afterAll(async () => {
  // The invoices left pending here are not real: out of the issuing job's way (lot36 runs it on
  // every pending invoice of the database), whatever order the files run in.
  await q(
    `UPDATE billing.invoice SET status = 'failed', failed_at = now(), claimed_until = NULL
      WHERE status = 'pending' AND organization_id = ANY($1::uuid[])`,
    [[...touched]],
  );
  admin.release();
  await adminPool.end();
  await appPool.end();
  await founderPool.end();
});

// ── 2. Profilul de facturare (D-3.6-1) ──────────────────────────────────────────────────────

describe('profilul de facturare', () => {
  const company = {
    entity_type: 'company',
    name: 'Salon Aurora SRL',
    country: 'RO',
    tax_id: 'RO14399840',
    reg_com: 'J32/1234/2019',
    street: 'Str. Bălcescu 12',
    city: 'Sibiu',
    county: 'Sibiu',
    email: 'facturi@salon-aurora.ro',
  };
  const insert = (org: string, p: Record<string, unknown>) =>
    fo(org, (c) =>
      one(
        c,
        `INSERT INTO billing.billing_profile
           (organization_id, entity_type, name, country, tax_id, reg_com, street, city, county, email,
            created_by_founder_id, updated_by_founder_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
        [
          org,
          p.entity_type,
          p.name,
          p.country,
          p.tax_id,
          p.reg_com,
          p.street,
          p.city,
          p.county,
          p.email,
          founderId,
          newUuid(),
        ],
      ),
    );

  it('CUI-ul: aceeași regulă în baza de date și în formular', async () => {
    const vectors = [
      '14399840',
      'RO14399840',
      '1590082',
      '18547290',
      '14399841',
      'RO18547291',
      '014399840',
      '1',
      '12345678901',
      'RX14399840',
    ];
    for (const cui of vectors) {
      const [r] = await q(`SELECT billing.ro_cui_valid($1) AS ok`, [cui]);
      expect(r!.ok, cui).toBe(checkRomanianCui(cui) === 'ok');
    }
  });

  it('echipa scrie: firmă din România, persoană fizică, firmă din Germania', async () => {
    const ro = await insert(newUuid(), company);
    expect(ro.updated_by_founder_id).toBe(founderId);
    await insert(newUuid(), {
      ...company,
      entity_type: 'person',
      name: 'Ioana Pavel',
      tax_id: null,
      reg_com: null,
      email: 'ioana@example.com',
    });
    await insert(newUuid(), {
      ...company,
      name: 'Haarstudio Berlin GmbH',
      country: 'DE',
      tax_id: 'DE123456789',
      reg_com: null,
      city: 'Berlin',
      county: null,
    });
  });

  it('refuzate: cifra de control, CNP / CUI la persoana fizică, RO ca prefix străin, fără județ', async () => {
    const bad = [
      { ...company, tax_id: 'RO14399841' },
      { ...company, reg_com: null },
      { ...company, entity_type: 'person', reg_com: null },
      { ...company, country: 'DE', tax_id: 'RO14399840', county: null },
      { ...company, country: 'DE', tax_id: '123456789', county: null },
      { ...company, county: null },
      { ...company, email: 'fara-arond' },
    ];
    for (const p of bad) {
      await expect(insert(newUuid(), p), JSON.stringify(p)).rejects.toMatchObject({
        code: '23514',
      });
    }
  });

  it('owner-ul (billing_rw) doar citește, în afacerea lui; crearea rămâne cum a fost', async () => {
    const org = newUuid();
    const other = newUuid();
    await insert(org, company);
    const seen = await rw(org, (c) =>
      c.query(`SELECT name FROM billing.billing_profile WHERE organization_id = $1`, [org]),
    );
    expect(seen.rows[0]?.name).toBe('Salon Aurora SRL');
    const elsewhere = await rw(other, (c) =>
      c.query(`SELECT 1 FROM billing.billing_profile WHERE organization_id = $1`, [org]),
    );
    expect(elsewhere.rowCount).toBe(0);
    await expect(
      rw(org, (c) =>
        c.query(`UPDATE billing.billing_profile SET email = 'x@y.ro' WHERE organization_id = $1`, [
          org,
        ]),
      ),
    ).rejects.toMatchObject({ code: '42501' });

    const changed = await fo(org, (c) =>
      one(
        c,
        `UPDATE billing.billing_profile SET email = 'contabil@salon-aurora.ro', updated_by_founder_id = $2
          WHERE organization_id = $1 RETURNING email, updated_at, created_at`,
        [org, founderId],
      ),
    );
    expect(changed.email).toBe('contabil@salon-aurora.ro');
    await expect(
      fo(org, (c) =>
        c.query(
          `UPDATE billing.billing_profile SET created_by_founder_id = $2 WHERE organization_id = $1`,
          [org, newUuid()],
        ),
      ),
    ).rejects.toMatchObject({ code: 'P0001' });
  });
});

// ── 3. Plata manuală prin transfer (D3-11) ──────────────────────────────────────────────────

/** A transfer invoice, written as the job (billing_rw) or the team; then issued by the provider. */
async function transferInvoice(
  org: string,
  opts: {
    by?: Role;
    periodStart?: string;
    setupRequestId?: string;
    dueOn?: string;
    amount?: number;
  },
) {
  const id = newUuid();
  await as(opts.by ?? 'billing_rw', org, (c) =>
    c.query(
      `INSERT INTO billing.invoice
         (id, organization_id, kind, provider, amount_minor, currency, collection, due_on, period_start, setup_request_id)
       VALUES ($1, $2, 'invoice', 'test', $3, 'RON', 'transfer', $4::date, $5::date, $6)`,
      [
        id,
        org,
        opts.amount ?? 34900,
        opts.dueOn ?? '2026-11-18',
        opts.periodStart ?? null,
        opts.setupRequestId ?? null,
      ],
    ),
  );
  return id;
}
async function issue(org: string, id: string) {
  await rw(org, (c) =>
    c.query(
      `UPDATE billing.invoice SET status = 'issued', series = 'TST', number = $2, issue_date = CURRENT_DATE,
              issued_at = now() WHERE id = $1`,
      [id, `${RUN}-${Math.floor(Math.random() * 1e9)}`],
    ),
  );
}
async function transferPayment(org: string, amount: number, receivedOn = '2026-11-03') {
  return fo(org, (c) =>
    one(
      c,
      `INSERT INTO billing.payment
         (organization_id, kind, idempotency_key, status, amount_minor, currency, occurred_at, received_on, confirmed_by_founder_id)
       VALUES ($1, 'transfer', $2, 'succeeded', $3, 'RON', now(), $4::date, $5) RETURNING id`,
      [org, `transfer:${newUuid()}`, amount, receivedOn, founderId],
    ),
  ).then((r) => r.id as string);
}

describe('plata manuală prin transfer', () => {
  it('echipa marchează plata manuală și termenul (1–90 de zile); legătura Stripe nu e a ei', async () => {
    const org = newUuid();
    await fo(org, (c) =>
      c.query(
        `INSERT INTO billing.billing_subscription (organization_id, subscription_id, payment_method, payment_terms_days)
         VALUES ($1, $2, 'manual', 30)`,
        [org, newUuid()],
      ),
    );
    await expect(
      fo(org, (c) =>
        c.query(
          `UPDATE billing.billing_subscription SET payment_terms_days = 0 WHERE organization_id = $1`,
          [org],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      fo(org, (c) =>
        c.query(
          `UPDATE billing.billing_subscription SET stripe_subscription_id = 'sub_x' WHERE organization_id = $1`,
          [org],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    const listed = await rw(org, (c) =>
      c.query(
        `SELECT organization_id, payment_terms_days FROM billing.manual_billing_organizations(1000)`,
      ),
    );
    expect(listed.rows.find((r) => r.organization_id === org)?.payment_terms_days).toBe(30);
  });

  it('factura de transfer: una pe perioadă și una pe cerere; echipa creează doar transfer, „pending”', async () => {
    const org = newUuid();
    await transferInvoice(org, { periodStart: '2026-11-04' });
    await expect(transferInvoice(org, { periodStart: '2026-11-04' })).rejects.toMatchObject({
      code: '23505',
    });
    const setupRequestId = newUuid();
    await transferInvoice(org, { by: 'billing_founder', setupRequestId });
    await expect(
      transferInvoice(org, { by: 'billing_founder', setupRequestId }),
    ).rejects.toMatchObject({ code: '23505' });
    // fără scadență, sau și perioadă și cerere → refuzată
    await expect(
      rw(org, (c) =>
        c.query(
          `INSERT INTO billing.invoice (id, organization_id, kind, provider, amount_minor, currency, collection, period_start)
           VALUES ($1, $2, 'invoice', 'test', 100, 'RON', 'transfer', CURRENT_DATE)`,
          [newUuid(), org],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      transferInvoice(org, { periodStart: '2026-12-04', setupRequestId: newUuid() }),
    ).rejects.toMatchObject({ code: '23514' });
    // echipa nu scrie o factură de card și nici una deja emisă
    await expect(
      fo(org, (c) =>
        c.query(
          `INSERT INTO billing.invoice (id, organization_id, kind, provider, amount_minor, currency, payment_id)
           VALUES ($1, $2, 'invoice', 'test', 100, 'RON', $3)`,
          [newUuid(), org, newUuid()],
        ),
      ),
    ).rejects.toMatchObject({ hint: 'invoice_insert' });
  });

  it('confirmarea încasării: doar echipa, doar suma întreagă, nu în viitor; apoi nu mai e restantă', async () => {
    const org = newUuid();
    const id = await transferInvoice(org, { periodStart: '2026-10-04', dueOn: '2026-10-18' });
    await issue(org, id);

    const overdue = await rw(org, (c) =>
      c
        .query(`SELECT id FROM billing.transfer_invoices_overdue(500)`)
        .then((r) => r.rows.map((x) => x.id)),
    );
    expect(overdue).toContain(id);

    // job-ul / webhook-ul nu confirmă
    const p0 = await transferPayment(org, 34900);
    await expect(
      rw(org, (c) =>
        c.query(
          `UPDATE billing.invoice SET paid_on = CURRENT_DATE, payment_id = $2, paid_confirmed_by_founder_id = $3
            WHERE id = $1`,
          [id, p0, founderId],
        ),
      ),
    ).rejects.toMatchObject({ hint: 'invoice_founder_only' });
    // echipa nu scrie altă plată decât transferul
    await expect(
      fo(org, (c) =>
        c.query(
          `INSERT INTO billing.payment (organization_id, kind, idempotency_key, status, amount_minor, currency, occurred_at)
           VALUES ($1, 'subscription', $2, 'succeeded', 100, 'RON', now())`,
          [org, `x:${newUuid()}`],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });

    const confirm = (paymentId: string, paidOn = '2026-11-03') =>
      fo(org, (c) =>
        c.query(
          `UPDATE billing.invoice SET paid_on = $3::date, payment_id = $2, paid_confirmed_by_founder_id = $4
            WHERE id = $1`,
          [id, paymentId, paidOn, founderId],
        ),
      );
    const partial = await transferPayment(org, 30000);
    await expect(confirm(partial)).rejects.toMatchObject({ hint: 'invoice_transfer_amount' });
    await expect(confirm(p0, '2099-01-01')).rejects.toMatchObject({
      hint: 'invoice_transfer_date',
    });
    await expect(confirm(newUuid())).rejects.toMatchObject({ hint: 'invoice_transfer_payment' });
    await confirm(p0);

    const after = await rw(org, (c) =>
      c
        .query(`SELECT id FROM billing.transfer_invoices_overdue(500)`)
        .then((r) => r.rows.map((x) => x.id)),
    );
    expect(after).not.toContain(id);
    const founder = await founderPool.connect();
    try {
      const { rows } = await founder.query(
        `SELECT id FROM billing.founder_transfer_invoices_open(500)`,
      );
      expect(rows.map((r) => r.id)).not.toContain(id);
    } finally {
      founder.release();
    }
    // o factură plătită nu se mai confirmă a doua oară
    await expect(confirm(p0)).rejects.toMatchObject({ hint: 'invoice_transition' });
  });

  it('o factură de transfer neemisă încă nu se poate încasa', async () => {
    const org = newUuid();
    const id = await transferInvoice(org, { periodStart: '2026-09-04' });
    const p = await transferPayment(org, 34900);
    await expect(
      fo(org, (c) =>
        c.query(
          `UPDATE billing.invoice SET paid_on = CURRENT_DATE, payment_id = $2, paid_confirmed_by_founder_id = $3
            WHERE id = $1`,
          [id, p, founderId],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' });
    const founder = await founderPool.connect();
    try {
      const { rows } = await founder.query(
        `SELECT id FROM billing.founder_transfer_invoices_open(500)`,
      );
      expect(rows.map((r) => r.id)).toContain(id);
    } finally {
      founder.release();
    }
  });
});

// ── 4. Factura neemisă (D-3.6-5) ────────────────────────────────────────────────────────────

/** A card payment and its invoice, refused by e-Factura (failed), as Lot 3.6 leaves it. */
async function failedInvoice(org: string) {
  touched.add(org);
  const [p] = await q(
    `INSERT INTO billing.payment (organization_id, kind, idempotency_key, stripe_invoice_id, status, amount_minor, currency, occurred_at)
     VALUES ($1, 'subscription', $2, $3, 'succeeded', 34900, 'RON', now()) RETURNING id`,
    [org, `ch_${newUuid()}`, `in_${newUuid()}`],
  );
  const id = newUuid();
  await q(
    `INSERT INTO billing.invoice (id, organization_id, kind, payment_id, provider, status, amount_minor, currency,
                                  buyer, attempts, failed_at, last_error)
     VALUES ($1, $2, 'invoice', $3, 'test', 'failed', 34900, 'RON', '{"name":"vechi"}', 1, now(),
             'CUI-ul cumpărătorului nu e valid.')`,
    [id, org, p!.id],
  );
  return id;
}

describe('factura neemisă', () => {
  it('„Reîncearcă”: înapoi în pending, acum, cu cumpărătorul fotografiat din nou', async () => {
    const org = newUuid();
    const id = await failedInvoice(org);
    await expect(
      fo(org, (c) => c.query(`UPDATE billing.invoice SET status = 'pending' WHERE id = $1`, [id])),
    ).rejects.toMatchObject({ code: 'P0001' });
    const r = await fo(org, (c) =>
      one(
        c,
        `UPDATE billing.invoice SET status = 'pending', retried_by_founder_id = $2 WHERE id = $1
         RETURNING status, buyer, failed_at, retried_at, next_attempt_at, attempts, last_error`,
        [id, founderId],
      ),
    );
    expect(r.status).toBe('pending');
    expect(r.buyer).toBeNull();
    expect(r.failed_at).toBeNull();
    expect(r.retried_at).not.toBeNull();
    expect(r.attempts).toBe(1);
    expect(r.last_error).toBe('CUI-ul cumpărătorului nu e valid.');
    expect(Math.abs(new Date(r.next_attempt_at).getTime() - Date.now())).toBeLessThan(60_000);
    // job-ul o găsește
    const due = await rw(org, (c) =>
      c.query(`SELECT id FROM billing.invoices_due(100)`).then((x) => x.rows.map((y) => y.id)),
    );
    expect(due).toContain(id);
  });

  it('„Am emis-o manual”: seria, numărul, data, motivul (min. 10 caractere); fără dubluri', async () => {
    const org = newUuid();
    const id = await failedInvoice(org);
    const number = `${RUN}-M1`;
    const manual = (reason: string, num = number) =>
      fo(org, (c) =>
        one(
          c,
          `UPDATE billing.invoice SET status = 'manual', series = 'TST', number = $2, issue_date = '2026-11-04',
                  manual_reason = $3, manual_by_founder_id = $4
            WHERE id = $1 RETURNING status, issued_at, failed_at`,
          [id, num, reason, founderId],
        ),
      );
    await expect(manual('scurt')).rejects.toMatchObject({ code: '23514' });
    // seria și numărul deja folosite la altă factură
    const other = await failedInvoice(org);
    await q(
      `UPDATE billing.invoice SET status = 'issued', series = 'TST', number = $2, issue_date = CURRENT_DATE,
              issued_at = now(), failed_at = NULL WHERE id = $1`,
      [other, `${RUN}-DUP`],
    );
    await expect(
      manual('Emisă din SmartBill după respingere.', `${RUN}-DUP`),
    ).rejects.toMatchObject({
      code: '23505',
    });
    const done = await manual('Emisă din SmartBill după respingerea e-Factura.');
    expect(done.status).toBe('manual');
    expect(done.issued_at).not.toBeNull();
    expect(done.failed_at).toBeNull();

    // billing_rw (job-ul, e-mailul) nu mai atinge o factură emisă manual
    await expect(
      rw(org, (c) => c.query(`UPDATE billing.invoice SET emailed_at = now() WHERE id = $1`, [id])),
    ).rejects.toMatchObject({ hint: 'invoice_founder_only' });
    // și nici echipa nu o mai schimbă
    await expect(
      fo(org, (c) => c.query(`UPDATE billing.invoice SET amount_minor = 1 WHERE id = $1`, [id])),
    ).rejects.toMatchObject({ hint: 'invoice_transition' });
  });

  it('billing_rw nu poate trece o factură ca emisă manual; o încercare în curs nu se suprascrie', async () => {
    const org = newUuid();
    const id = await failedInvoice(org);
    await expect(
      rw(org, (c) =>
        c.query(
          `UPDATE billing.invoice SET status = 'manual', series = 'TST', number = $2, issue_date = CURRENT_DATE,
                  issued_at = now(), failed_at = NULL, manual_reason = 'Emisă manual de job.', manual_by_founder_id = $3
            WHERE id = $1`,
          [id, `${RUN}-RW`, founderId],
        ),
      ),
    ).rejects.toMatchObject({ hint: 'invoice_founder_only' });
    await q(
      `UPDATE billing.invoice SET status = 'pending', failed_at = NULL, claimed_until = now() + interval '2 minutes'
        WHERE id = $1`,
      [id],
    );
    await expect(
      fo(org, (c) =>
        c.query(
          `UPDATE billing.invoice SET status = 'manual', series = 'TST', number = $2, issue_date = CURRENT_DATE,
                  manual_reason = 'Emisă din SmartBill manual.', manual_by_founder_id = $3 WHERE id = $1`,
          [id, `${RUN}-CL`, founderId],
        ),
      ),
    ).rejects.toMatchObject({ hint: 'invoice_claimed' });
  });

  it('echipa nu vede facturile altei afaceri', async () => {
    const org = newUuid();
    const id = await failedInvoice(org);
    const r = await fo(newUuid(), (c) =>
      c.query(
        `UPDATE billing.invoice SET status = 'pending', retried_by_founder_id = $2 WHERE id = $1`,
        [id, founderId],
      ),
    );
    expect(r.rowCount).toBe(0);
  });
});

// ── 5. Implementarea plătită cu cardul ──────────────────────────────────────────────────────

describe('cumpărarea implementării (purchase.kind = setup)', () => {
  const purchase = (org: string, setupRequestId: string, extra: { recurring?: boolean } = {}) =>
    rw(org, (c) =>
      c.query(
        `INSERT INTO billing.purchase (id, organization_id, kind, application_id, item_name, currency, price_minor,
                                       setup_minor, recurring, created_by_user_id, setup_request_id)
         VALUES ($1, $2, 'setup', 'crm', 'crm', 'RON', 0, 15000, $3, $4, $5)`,
        [newUuid(), org, extra.recurring ?? false, newUuid(), setupRequestId],
      ),
    );

  it('una singură în curs pe cerere; o încercare eșuată lasă loc alteia', async () => {
    const org = newUuid();
    const req = newUuid();
    await purchase(org, req);
    await expect(purchase(org, req)).rejects.toMatchObject({ code: '23505' });
    await rw(org, (c) =>
      c.query(`UPDATE billing.purchase SET status = 'failed' WHERE setup_request_id = $1`, [req]),
    );
    await purchase(org, req);
    await expect(purchase(org, newUuid(), { recurring: true })).rejects.toMatchObject({
      code: '23514',
    });
  });

  it('echipa vede cumpărarea (rambursarea), nu o scrie', async () => {
    const org = newUuid();
    const req = newUuid();
    await purchase(org, req);
    const seen = await fo(org, (c) =>
      c.query(`SELECT setup_minor FROM billing.purchase WHERE setup_request_id = $1`, [req]),
    );
    expect(Number(seen.rows[0]?.setup_minor)).toBe(15000);
    await expect(
      fo(org, (c) =>
        c.query(`UPDATE billing.purchase SET status = 'canceled' WHERE setup_request_id = $1`, [
          req,
        ]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
