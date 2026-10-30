import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { z } from 'zod';
import {
  outboxMigrationSql,
  writeOutboxEvent,
  UUID_V7,
  type OutboxEnvelope,
  type OutboxSqlClient,
} from '@ventora/db-kit';
import { defineEvent, type EventDefinition } from '@ventora/contracts';
import { ConsumerRegistry, dispatchOutbox, listOutboxDeadLetters } from '../index';

/*
 * T6 (ARCHITECTURE §13.2, Lot 4.1) pe un emițător de test: schema `outbox_t6`, rolul
 * `outbox_t6_rw` și tabelele din migrarea-șablon (outboxMigrationSql), pe baza organizations.
 *   - livrare dublă → efect unic, pentru fiecare consumator;
 *   - un consumator care eșuează de 3 ori → dead-letter, fără alte reîncercări;
 *   - un eveniment al organizației A nu e procesat în contextul organizației B (RLS);
 *   - o tranzacție anulată nu lasă eveniment.
 */

const APP_URL = process.env.DATABASE_URL_TEST ?? '';
const ADMIN_URL = process.env.DATABASE_URL_ADMIN_TEST ?? '';
const FOUNDER_URL = process.env.DATABASE_URL_FOUNDER_TEST ?? '';

const SCHEMA = 'outbox_t6';
const ROLE = 'outbox_t6_rw';
const SOURCE = { schema: SCHEMA, moduleRole: ROLE };
const ORG_SETTING = `NULLIF(current_setting('app.organization_id', true), '')::uuid`;

const WidgetCreated = defineEvent({
  type: 'widget.created',
  version: 1,
  sourceApp: 'test',
  growthSafe: false,
  withoutConsumer: 'dead_letter',
  schema: z.object({ widgetId: z.uuid(), name: z.string() }).strict(),
});
const WidgetNoted = defineEvent({
  type: 'widget.noted',
  version: 1,
  sourceApp: 'test',
  growthSafe: false,
  withoutConsumer: 'complete',
  schema: z.object({ widgetId: z.uuid() }).strict(),
});
const CATALOG: readonly EventDefinition[] = [
  WidgetCreated as EventDefinition,
  WidgetNoted as EventDefinition,
];

let admin: pg.Pool;
let app: pg.Pool;
let founder: pg.Pool;

const ORG_A = crypto.randomUUID();
const ORG_B = crypto.randomUUID();

async function adminQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await admin.query(sql, params)).rows as T[];
}

