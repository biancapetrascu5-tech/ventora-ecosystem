import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import { z } from 'zod';
import { outboxMigrationSql, writeOutboxEvent, type OutboxEnvelope } from '@ventora/db-kit';
import { defineEvent, type EventDefinition } from '@ventora/contracts';
import {
  ConsumerRegistry,
  createJobsClient,
  JobRegistry,
  outboxDispatchJob,
  runJob,
  toInngestFunctions,
  type JobDefinition,
} from '../index';

/*
 * Lot 4.2, „Gata când”: dispecerul outbox ca job periodic livrează un eveniment scris de 4.1.
 * Emițător de test: schema `jobs_t42`, rolul `jobs_t42_rw`, din migrarea-șablon, pe baza
 * organizations. Job-ul rulează prin runJob, exact ca în funcția servită de Inngest.
 */

const APP_URL = process.env.DATABASE_URL_TEST ?? '';
const ADMIN_URL = process.env.DATABASE_URL_ADMIN_TEST ?? '';

const SCHEMA = 'jobs_t42';
const ROLE = 'jobs_t42_rw';
const ORG_SETTING = `NULLIF(current_setting('app.organization_id', true), '')::uuid`;

const WidgetShipped = defineEvent({
  type: 'widget.shipped',
  version: 1,
  sourceApp: 'test',
  growthSafe: false,
  withoutConsumer: 'dead_letter',
  schema: z.object({ widgetId: z.uuid() }).strict(),
});
const CATALOG: readonly EventDefinition[] = [WidgetShipped as EventDefinition];

let admin: pg.Pool;
let app: pg.Pool;

async function emit(org: string): Promise<OutboxEnvelope> {
  const client = await app.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${ROLE}`);
    await client.query(`SELECT set_config('app.organization_id', $1, true)`, [org]);
    const envelope = await writeOutboxEvent(client, SCHEMA, WidgetShipped, {
      organizationId: org,
      sourceApp: 'test',
      resourceId: crypto.randomUUID(),
      payload: { widgetId: crypto.randomUUID() },
      correlationId: 'req-42',
    });
    await client.query('COMMIT');
    return envelope;
  } finally {
    client.release();
  }
}

const runnable = (job: JobDefinition) =>
  job as JobDefinition & { run: NonNullable<JobDefinition['run']> };

const run = APP_URL && ADMIN_URL ? describe : describe.skip;

run('Lot 4.2 — the outbox dispatcher as a scheduled job', () => {
  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: ADMIN_URL, max: 2 });
    app = new pg.Pool({ connectionString: APP_URL, max: 2 });
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${ROLE}') THEN
        CREATE ROLE ${ROLE} NOLOGIN NOINHERIT;
      END IF;
      EXECUTE 'GRANT ${ROLE} TO app_runtime';
    END $$`);
    await admin.query(`CREATE SCHEMA ${SCHEMA}`);
    await admin.query(`GRANT USAGE ON SCHEMA ${SCHEMA} TO ${ROLE}`);
    await admin.query(`CREATE TABLE ${SCHEMA}.effect (event_id UUID NOT NULL,
      organization_id UUID NOT NULL, seen_org TEXT)`);
    await admin.query(`GRANT SELECT, INSERT ON ${SCHEMA}.effect TO ${ROLE}`);
    await admin.query(`ALTER TABLE ${SCHEMA}.effect ENABLE ROW LEVEL SECURITY`);
    await admin.query(`CREATE POLICY ${ROLE}_effect ON ${SCHEMA}.effect TO ${ROLE}
      USING (organization_id = ${ORG_SETTING}) WITH CHECK (organization_id = ${ORG_SETTING})`);
    await admin.query(outboxMigrationSql(SCHEMA, ROLE));
  });

  afterAll(async () => {
    await admin?.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin?.end();
    await app?.end();
  });

  it('delivers an event written by 4.1, in the tenant context from the envelope', async () => {
    const orgA = crypto.randomUUID();
    const orgB = crypto.randomUUID();
    const [a, b] = [await emit(orgA), await emit(orgB)];

    const consumers = new ConsumerRegistry().register({
      name: 'jobs-t42.effect',
      handles: [{ type: 'widget.shipped', version: 1 }],
      async handle(envelope, tx) {
        const { rows } = await tx.query(
          `SELECT current_setting('app.organization_id', true) AS org`,
        );
        await tx.query(
          `INSERT INTO ${SCHEMA}.effect (event_id, organization_id, seen_org) VALUES ($1, $2, $3)`,
          [envelope.eventId, envelope.organizationId, (rows[0] as { org: string }).org],
        );
      },
    });
    const job = outboxDispatchJob({
      pool: app,
      sources: [{ schema: SCHEMA, moduleRole: ROLE }],
      consumers,
      catalog: CATALOG,
    });
    expect(job).toMatchObject({ id: 'platform.outbox-dispatch', trigger: { cron: '* * * * *' } });

    const report = vi.fn();
    const result = await runJob(runnable(job), { runId: 'run-1', attempt: 0 }, report);
    expect(result).toEqual({ [SCHEMA]: { delivered: 2, retried: 0, dead: 0, skipped: 0 } });
    expect(report).not.toHaveBeenCalled();

    const rows = (
      await admin.query(
        `SELECT e.event_id::text, e.status, f.seen_org FROM ${SCHEMA}.outbox_events e
           JOIN ${SCHEMA}.effect f ON f.event_id = e.event_id ORDER BY e.occurred_at`,
      )
    ).rows;
    expect(rows).toEqual([
      { event_id: a.eventId, status: 'dispatched', seen_org: orgA },
      { event_id: b.eventId, status: 'dispatched', seen_org: orgB },
    ]);

    // the next tick finds nothing left
    expect(await runJob(runnable(job), { runId: 'run-2', attempt: 0 }, report)).toEqual({
      [SCHEMA]: { delivered: 0, retried: 0, dead: 0, skipped: 0 },
    });
  });

  it('a failing source does not stop the others; the job is reported and thrown for a retry', async () => {
    const org = crypto.randomUUID();
    const ok = await emit(org);
    const job = outboxDispatchJob({
      pool: app,
      // a schema without an outbox: its dispatch fails
      sources: [
        { schema: 'jobs_t42_missing', moduleRole: ROLE },
        { schema: SCHEMA, moduleRole: ROLE },
      ],
      consumers: new ConsumerRegistry().register({
        name: 'jobs-t42.noop',
        handles: [{ type: 'widget.shipped', version: 1 }],
        async handle() {},
      }),
      catalog: CATALOG,
    });
    const report = vi.fn();
    await expect(runJob(runnable(job), { runId: 'run-3', attempt: 0 }, report)).rejects.toThrow(
      /outbox dispatch failed for: jobs_t42_missing/,
    );
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'platform.outbox-dispatch', retriable: true }),
    );
    const status = (
      await admin.query(`SELECT status FROM ${SCHEMA}.outbox_events WHERE event_id = $1`, [
        ok.eventId,
      ])
    ).rows[0];
    expect(status).toEqual({ status: 'dispatched' });
  });

  it('served through Inngest with the platform retry rule', () => {
    const registry = new JobRegistry().register(
      outboxDispatchJob({
        pool: app,
        sources: [{ schema: SCHEMA, moduleRole: ROLE }],
        consumers: new ConsumerRegistry(),
      }),
    );
    const [fn] = toInngestFunctions(createJobsClient({ isDev: true }), registry, () => {});
    expect(fn!.id()).toBe('platform.outbox-dispatch');
    expect(fn!.opts).toMatchObject({ retries: 3, triggers: [{ cron: '* * * * *' }] });
  });
});
