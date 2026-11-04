import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool, type PoolClient } from 'pg';

// Lot 3.8 · Etapa 1 — modelul (migrarea 20261104000020_commercial_lifecycle), pe rolurile de
// runtime reale: app_runtime → commercial_rw (Hub, job-uri, billing), founder_runtime →
// commercial_founder (echipa). Regulile sunt în baza de date: momentele puse de server, trecerile
// permise pe rol, izolarea între afaceri (RLS). Fixturile: DIRECT_URL (postgres).

const adminPool = new Pool({ connectionString: process.env.DIRECT_URL, max: 2 });
const appPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const founderPool = new Pool({ connectionString: process.env.DATABASE_URL_FOUNDER, max: 2 });
let admin: PoolClient;
const q = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;
const newUuid = () => crypto.randomUUID();
const RUN = newUuid().slice(0, 6);
const founderId = newUuid();
const DAY = 86_400_000;

const APP_A = `l38a-${RUN}`;
const APP_B = `l38b-${RUN}`;
const APP_C = `l38c-${RUN}`;
const FEATURE = `l38f${RUN}.trial`;

type Role = 'commercial_rw' | 'commercial_founder';

/** One transaction as the runtime role, in one business's context (as the code does). */
async function as<T>(
  role: Role,
  organizationId: string,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await (role === 'commercial_rw' ? appPool : founderPool).connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${role}`);
    await client.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
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

const rw = <T>(org: string, fn: (c: PoolClient) => Promise<T>) => as('commercial_rw', org, fn);
const fo = <T>(org: string, fn: (c: PoolClient) => Promise<T>) => as('commercial_founder', org, fn);
const one = async (c: PoolClient, sql: string, params: unknown[] = []) =>
  (await c.query(sql, params)).rows[0];

let versionId: string;

/** A business with a live subscription in RON. */
async function business(): Promise<{ org: string; subscriptionId: string; ownerId: string }> {
  const org = newUuid();
  const [s] = await q(
    `INSERT INTO commercial.subscription
       (organization_id, plan_version_id, interval, currency, started_on, anchor_day, status,
        created_by_founder_id)
     VALUES ($1, $2, 'month', 'RON', CURRENT_DATE, EXTRACT(DAY FROM CURRENT_DATE), 'active', $3)
     RETURNING id`,
    [org, versionId, founderId],
  );
  return { org, subscriptionId: s!.id, ownerId: newUuid() };
}

beforeAll(async () => {
  admin = await adminPool.connect();
  for (const app of [APP_A, APP_B, APP_C]) {
    await q(`INSERT INTO commercial.application (id, name) VALUES ($1, $1)`, [app]);
  }
  await q(`INSERT INTO commercial.feature_key (key, application_id) VALUES ($1, $2)`, [
    FEATURE,
    APP_A,
  ]);
  const [p] = await q(
    `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'Business', $2) RETURNING id`,
    [`l38-${RUN}`, founderId],
  );
  const [v] = await q(
    `INSERT INTO commercial.plan_version (plan_id, version_number, created_by_founder_id)
     VALUES ($1, 1, $2) RETURNING id`,
    [p!.id, founderId],
  );
  versionId = v!.id;
  await q(
    `INSERT INTO commercial.plan_version_price (plan_version_id, currency, kind, amount_minor)
     VALUES ($1, 'RON', 'month', 30000)`,
    [versionId],
  );
  await q(
    `UPDATE commercial.plan_version SET published_at = now(), published_by_founder_id = $2 WHERE id = $1`,
    [versionId, founderId],
  );
});

afterAll(async () => {
  admin.release();
  await adminPool.end();
  await appPool.end();
  await founderPool.end();
});

// ── 1. Perioada de probă (D3-5) ─────────────────────────────────────────────────────────────

describe('perioada de probă (D3-5)', () => {
  it('owner-ul pornește o probă pe o aplicație: 14 zile de acum, puse de server', async () => {
    const { org, ownerId } = await business();
    const t = await rw(org, (c) =>
      one(
        c,
        `INSERT INTO commercial.trial (organization_id, kind, application_id, source, started_by, starts_at, ends_at)
         VALUES ($1, 'application', $2, 'owner', $3, now() - interval '5 days', now() + interval '60 days')
         RETURNING starts_at, ends_at, ended_at, reminder_sent_at`,
        [org, APP_A, ownerId],
      ),
    );
    const days = (new Date(t.ends_at).getTime() - new Date(t.starts_at).getTime()) / DAY;
    expect(days).toBe(14);
    expect(Math.abs(new Date(t.starts_at).getTime() - Date.now())).toBeLessThan(60_000);
    expect(t.ended_at).toBeNull();
    expect(t.reminder_sent_at).toBeNull();
  });

  it('din Hub: doar pe o aplicație și doar ca owner (funcționalitatea rămâne la Founder)', async () => {
    const { org, ownerId } = await business();
    await expect(
      rw(org, (c) =>
        c.query(
          `INSERT INTO commercial.trial (organization_id, kind, feature_key, source, started_by, ends_at)
           VALUES ($1, 'feature', $3, 'owner', $2, now() + interval '14 days')`,
          [org, ownerId, FEATURE],
        ),
      ),
    ).rejects.toMatchObject({ code: expect.stringMatching(/^(42501|23514)$/) });
    await expect(
      rw(org, (c) =>
        c.query(
          `INSERT INTO commercial.trial (organization_id, kind, application_id, source, started_by, ends_at)
           VALUES ($1, 'application', $2, 'founder', $3, now() + interval '14 days')`,
          [org, APP_A, ownerId],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('o singură probă de owner pe aceeași aplicație, chiar după ce s-a încheiat', async () => {
    const { org, ownerId } = await business();
    const insert = () =>
      rw(org, (c) =>
        one(
          c,
          `INSERT INTO commercial.trial (organization_id, kind, application_id, source, started_by, ends_at)
           VALUES ($1, 'application', $2, 'owner', $3, now()) RETURNING id`,
          [org, APP_B, ownerId],
        ),
      );
    const t = await insert();
    await rw(org, (c) =>
      c.query(
        `UPDATE commercial.trial SET ended_at = now(), end_reason = 'canceled' WHERE id = $1`,
        [t.id],
      ),
    );
    await expect(insert()).rejects.toMatchObject({ code: '23505' });
  });

  it('reminderul: 3 zile înainte, o singură dată; încheierea: „expired” doar după termen', async () => {
    const { org } = await business();
    // probe Founder (termenul îl dă echipa) — una aproape de final, una trecută
    const [soon] = await q(
      `INSERT INTO commercial.trial (organization_id, kind, application_id, source, started_by, starts_at, ends_at)
       VALUES ($1, 'application', $2, 'founder', $3, now() - interval '12 days', now() + interval '2 days')
       RETURNING id`,
      [org, APP_A, founderId],
    );
    const [past] = await q(
      `INSERT INTO commercial.trial (organization_id, kind, application_id, source, started_by, starts_at, ends_at)
       VALUES ($1, 'application', $2, 'founder', $3, now() - interval '15 days', now() - interval '1 day')
       RETURNING id`,
      [org, APP_B, founderId],
    );

    const remind = await rw(org, (c) =>
      c
        .query(`SELECT id FROM commercial.trials_to_remind(500)`)
        .then((r) => r.rows.map((x) => x.id)),
    );
    expect(remind).toContain(soon!.id);
    expect(remind).not.toContain(past!.id);

    const first = await rw(org, (c) =>
      one(
        c,
        `UPDATE commercial.trial SET reminder_sent_at = '2000-01-01' WHERE id = $1 RETURNING reminder_sent_at`,
        [soon!.id],
      ),
    );
    expect(Math.abs(new Date(first.reminder_sent_at).getTime() - Date.now())).toBeLessThan(60_000);
    const again = await rw(org, (c) =>
      one(
        c,
        `UPDATE commercial.trial SET reminder_sent_at = now() + interval '1 day' WHERE id = $1 RETURNING reminder_sent_at`,
        [soon!.id],
      ),
    );
    expect(new Date(again.reminder_sent_at).getTime()).toBe(
      new Date(first.reminder_sent_at).getTime(),
    );

    const due = await rw(org, (c) =>
      c.query(`SELECT id FROM commercial.trials_due(500)`).then((r) => r.rows.map((x) => x.id)),
    );
    expect(due).toContain(past!.id);
    expect(due).not.toContain(soon!.id);

    await expect(
      rw(org, (c) =>
        c.query(
          `UPDATE commercial.trial SET ended_at = now(), end_reason = 'expired' WHERE id = $1`,
          [soon!.id],
        ),
      ),
    ).rejects.toMatchObject({ hint: 'trial_not_due' });
    await expect(
      rw(org, (c) =>
        c.query(`UPDATE commercial.trial SET ended_at = now() WHERE id = $1`, [past!.id]),
      ),
    ).rejects.toMatchObject({ hint: 'trial_end_reason' });
    await rw(org, (c) =>
      c.query(
        `UPDATE commercial.trial SET ended_at = now(), end_reason = 'expired' WHERE id = $1`,
        [past!.id],
      ),
    );
    // datele rămân: rândul există, încheiat, și nu mai poate fi schimbat
    await expect(
      rw(org, (c) =>
        c.query(`UPDATE commercial.trial SET end_reason = 'converted' WHERE id = $1`, [past!.id]),
      ),
    ).rejects.toMatchObject({ hint: 'trial_ended' });
    // termenul nu se mută după creare
    await expect(
      rw(org, (c) =>
        c.query(`UPDATE commercial.trial SET ends_at = ends_at + interval '7 days' WHERE id = $1`, [
          soon!.id,
        ]),
      ),
    ).rejects.toMatchObject({ hint: 'trial_immutable' });
  });

  it('o altă afacere nu vede și nu atinge proba', async () => {
    const a = await business();
    const b = await business();
    const t = await rw(a.org, (c) =>
      one(
        c,
        `INSERT INTO commercial.trial (organization_id, kind, application_id, source, started_by, ends_at)
         VALUES ($1, 'application', $2, 'owner', $3, now()) RETURNING id`,
        [a.org, APP_C, a.ownerId],
      ),
    );
    const seen = await rw(b.org, (c) =>
      c.query(`SELECT 1 FROM commercial.trial WHERE id = $1`, [t.id]),
    );
    expect(seen.rowCount).toBe(0);
    const touched = await rw(b.org, (c) =>
      c.query(
        `UPDATE commercial.trial SET ended_at = now(), end_reason = 'canceled' WHERE id = $1`,
        [t.id],
      ),
    );
    expect(touched.rowCount).toBe(0);
  });
});

// ── 2. Neplata (D3-12) ──────────────────────────────────────────────────────────────────────

describe('neplata (D3-12)', () => {
  const open = (org: string, subscriptionId: string, ref: string, overdueDaysAgo: number) =>
    rw(org, (c) =>
      one(
        c,
        `INSERT INTO commercial.dunning
           (organization_id, subscription_id, cause, source_ref, amount_minor, currency, overdue_since, grace_ends_at)
         VALUES ($1, $2, 'transfer', $3, 34900, 'RON', now() - $4 * interval '1 day', now() + interval '90 days')
         RETURNING id, overdue_since, grace_ends_at, read_only_at`,
        [org, subscriptionId, ref, overdueDaysAgo],
      ),
    );

  it('grația: 14 zile de la data restanței, pusă de server; nu din viitor', async () => {
    const { org, subscriptionId } = await business();
    const d = await open(org, subscriptionId, `inv-${newUuid()}`, 1);
    const days = (new Date(d.grace_ends_at).getTime() - new Date(d.overdue_since).getTime()) / DAY;
    expect(days).toBe(14);
    expect(d.read_only_at).toBeNull();

    const other = await business();
    await expect(
      rw(other.org, (c) =>
        c.query(
          `INSERT INTO commercial.dunning
             (organization_id, subscription_id, cause, source_ref, amount_minor, currency, overdue_since, grace_ends_at)
           VALUES ($1, $2, 'card', 'in_x', 100, 'RON', now() + interval '1 day', now())`,
          [other.org, other.subscriptionId],
        ),
      ),
    ).rejects.toMatchObject({ hint: 'dunning_future' });
  });

  it('un singur caz deschis pe afacere; aceeași factură nu deschide al doilea caz', async () => {
    const { org, subscriptionId } = await business();
    const ref = `inv-${newUuid()}`;
    await open(org, subscriptionId, ref, 1);
    await expect(open(org, subscriptionId, ref, 1)).rejects.toMatchObject({ code: '23505' });
    await expect(open(org, subscriptionId, `inv-${newUuid()}`, 1)).rejects.toMatchObject({
      code: '23505',
    });
  });

  it('doar citire: numai după grație, o singură dată; job-ul găsește cazurile ajunse la termen', async () => {
    const { org, subscriptionId } = await business();
    const inGrace = await open(org, subscriptionId, `inv-${newUuid()}`, 3);
    await expect(
      rw(org, (c) =>
        c.query(`UPDATE commercial.dunning SET read_only_at = now() WHERE id = $1`, [inGrace.id]),
      ),
    ).rejects.toMatchObject({ hint: 'dunning_in_grace' });
    await rw(org, (c) =>
      c.query(
        `UPDATE commercial.dunning SET resolved_at = now(), resolution = 'paid' WHERE id = $1`,
        [inGrace.id],
      ),
    );

    const late = await open(org, subscriptionId, `inv-${newUuid()}`, 15);
    const due = await rw(org, (c) =>
      c.query(`SELECT id FROM commercial.dunning_due(500)`).then((r) => r.rows.map((x) => x.id)),
    );
    expect(due).toContain(late.id);
    const ro = await rw(org, (c) =>
      one(
        c,
        `UPDATE commercial.dunning SET read_only_at = '2000-01-01' WHERE id = $1 RETURNING read_only_at`,
        [late.id],
      ),
    );
    expect(Math.abs(new Date(ro.read_only_at).getTime() - Date.now())).toBeLessThan(60_000);
    const again = await rw(org, (c) =>
      one(
        c,
        `UPDATE commercial.dunning SET read_only_at = NULL WHERE id = $1 RETURNING read_only_at`,
        [late.id],
      ),
    );
    expect(new Date(again.read_only_at).getTime()).toBe(new Date(ro.read_only_at).getTime());
  });

  it('închiderea: Hub / billing doar „paid” / „canceled”; echipa doar „founder”, cu motiv', async () => {
    const { org, subscriptionId } = await business();
    const d = await open(org, subscriptionId, `inv-${newUuid()}`, 2);
    await expect(
      rw(org, (c) =>
        c.query(
          `UPDATE commercial.dunning SET resolved_at = now(), resolution = 'founder',
                  resolved_by_founder_id = $2, resolve_reason = 'A plătit cash la sediu.' WHERE id = $1`,
          [d.id, founderId],
        ),
      ),
    ).rejects.toMatchObject({ code: 'P0001' });
    await expect(
      fo(org, (c) =>
        c.query(
          `UPDATE commercial.dunning SET resolved_at = now(), resolution = 'paid' WHERE id = $1`,
          [d.id],
        ),
      ),
    ).rejects.toMatchObject({ code: 'P0001' });
    await expect(
      fo(org, (c) =>
        c.query(
          `UPDATE commercial.dunning SET resolved_at = now(), resolution = 'founder',
                  resolved_by_founder_id = $2, resolve_reason = 'scurt' WHERE id = $1`,
          [d.id, founderId],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await fo(org, (c) =>
      c.query(
        `UPDATE commercial.dunning SET resolved_at = now(), resolution = 'founder',
                resolved_by_founder_id = $2, resolve_reason = 'A plătit cash la sediu, chitanța 12.' WHERE id = $1`,
        [d.id, founderId],
      ),
    );
    await expect(
      rw(org, (c) =>
        c.query(`UPDATE commercial.dunning SET read_only_at = now() WHERE id = $1`, [d.id]),
      ),
    ).rejects.toMatchObject({ hint: 'dunning_resolved' });
    // după închidere se poate deschide un caz nou
    await open(org, subscriptionId, `inv-${newUuid()}`, 1);
  });

  it('lista Founder: doar founder_runtime; izolarea între afaceri', async () => {
    const a = await business();
    const b = await business();
    const d = await open(a.org, a.subscriptionId, `inv-${newUuid()}`, 1);
    const founder = await founderPool.connect();
    try {
      const { rows } = await founder.query(`SELECT id FROM commercial.founder_list_dunning(500)`);
      expect(rows.map((r) => r.id)).toContain(d.id);
    } finally {
      founder.release();
    }
    const app = await appPool.connect();
    try {
      await expect(
        app.query(`SELECT * FROM commercial.founder_list_dunning(5)`),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      app.release();
    }
    const seen = await rw(b.org, (c) =>
      c.query(`SELECT 1 FROM commercial.dunning WHERE id = $1`, [d.id]),
    );
    expect(seen.rowCount).toBe(0);
  });
});

// ── 3. Cererile cu implementare (FounderSetupRequests, S121) ────────────────────────────────

describe('cererile cu implementare', () => {
  const request = (org: string, app: string, userId: string) =>
    rw(org, (c) =>
      one(
        c,
        `INSERT INTO commercial.setup_request
           (organization_id, application_id, currency, requested_by_user_id, status, setup_minor, paid_at)
         VALUES ($1, $2, 'RON', $3, 'live', 99, now()) RETURNING *`,
        [org, app, userId],
      ),
    );
  const sendOffer = (org: string, id: string) =>
    fo(org, (c) =>
      one(
        c,
        `UPDATE commercial.setup_request
            SET setup_minor = 15000, maintenance_minor = 4900, maintenance_interval = 'month',
                estimated_start_on = CURRENT_DATE + 10, offer_note = 'Pornim după plată.',
                offer_sent_by_founder_id = $2, offer_sent_at = '2000-01-01'
          WHERE id = $1 RETURNING *`,
        [id, founderId],
      ),
    );
  const accept = (org: string, id: string, userId: string) =>
    rw(org, (c) =>
      c.query(
        `UPDATE commercial.setup_request SET status = 'accepted', accepted_by_user_id = $2 WHERE id = $1`,
        [id, userId],
      ),
    );
  const confirm = (org: string, id: string) =>
    fo(org, (c) =>
      c.query(
        `UPDATE commercial.setup_request
            SET status = 'confirmed', start_on = CURRENT_DATE + 7, confirmed_by_founder_id = $2
          WHERE id = $1`,
        [id, founderId],
      ),
    );
  const pay = (org: string, id: string, amount: number) =>
    rw(org, (c) =>
      c.query(
        `UPDATE commercial.setup_request
            SET status = 'paid', payment_method = 'card', payment_ref = $2, paid_minor = $3
          WHERE id = $1`,
        [id, newUuid(), amount],
      ),
    );

  it('creată din Hub: „cerută”, cu tot restul gol, orice ar trimite clientul', async () => {
    const { org, ownerId } = await business();
    const r = await request(org, APP_A, ownerId);
    expect(r.status).toBe('requested');
    expect(r.setup_minor).toBeNull();
    expect(r.paid_at).toBeNull();
    // fără abonament în moneda cererii → refuzată
    const lonely = newUuid();
    await expect(request(lonely, APP_A, ownerId)).rejects.toMatchObject({
      hint: 'setup_no_subscription',
    });
    // echipa nu creează cereri
    await expect(
      fo(org, (c) =>
        c.query(
          `INSERT INTO commercial.setup_request (organization_id, application_id, currency, requested_by_user_id)
           VALUES ($1, $2, 'RON', $3)`,
          [org, APP_B, founderId],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    // o singură cerere deschisă pe aceeași aplicație
    await expect(request(org, APP_A, ownerId)).rejects.toMatchObject({ code: '23505' });
  });

  it('drumul întreg: ofertă → acceptare → confirmare → plată → lucru → pornire', async () => {
    const { org, subscriptionId, ownerId } = await business();
    const r = await request(org, APP_A, ownerId);

    // clientul nu acceptă fără ofertă; Hub-ul nu trimite oferta
    await expect(accept(org, r.id, ownerId)).rejects.toMatchObject({ hint: 'setup_no_offer' });
    await expect(
      rw(org, (c) =>
        c.query(
          `UPDATE commercial.setup_request SET setup_minor = 0, maintenance_minor = 0,
                  maintenance_interval = 'month', estimated_start_on = CURRENT_DATE,
                  offer_sent_by_founder_id = $2, offer_sent_at = now() WHERE id = $1`,
          [r.id, ownerId],
        ),
      ),
    ).rejects.toMatchObject({ hint: 'setup_transition' });

    const offered = await sendOffer(org, r.id);
    expect(offered.status).toBe('requested');
    expect(Math.abs(new Date(offered.offer_sent_at).getTime() - Date.now())).toBeLessThan(60_000);

    // echipa nu acceptă în locul clientului
    await expect(
      fo(org, (c) =>
        c.query(
          `UPDATE commercial.setup_request SET status = 'accepted', accepted_by_user_id = $2 WHERE id = $1`,
          [r.id, founderId],
        ),
      ),
    ).rejects.toMatchObject({ hint: 'setup_transition' });
    await accept(org, r.id, ownerId);

    // clientul nu confirmă; echipa nu schimbă prețul la confirmare
    await expect(
      rw(org, (c) =>
        c.query(
          `UPDATE commercial.setup_request SET status = 'confirmed', start_on = CURRENT_DATE,
                  confirmed_by_founder_id = $2 WHERE id = $1`,
          [r.id, founderId],
        ),
      ),
    ).rejects.toMatchObject({ hint: 'setup_transition' });
    await expect(
      fo(org, (c) =>
        c.query(
          `UPDATE commercial.setup_request SET status = 'confirmed', start_on = CURRENT_DATE,
                  confirmed_by_founder_id = $2, setup_minor = 1 WHERE id = $1`,
          [r.id, founderId],
        ),
      ),
    ).rejects.toMatchObject({ hint: 'setup_fields' });
    await confirm(org, r.id);

    // doar suma întreagă a implementării
    await expect(pay(org, r.id, 14999)).rejects.toMatchObject({ code: '23514' });
    await pay(org, r.id, 15000);

    // după plată, owner-ul nu mai anulează (rambursarea e a echipei)
    await expect(
      rw(org, (c) =>
        c.query(
          `UPDATE commercial.setup_request SET status = 'cancelled', cancelled_by = 'owner',
                  cancelled_by_id = $2 WHERE id = $1`,
          [r.id, ownerId],
        ),
      ),
    ).rejects.toMatchObject({ hint: 'setup_transition' });

    await fo(org, (c) =>
      c.query(
        `UPDATE commercial.setup_request SET status = 'in_progress', work_started_by_founder_id = $2 WHERE id = $1`,
        [r.id, founderId],
      ),
    );

    // pornirea cere linia activă a aplicației (abonamentul ei începe azi)
    await expect(
      fo(org, (c) =>
        c.query(
          `UPDATE commercial.setup_request SET status = 'live', live_by_founder_id = $2,
                  subscription_application_id = $3 WHERE id = $1`,
          [r.id, founderId, newUuid()],
        ),
      ),
    ).rejects.toMatchObject({ hint: 'setup_live_line' });
    const live = await fo(org, async (c) => {
      const line = await one(
        c,
        `INSERT INTO commercial.subscription_application
           (organization_id, subscription_id, application_id, currency, interval, amount_minor, source,
            created_by_founder_id)
         VALUES ($1, $2, $3, 'RON', 'month', 4900, 'request', $4) RETURNING id`,
        [org, subscriptionId, APP_A, founderId],
      );
      return one(
        c,
        `UPDATE commercial.setup_request SET status = 'live', live_by_founder_id = $2,
                subscription_application_id = $3 WHERE id = $1 RETURNING *`,
        [r.id, founderId, line.id],
      );
    });
    expect(live.status).toBe('live');
    expect(live.live_at).not.toBeNull();

    // după pornire: nimic din acest flux (rambursarea doar prin Suport)
    await expect(
      fo(org, (c) =>
        c.query(
          `UPDATE commercial.setup_request SET status = 'refunded', cancelled_by = 'founder',
                  cancelled_by_id = $2, cancel_reason = 'Clientul s-a răzgândit.', refund_ref = 're_1'
            WHERE id = $1`,
          [r.id, founderId],
        ),
      ),
    ).rejects.toMatchObject({ hint: 'setup_closed' });
  });

  it('anularea înainte de plată: owner-ul (fără motiv) sau echipa (cu motiv)', async () => {
    const { org, ownerId } = await business();
    const r1 = await request(org, APP_B, ownerId);
    await sendOffer(org, r1.id);
    // owner-ul nu anulează în numele echipei
    await expect(
      rw(org, (c) =>
        c.query(
          `UPDATE commercial.setup_request SET status = 'cancelled', cancelled_by = 'founder',
                  cancelled_by_id = $2, cancel_reason = 'x' WHERE id = $1`,
          [r1.id, ownerId],
        ),
      ),
    ).rejects.toMatchObject({ hint: 'setup_transition' });
    const declined = await rw(org, (c) =>
      one(
        c,
        `UPDATE commercial.setup_request SET status = 'cancelled', cancelled_by = 'owner',
                cancelled_by_id = $2 WHERE id = $1 RETURNING cancelled_at`,
        [r1.id, ownerId],
      ),
    );
    expect(declined.cancelled_at).not.toBeNull();

    const r2 = await request(org, APP_B, ownerId);
    await expect(
      fo(org, (c) =>
        c.query(
          `UPDATE commercial.setup_request SET status = 'cancelled', cancelled_by = 'founder',
                  cancelled_by_id = $2 WHERE id = $1`,
          [r2.id, founderId],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await fo(org, (c) =>
      c.query(
        `UPDATE commercial.setup_request SET status = 'cancelled', cancelled_by = 'founder',
                cancelled_by_id = $2, cancel_reason = 'Aplicația nu se potrivește afacerii.' WHERE id = $1`,
        [r2.id, founderId],
      ),
    );
  });

  it('rambursarea: după plată, și în lucru, până la pornire; doar echipa', async () => {
    const { org, ownerId } = await business();
    const r = await request(org, APP_C, ownerId);
    await sendOffer(org, r.id);
    await accept(org, r.id, ownerId);
    await confirm(org, r.id);
    await pay(org, r.id, 15000);
    await fo(org, (c) =>
      c.query(
        `UPDATE commercial.setup_request SET status = 'in_progress', work_started_by_founder_id = $2 WHERE id = $1`,
        [r.id, founderId],
      ),
    );
    const refund = `UPDATE commercial.setup_request SET status = 'refunded', cancelled_by = 'founder',
                cancelled_by_id = $2, cancel_reason = 'Nu putem integra casa de marcat.', refund_ref = 're_test_1'
          WHERE id = $1 RETURNING *`;
    await expect(rw(org, (c) => c.query(refund, [r.id, founderId]))).rejects.toMatchObject({
      hint: 'setup_transition',
    });
    const done = await fo(org, (c) => one(c, refund, [r.id, founderId]));
    expect(done.status).toBe('refunded');
    expect(done.refunded_at).not.toBeNull();
    expect(done.cancelled_at).not.toBeNull();
    // aplicația poate fi cerută din nou
    await request(org, APP_C, ownerId);
  });

  it('lista Founder și izolarea între afaceri', async () => {
    const a = await business();
    const b = await business();
    const r = await request(a.org, APP_B, a.ownerId);
    const founder = await founderPool.connect();
    try {
      const { rows } = await founder.query(
        `SELECT id, status FROM commercial.founder_list_setup_requests(true)`,
      );
      expect(rows.find((x) => x.id === r.id)?.status).toBe('requested');
    } finally {
      founder.release();
    }
    const seen = await rw(b.org, (c) =>
      c.query(`SELECT 1 FROM commercial.setup_request WHERE id = $1`, [r.id]),
    );
    expect(seen.rowCount).toBe(0);
    const touched = await fo(b.org, (c) =>
      c.query(`UPDATE commercial.setup_request SET offer_note = 'x' WHERE id = $1`, [r.id]),
    );
    expect(touched.rowCount).toBe(0);
  });
});