/** Ce face modulul: schimbarea de date și evenimentul, în aceeași tranzacție, sub RLS. */
async function createWidget(
  org: string,
  name: string,
  opts: { rollback?: boolean; envelopeOrg?: string } = {},
): Promise<OutboxEnvelope<{ widgetId: string; name: string }>> {
  const client = await app.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${ROLE}`);
    await client.query(`SELECT set_config('app.organization_id', $1, true)`, [org]);
    const widgetId = crypto.randomUUID();
    await client.query(
      `INSERT INTO ${SCHEMA}.widget (id, organization_id, name) VALUES ($1, $2, $3)`,
      [widgetId, org, name],
    );
    const envelope = await writeOutboxEvent(client, SCHEMA, WidgetCreated, {
      organizationId: opts.envelopeOrg ?? org,
      sourceApp: 'test',
      resourceId: widgetId,
      payload: { widgetId, name },
    });
    await client.query(opts.rollback ? 'ROLLBACK' : 'COMMIT');
    return envelope;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Consumatorul de test: un rând în `effect` per livrare reușită (efectul de numărat). */
function effectConsumer(name: string, opts: { fail?: () => boolean } = {}) {
  return {
    name,
    handles: [{ type: 'widget.created', version: 1 }],
    async handle(envelope: OutboxEnvelope, tx: OutboxSqlClient) {
      if (opts.fail?.()) throw new Error(`${name} is down`);
      const { rows } = await tx.query(`SELECT current_setting('app.organization_id', true) AS org`);
      await tx.query(
        `INSERT INTO ${SCHEMA}.effect (consumer, event_id, organization_id, seen_org)
         VALUES ($1, $2::uuid, $3::uuid, $4)`,
        [name, envelope.eventId, envelope.organizationId, (rows[0] as { org: string }).org],
      );
    },
  };
}

const dispatch = (registry: ConsumerRegistry) =>
  dispatchOutbox({ pool: app, source: SOURCE, registry, catalog: CATALOG, limit: 50 });

async function eventRow(eventId: string) {
  const [row] = await adminQuery<{
    status: string;
    attempts: number;
    last_error: string | null;
    failed_at: Date | null;
    available_at: Date;
  }>(
    `SELECT status, attempts, last_error, failed_at, available_at
       FROM ${SCHEMA}.outbox_events WHERE event_id = $1`,
    [eventId],
  );
  return row!;
}

async function effects(eventId: string) {
  return adminQuery<{ consumer: string; seen_org: string }>(
    `SELECT consumer, seen_org FROM ${SCHEMA}.effect WHERE event_id = $1 ORDER BY consumer`,
    [eventId],
  );
}

/** Reîncercarea imediată (backoff-ul e de 30 s / 2 min în producție). */
const makeAvailable = (eventId: string) =>
  adminQuery(`UPDATE ${SCHEMA}.outbox_events SET available_at = now() WHERE event_id = $1`, [
    eventId,
  ]);

const run = APP_URL && ADMIN_URL ? describe : describe.skip;

run('T6 — outbox and events (Lot 4.1)', () => {
  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: ADMIN_URL, max: 2 });
    app = new pg.Pool({ connectionString: APP_URL, max: 4 });
    founder = new pg.Pool({ connectionString: FOUNDER_URL || ADMIN_URL, max: 1 });
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${ROLE}') THEN
        CREATE ROLE ${ROLE} NOLOGIN NOINHERIT;
      END IF;
      EXECUTE 'GRANT ${ROLE} TO app_runtime';
    END $$`);
    await admin.query(`CREATE SCHEMA ${SCHEMA}`);
    await admin.query(`GRANT USAGE ON SCHEMA ${SCHEMA} TO ${ROLE}`);
    for (const table of ['widget', 'effect']) {
      const cols =
        table === 'widget'
          ? 'id UUID PRIMARY KEY, organization_id UUID NOT NULL, name TEXT NOT NULL'
          : 'consumer TEXT NOT NULL, event_id UUID NOT NULL, organization_id UUID NOT NULL, seen_org TEXT'; // prettier-ignore
      await admin.query(`CREATE TABLE ${SCHEMA}.${table} (${cols})`);
      await admin.query(`GRANT SELECT, INSERT ON ${SCHEMA}.${table} TO ${ROLE}`);
      await admin.query(`ALTER TABLE ${SCHEMA}.${table} ENABLE ROW LEVEL SECURITY`);
      await admin.query(`CREATE POLICY ${ROLE}_${table} ON ${SCHEMA}.${table} TO ${ROLE}
        USING (organization_id = ${ORG_SETTING}) WITH CHECK (organization_id = ${ORG_SETTING})`);
    }
    await admin.query(outboxMigrationSql(SCHEMA, ROLE));
  });

  beforeEach(async () => {
    await admin.query(`TRUNCATE ${SCHEMA}.outbox_events, ${SCHEMA}.processed_events,
                       ${SCHEMA}.widget, ${SCHEMA}.effect`);
  });

  afterAll(async () => {
    await admin?.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await Promise.all([admin?.end(), app?.end(), founder?.end()]);
  });

  it('the event and the data change are written together, with the full envelope', async () => {
    const env = await createWidget(ORG_A, 'Aurora');
    expect(env.eventId).toMatch(UUID_V7);
    const [row] = await adminQuery(
      `SELECT type, version, organization_id::text AS org, source_app, resource_id, payload, status
         FROM ${SCHEMA}.outbox_events WHERE event_id = $1`,
      [env.eventId],
    );
    expect(row).toEqual({
      type: 'widget.created',
      version: 1,
      org: ORG_A,
      source_app: 'test',
      resource_id: env.resourceId,
      payload: { widgetId: env.resourceId, name: 'Aurora' },
      status: 'pending',
    });
  });

  it('a rolled-back transaction leaves no event (and no data)', async () => {
    const env = await createWidget(ORG_A, 'Anulat', { rollback: true });
    expect(await adminQuery(`SELECT 1 FROM ${SCHEMA}.outbox_events WHERE event_id = $1`, [env.eventId])).toEqual([]); // prettier-ignore
    expect(await adminQuery(`SELECT 1 FROM ${SCHEMA}.widget WHERE id = $1`, [env.resourceId])).toEqual([]); // prettier-ignore
  });

  it('an event for another organization cannot be written (RLS WITH CHECK)', async () => {
    await expect(createWidget(ORG_A, 'Străin', { envelopeOrg: ORG_B })).rejects.toThrow(
      /row-level security/,
    );
    expect(await adminQuery(`SELECT 1 FROM ${SCHEMA}.outbox_events`)).toEqual([]);
  });

  it('double delivery → a single effect, for each consumer', async () => {
    const registry = new ConsumerRegistry()
      .register(effectConsumer('t6.first'))
      .register(effectConsumer('t6.second'));
    const env = await createWidget(ORG_A, 'Dublu');

    expect(await dispatch(registry)).toEqual({ delivered: 1, retried: 0, dead: 0, skipped: 0 });
    expect((await eventRow(env.eventId)).status).toBe('dispatched');

    // the same event delivered again (e.g. a dispatcher crashed before marking it)
    await adminQuery(`UPDATE ${SCHEMA}.outbox_events SET status = 'pending' WHERE event_id = $1`, [
      env.eventId,
    ]);
    expect(await dispatch(registry)).toMatchObject({ delivered: 1 });
    expect((await effects(env.eventId)).map((e) => e.consumer)).toEqual(['t6.first', 't6.second']);
    const processed = await adminQuery(
      `SELECT consumer FROM ${SCHEMA}.processed_events WHERE event_id = $1 ORDER BY consumer`,
      [env.eventId],
    );
    expect(processed.map((p) => p.consumer)).toEqual(['t6.first', 't6.second']);
  });

  it('two dispatchers at once: each event is delivered once (FOR UPDATE SKIP LOCKED)', async () => {
    const registry = new ConsumerRegistry().register(effectConsumer('t6.parallel'));
    const events = await Promise.all(
      Array.from({ length: 6 }, (_, i) => createWidget(i % 2 ? ORG_A : ORG_B, `P${i}`)),
    );
    const [one, two] = await Promise.all([dispatch(registry), dispatch(registry)]);
    expect(one.delivered + two.delivered).toBe(6);
    for (const env of events) expect(await effects(env.eventId)).toHaveLength(1);
  });

  it('a consumer failing 3 times → dead-letter, no more retries; others keep their effect', async () => {
    const registry = new ConsumerRegistry()
      .register(effectConsumer('t6.ok'))
      .register(effectConsumer('t6.broken', { fail: () => true }));
    const env = await createWidget(ORG_A, 'Eșuat');

    expect(await dispatch(registry)).toMatchObject({ retried: 1 });
    let row = await eventRow(env.eventId);
    expect(row).toMatchObject({ status: 'pending', attempts: 1, failed_at: null });
    expect(row.last_error).toContain('t6.broken is down');
    expect(row.available_at.getTime()).toBeGreaterThan(Date.now() + 20_000); // backoff 30 s

    await makeAvailable(env.eventId);
    expect(await dispatch(registry)).toMatchObject({ retried: 1 });
    expect((await eventRow(env.eventId)).attempts).toBe(2);

    await makeAvailable(env.eventId);
    expect(await dispatch(registry)).toMatchObject({ dead: 1 });
    row = await eventRow(env.eventId);
    expect(row).toMatchObject({ status: 'dead', attempts: 3 });
    expect(row.failed_at).toBeInstanceOf(Date);

    // no automatic retry from dead-letter
    await makeAvailable(env.eventId);
    expect(await dispatch(registry)).toEqual({ delivered: 0, retried: 0, dead: 0, skipped: 0 });
    expect((await eventRow(env.eventId)).attempts).toBe(3);
    // the healthy consumer ran once, despite the three deliveries
    expect((await effects(env.eventId)).map((e) => e.consumer)).toEqual(['t6.ok']);
  });

  it('the dead-letter list is readable by Founder (founder_runtime), without the payload', async () => {
    const registry = new ConsumerRegistry().register(
      effectConsumer('t6.always-down', { fail: () => true }),
    );
    const env = await createWidget(ORG_B, 'Pentru Founder');
    for (let i = 0; i < 3; i++) {
      await makeAvailable(env.eventId);
      await dispatch(registry);
    }
    const list = await listOutboxDeadLetters({ founderPool: founder, schemas: [SCHEMA] });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      schema: SCHEMA,
      eventId: env.eventId,
      type: 'widget.created',
      organizationId: ORG_B,
      attempts: 3,
    });
    expect(list[0]).not.toHaveProperty('payload');
    if (FOUNDER_URL) {
      // founder_runtime reads only through the function, never the table
      await expect(founder.query(`SELECT * FROM ${SCHEMA}.outbox_events`)).rejects.toThrow(
        /permission denied/,
      );
    }
  });

  it('an event of organization A is processed only in the context of A (RLS)', async () => {
    const seen: { org: string; widgets: number; foreignWrite: string }[] = [];
    const registry = new ConsumerRegistry().register({
      name: 't6.rls',
      handles: [{ type: 'widget.created', version: 1 }],
      async handle(envelope, tx) {
        const { rows } = await tx.query(
          `SELECT current_setting('app.organization_id', true) AS org,
                  (SELECT count(*)::int FROM ${SCHEMA}.widget) AS widgets`,
        );
        const r = rows[0] as { org: string; widgets: number };
        let foreignWrite = 'allowed';
        const other = envelope.organizationId === ORG_A ? ORG_B : ORG_A;
        await tx.query('SAVEPOINT foreign_write');
        try {
          await tx.query(
            `INSERT INTO ${SCHEMA}.widget (id, organization_id, name) VALUES ($1, $2, 'x')`,
            [crypto.randomUUID(), other],
          );
        } catch (err) {
          foreignWrite = (err as Error).message.includes('row-level security')
            ? 'refused'
            : 'error';
        }
        await tx.query('ROLLBACK TO SAVEPOINT foreign_write');
        seen.push({ org: r.org, widgets: r.widgets, foreignWrite });
        expect(r.org).toBe(envelope.organizationId);
      },
    });
    await createWidget(ORG_A, 'A1');
    await createWidget(ORG_A, 'A2');
    await createWidget(ORG_B, 'B1');

    expect(await dispatch(registry)).toMatchObject({ delivered: 3 });
    expect(seen.map((s) => s.org).sort()).toEqual([ORG_A, ORG_A, ORG_B].sort());
    // each consumer call sees only its own organization's rows and cannot write into the other
    for (const s of seen) {
      expect(s.widgets).toBe(s.org === ORG_A ? 2 : 1);
      expect(s.foreignWrite).toBe('refused');
    }
  });

  it('without a consumer: `complete` events are marked delivered, `dead_letter` ones are not', async () => {
    const empty = new ConsumerRegistry();
    const created = await createWidget(ORG_A, 'Fără consumator');
    const client = await app.connect();
    let noted: OutboxEnvelope;
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL ROLE ${ROLE}`);
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [ORG_A]);
      noted = await writeOutboxEvent(client, SCHEMA, WidgetNoted, {
        organizationId: ORG_A,
        sourceApp: 'test',
        resourceId: created.resourceId,
        payload: { widgetId: created.resourceId },
      });
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    expect(await dispatch(empty)).toMatchObject({ delivered: 1, dead: 1 });
    expect((await eventRow(noted!.eventId)).status).toBe('dispatched');
    const dead = await eventRow(created.eventId);
    expect(dead).toMatchObject({ status: 'dead', last_error: 'no consumer registered' });
  });

  it('the module role cannot delete events nor read the dead-letter function', async () => {
    await createWidget(ORG_A, 'Istoric');
    const client = await app.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL ROLE ${ROLE}`);
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [ORG_A]);
      await expect(client.query(`DELETE FROM ${SCHEMA}.outbox_events`)).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
    const c2 = await app.connect();
    try {
      await c2.query('BEGIN');
      await c2.query(`SET LOCAL ROLE ${ROLE}`);
      await expect(c2.query(`SELECT * FROM ${SCHEMA}.outbox_dead_letters(10)`)).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await c2.query('ROLLBACK').catch(() => {});
      c2.release();
    }
  });
});
