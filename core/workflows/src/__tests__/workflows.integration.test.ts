import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { closeAuditPools } from '@ventora/audit';
import { closeCommercialPools, commitQuota, reserveQuota } from '@ventora/commercial';
import { Conflict, InvalidInput, QuotaExceeded } from '@ventora/errors';
import { founderAuth } from '@ventora/identity';
import { ConsumerRegistry, dispatchOutbox } from '@ventora/integrations';
import {
  activateWorkflow,
  activationExists,
  closeWorkflowsPools,
  listActivationsForFounder,
  listDefinitionsForFounder,
  listExecutionsForFounder,
  retryExecution,
  runPendingExecutions,
  saveDefinition,
  setEnginePaused,
  startOperationId,
  stopWorkflow,
  workflowsTriggerConsumer,
} from '../index';

// Lot 4.10 — „Gata când” (FAZA-4) on the real roles: an automation started from Founder runs on
// its event (the real quota event of Lot 3.3, commercial.quota.threshold) and its run is in the
// log; starting over workflows.active is refused; a business cannot start or stop one (refused by
// the database); every start and stop is audited on the Founder. The engine on app_runtime
// (workflows_rw), Founder on founder_runtime (workflows_founder), fixtures as postgres.

const adminPool = new Pool({ connectionString: process.env.DIRECT_URL, max: 2 });
const appPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
let admin: PoolClient;
const q = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;
const newUuid = () => crypto.randomUUID();

// ── Founder session with 2FA (as in core/commercial plans.integration) ────────────────────

const FOUNDER_PASSPHRASE = 'Founder-test-passphrase-1';

async function totpFromBase32(base32Secret: string): Promise<string> {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of base32Secret.toUpperCase().replace(/=+$/, '')) {
    const v = alpha.indexOf(c);
    if (v >= 0) bits += v.toString(2).padStart(5, '0');
  }
  const raw = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < raw.length; i++) raw[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  const counterBuf = new Uint8Array(8);
  new DataView(counterBuf.buffer).setBigUint64(0, BigInt(Math.floor(Date.now() / 30_000)), false);
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-1' }, false, [
    'sign',
  ]);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, counterBuf));
  const offset = sig[sig.length - 1]! & 0x0f;
  const code =
    (((sig[offset]! & 0x7f) << 24) |
      ((sig[offset + 1]! & 0xff) << 16) |
      ((sig[offset + 2]! & 0xff) << 8) |
      (sig[offset + 3]! & 0xff)) %
    1_000_000;
  return code.toString().padStart(6, '0');
}

function sessionCookieFrom(resp: Response): string {
  const all =
    (resp.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ??
    (resp.headers.get('set-cookie') ?? '').split(', ');
  const line = all.find((c) => c.includes('session_token='));
  if (!line) throw new Error('no session cookie in response');
  return line.split(';')[0]!.trim();
}

let founderId: string;
let founderHeaders: () => Headers;

async function createFounder(): Promise<void> {
  const email = `founder-l410-${newUuid()}@test.local`;
  await founderAuth.api.signUpEmail({
    body: { name: 'Founder 4.10', email, password: FOUNDER_PASSPHRASE },
  });
  const signIn = await founderAuth.api.signInEmail({
    body: { email, password: FOUNDER_PASSPHRASE },
    asResponse: true,
  });
  let cookie = sessionCookieFrom(signIn);
  const [row] = await q(`SELECT id FROM founder_identity.users WHERE email = $1`, [email]);
  founderId = row!.id;
  const enabled = await founderAuth.api.enableTwoFactor({
    headers: new Headers({ cookie }),
    body: { password: FOUNDER_PASSPHRASE },
  });
  const secret = (enabled as { totpURI: string }).totpURI.match(/[?&]secret=([A-Z2-7=]+)/i)![1]!;
  const verified = await founderAuth.api.verifyTOTP({
    headers: new Headers({ cookie }),
    body: { code: await totpFromBase32(secret) },
    asResponse: true,
  });
  cookie = sessionCookieFrom(verified);
  founderHeaders = () => new Headers({ cookie });
}

// ── A business with its owner, an admin and a member, on a bundle with these limits ─────────

let planId: string;

async function user(name: string): Promise<string> {
  const id = newUuid();
  await q(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, true, false, now(), now())`,
    [id, name, `l410-${id}@test.local`],
  );
  return id;
}

async function business(quotas: Record<string, number>) {
  const organizationId = newUuid();
  const ownerId = await user('Bianca Petrașcu');
  const adminId = await user('Ioana Pavel');
  const memberId = await user('Mara Enache');
  await q(
    `INSERT INTO organizations.organization (id, slug, name, created_via, updated_at)
     VALUES ($1, $2, 'Salon Aurora', 'founder', now())`,
    [organizationId, `l410-${organizationId.slice(0, 12)}`],
  );
  for (const [userId, role] of [
    [ownerId, 'owner'],
    [adminId, 'admin'],
    [memberId, 'member'],
  ] as const) {
    await q(
      `INSERT INTO organizations.membership (organization_id, user_id, role, status, updated_at)
       VALUES ($1, $2, $3, 'active', now())`,
      [organizationId, userId, role],
    );
  }
  const [v] = await q(
    `INSERT INTO commercial.plan_version (plan_id, version_number, created_by_founder_id)
     SELECT $1, COALESCE(max(version_number), 0) + 1, $2 FROM commercial.plan_version WHERE plan_id = $1
     RETURNING id`,
    [planId, founderId],
  );
  for (const [key, limit] of Object.entries(quotas)) {
    await q(
      `INSERT INTO commercial.plan_version_quota (plan_version_id, quota_key, limit_value) VALUES ($1, $2, $3)`,
      [v!.id, key, limit],
    );
  }
  await q(
    `INSERT INTO commercial.plan_version_price (plan_version_id, currency, kind, amount_minor)
     VALUES ($1, 'RON', 'month', 100), ($1, 'RON', 'year', 1000)`,
    [v!.id],
  );
  await q(
    `UPDATE commercial.plan_version SET published_at = now(), published_by_founder_id = $2 WHERE id = $1`,
    [v!.id, founderId],
  );
  const startedOn = new Date().toISOString().slice(0, 10);
  await q(
    `INSERT INTO commercial.subscription
       (organization_id, plan_version_id, interval, currency, started_on, anchor_day, status, created_by_founder_id)
     VALUES ($1, $2, 'month', 'RON', $3::date, EXTRACT(DAY FROM $3::date), 'active', $4)`,
    [organizationId, v!.id, startedOn, founderId],
  );
  return { organizationId, ownerId, adminId, memberId };
}

const counter = async (org: string, key: string) =>
  (
    await q(
      `SELECT used::int AS used, reserved::int AS reserved FROM commercial.usage_counter
        WHERE organization_id = $1 AND quota_key = $2`,
      [org, key],
    )
  )[0] ?? { used: 0, reserved: 0 };

/** Consumes `n` appointments (reserve + commit): at 80% commercial writes its quota event. */
async function consume(org: string, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    const op = newUuid();
    await reserveQuota({ organizationId: org }, 'booking.appointments', 1, op);
    await commitQuota({ organizationId: org }, op);
  }
}

const registry = () => new ConsumerRegistry().register(workflowsTriggerConsumer);

/** Delivers this business's commercial events (the others, left by other suites, set aside). */
async function dispatchCommercial(org: string) {
  await q(
    `UPDATE commercial.outbox_events SET status = 'dispatched'
      WHERE status = 'pending' AND organization_id <> $1`,
    [org],
  );
  return dispatchOutbox({
    pool: appPool,
    source: { schema: 'commercial', moduleRole: 'commercial_rw' },
    registry: registry(),
    limit: 100,
  });
}

const executions = (org: string) =>
  q(
    `SELECT id, status, reason_code, messages_sent::int AS messages_sent, attempts::int AS attempts,
            definition_version, trigger_type, subject_type
       FROM workflows.execution WHERE organization_id = $1 ORDER BY created_at, id`,
    [org],
  );

const auditRows = (org: string | null, action: string) =>
  q(
    `SELECT category, actor_type, actor_id::text AS actor_id, founder_id::text AS founder_id,
            target_type, target_id, metadata
       FROM audit.audit_log
      WHERE action = $2 AND organization_id IS NOT DISTINCT FROM $1::uuid
      ORDER BY created_at`,
    [org, action],
  );

let quotaDefinitionId: string;
let unavailableDefinitionId: string;

beforeAll(async () => {
  admin = await adminPool.connect();
  await createFounder();
  const [p] = await q(
    `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'Lot 4.10', $2) RETURNING id`,
    [`l410-${Date.now()}`, founderId],
  );
  planId = p!.id;
  // „Limita aproape atinsă” (D4-24 #6): the S115 notification of the limits, at 80%
  ({ definitionId: quotaDefinitionId } = await saveDefinition({
    founderHeaders: founderHeaders(),
    code: `quota-${Date.now()}`,
    name: 'Limita aproape atinsă',
    trigger: 'commercial.quota_threshold',
    triggerParams: { thresholds: [80] },
    steps: [{ kind: 'notification.hub', template: 'quota_limit' }],
  }));
  // whitelisted but its texts come with Booking: a run fails visibly („step.unavailable”)
  ({ definitionId: unavailableDefinitionId } = await saveDefinition({
    founderHeaders: founderHeaders(),
    code: `risk-${Date.now()}`,
    name: 'Alertă la limită (test)',
    trigger: 'commercial.quota_threshold',
    triggerParams: { thresholds: [80] },
    steps: [{ kind: 'notification.hub', template: 'high_risk' }],
  }));
});

afterAll(async () => {
  await setEnginePaused({ founderHeaders: founderHeaders(), paused: false }).catch(() => {});
  admin?.release();
  await adminPool.end();
  await appPool.end();
  await closeWorkflowsPools();
  await closeCommercialPools();
  await closeAuditPools();
});

describe('Lot 4.10 — the builder (whitelist on the server, S116-D19)', () => {
  it('refuses a step outside the whitelist, in the contract and in the database', async () => {
    await expect(
      saveDefinition({
        founderHeaders: founderHeaders(),
        code: `bad-${Date.now()}`,
        name: 'Șterge clientul',
        trigger: 'commercial.quota_threshold',
        triggerParams: { thresholds: [80] },
        steps: [{ kind: 'db.delete_client' as 'email.client', template: 'x' }],
      }),
    ).rejects.toBeInstanceOf(InvalidInput);
    // the CHECK holds even for a writer that skips the contract
    await expect(
      q(
        `INSERT INTO workflows.definition_version
           (definition_id, version, trigger_type, steps, created_by_founder_id)
         VALUES ($1, 99, 'commercial.quota_threshold', '[{"kind":"sql","template":"x"}]', $2)`,
        [quotaDefinitionId, founderId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      q(
        `INSERT INTO workflows.definition_version
           (definition_id, version, trigger_type, steps, created_by_founder_id)
         VALUES ($1, 99, 'booking.client_deleted', '[{"kind":"email.client","template":"x"}]', $2)`,
        [quotaDefinitionId, founderId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('a saved version does not change; saving again makes the next version (audited)', async () => {
    const { version } = await saveDefinition({
      founderHeaders: founderHeaders(),
      definitionId: unavailableDefinitionId,
      name: 'Alertă la limită (test)',
      trigger: 'commercial.quota_threshold',
      triggerParams: { thresholds: [80] },
      steps: [{ kind: 'notification.hub', template: 'high_risk' }],
    });
    expect(version).toBe(2);
    await expect(
      q(`UPDATE workflows.definition_version SET delay_minutes = 120 WHERE definition_id = $1`, [
        unavailableDefinitionId,
      ]),
    ).rejects.toThrow(/cannot change/);
    const rows = await q(
      `SELECT metadata FROM audit.audit_log WHERE action = 'workflows.definition_saved' AND target_id = $1
        ORDER BY created_at`,
      [unavailableDefinitionId],
    );
    expect(rows.map((r) => r.metadata.version)).toEqual([1, 2]);
  });
});

describe('Lot 4.10 — starting and stopping (D-WF-2, D-WF-4)', () => {
  it('starting holds one workflows.active unit and is audited on the Founder, with the reason', async () => {
    const b = await business({ 'workflows.active': 1, 'booking.appointments': 10 });
    const { activationId } = await activateWorkflow({
      founderHeaders: founderHeaders(),
      organizationId: b.organizationId,
      definitionId: quotaDefinitionId,
      reason: 'Proprietara a cerut-o la telefon',
      supportRef: 'VS-2026-0188',
    });
    expect(await counter(b.organizationId, 'workflows.active')).toEqual({ used: 1, reserved: 0 });
    const [a] = await q(
      `SELECT status, quota_operation_id FROM workflows.activation WHERE id = $1`,
      [activationId],
    );
    expect(a).toEqual({ status: 'active', quota_operation_id: startOperationId(activationId) });
    const [row] = await auditRows(b.organizationId, 'workflows.activated');
    expect(row).toMatchObject({
      category: 'founder',
      actor_type: 'founder',
      actor_id: founderId,
      founder_id: founderId,
      target_type: 'workflow_activation',
      target_id: activationId,
      metadata: {
        definitionId: quotaDefinitionId,
        reason: 'Proprietara a cerut-o la telefon',
        supportRef: 'VS-2026-0188',
      },
    });
    // the reconciliation of §8.3 sees the activation behind the operation
    expect(await activationExists(b.organizationId, startOperationId(activationId))).toBe(true);
    expect(await activationExists(b.organizationId, startOperationId(newUuid()))).toBe(false);
  });

  it('over workflows.active → QuotaExceeded, nothing written, no unit held', async () => {
    const b = await business({ 'workflows.active': 1, 'booking.appointments': 10 });
    await activateWorkflow({
      founderHeaders: founderHeaders(),
      organizationId: b.organizationId,
      definitionId: quotaDefinitionId,
      reason: 'Pachetul de lansare',
    });
    await expect(
      activateWorkflow({
        founderHeaders: founderHeaders(),
        organizationId: b.organizationId,
        definitionId: unavailableDefinitionId,
        reason: 'A doua',
      }),
    ).rejects.toBeInstanceOf(QuotaExceeded);
    expect(
      await q(`SELECT definition_id FROM workflows.activation WHERE organization_id = $1`, [
        b.organizationId,
      ]),
    ).toEqual([{ definition_id: quotaDefinitionId }]);
    expect(await counter(b.organizationId, 'workflows.active')).toEqual({ used: 1, reserved: 0 });
    expect(await auditRows(b.organizationId, 'workflows.activated')).toHaveLength(1);
  });

  it('the same automation twice → Conflict; without a reason → InvalidInput', async () => {
    const b = await business({ 'workflows.active': 5, 'booking.appointments': 10 });
    await expect(
      activateWorkflow({
        founderHeaders: founderHeaders(),
        organizationId: b.organizationId,
        definitionId: quotaDefinitionId,
        reason: '   ',
      }),
    ).rejects.toBeInstanceOf(InvalidInput);
    await activateWorkflow({
      founderHeaders: founderHeaders(),
      organizationId: b.organizationId,
      definitionId: quotaDefinitionId,
      reason: 'Prima',
    });
    await expect(
      activateWorkflow({
        founderHeaders: founderHeaders(),
        organizationId: b.organizationId,
        definitionId: quotaDefinitionId,
        reason: 'A doua oară',
      }),
    ).rejects.toBeInstanceOf(Conflict);
    expect(await counter(b.organizationId, 'workflows.active')).toEqual({ used: 1, reserved: 0 });
  });

  it('stopping frees the unit, is audited with its reason, and the slot can be used again', async () => {
    const b = await business({ 'workflows.active': 1, 'booking.appointments': 10 });
    const { activationId } = await activateWorkflow({
      founderHeaders: founderHeaders(),
      organizationId: b.organizationId,
      definitionId: quotaDefinitionId,
      reason: 'Prima',
    });
    await stopWorkflow({
      founderHeaders: founderHeaders(),
      organizationId: b.organizationId,
      definitionId: quotaDefinitionId,
      reason: 'Afacerea a cerut oprirea',
      supportRef: 'VS-2026-0190',
    });
    expect(await counter(b.organizationId, 'workflows.active')).toEqual({ used: 0, reserved: 0 });
    const [a] = await q(
      `SELECT status, stop_reason, (quota_freed_at IS NOT NULL) AS freed FROM workflows.activation WHERE id = $1`,
      [activationId],
    );
    expect(a).toEqual({ status: 'stopped', stop_reason: 'Afacerea a cerut oprirea', freed: true });
    const [row] = await auditRows(b.organizationId, 'workflows.stopped');
    expect(row).toMatchObject({
      category: 'founder',
      actor_id: founderId,
      target_id: activationId,
      metadata: { reason: 'Afacerea a cerut oprirea', supportRef: 'VS-2026-0190' },
    });
    await expect(
      stopWorkflow({
        founderHeaders: founderHeaders(),
        organizationId: b.organizationId,
        definitionId: quotaDefinitionId,
        reason: 'Încă o dată',
      }),
    ).rejects.toBeInstanceOf(Conflict);
    // the unit is back: the other automation fits now
    await activateWorkflow({
      founderHeaders: founderHeaders(),
      organizationId: b.organizationId,
      definitionId: unavailableDefinitionId,
      reason: 'Cealaltă',
    });
    expect(await counter(b.organizationId, 'workflows.active')).toEqual({ used: 1, reserved: 0 });
  });

  it('a business cannot start or stop an automation: refused by the database (D-WF-3)', async () => {
    const b = await business({ 'workflows.active': 5, 'booking.appointments': 10 });
    await activateWorkflow({
      founderHeaders: founderHeaders(),
      organizationId: b.organizationId,
      definitionId: quotaDefinitionId,
      reason: 'Prima',
    });
    // the Hub's connection: app_runtime as workflows_rw, in the business's context
    const asBusiness = async (sql: string, params: unknown[]) => {
      const client = await appPool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE workflows_rw');
        await client.query(`SELECT set_config('app.organization_id', $1, true)`, [
          b.organizationId,
        ]);
        return await client.query(sql, params);
      } finally {
        await client.query('ROLLBACK').catch(() => {});
        client.release();
      }
    };
    await expect(
      asBusiness(
        `INSERT INTO workflows.activation
           (id, organization_id, definition_id, quota_operation_id, activated_by_founder_id, activation_reason)
         VALUES ($1, $2, $3, $4, $5, 'din Hub')`,
        [newUuid(), b.organizationId, unavailableDefinitionId, `x:${newUuid()}`, b.ownerId],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      asBusiness(`UPDATE workflows.activation SET status = 'stopped' WHERE organization_id = $1`, [
        b.organizationId,
      ]),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      asBusiness(`UPDATE workflows.definition SET name = 'x' WHERE id = $1`, [quotaDefinitionId]),
    ).rejects.toMatchObject({ code: '42501' });
    // it reads its own automations, only them
    const own = await asBusiness(`SELECT organization_id FROM workflows.activation`, []);
    expect(own.rows).toEqual([{ organization_id: b.organizationId }]);
  });
});

describe('Lot 4.10 — the engine on the quota event (S116-D21)', () => {
  it('an automation started from Founder runs on its event; the run and its step are in the log', async () => {
    const b = await business({ 'workflows.active': 2, 'booking.appointments': 10 });
    await activateWorkflow({
      founderHeaders: founderHeaders(),
      organizationId: b.organizationId,
      definitionId: quotaDefinitionId,
      reason: 'Test de capăt la capăt',
    });
    await consume(b.organizationId, 8); // 8 / 10 = 80% → commercial.quota.threshold
    const [event] = await q(
      `SELECT event_id FROM commercial.outbox_events
        WHERE organization_id = $1 AND type = 'commercial.quota.threshold'`,
      [b.organizationId],
    );
    expect(event).toBeTruthy();
    expect(await dispatchCommercial(b.organizationId)).toMatchObject({ dead: 0 });
    expect(await executions(b.organizationId)).toEqual([
      expect.objectContaining({ status: 'pending', trigger_type: 'commercial.quota_threshold' }),
    ]);

    const report = await runPendingExecutions({ limit: 100 });
    expect(report.errors).toEqual([]);
    const [run] = await executions(b.organizationId);
    // owner in the app (and by e-mail), admin and member in the app: 3 notifications
    expect(run).toMatchObject({
      status: 'succeeded',
      reason_code: null,
      messages_sent: 3,
      attempts: 1,
      definition_version: 1,
      subject_type: 'owner',
    });
    expect(
      await q(
        `SELECT step_index, kind, template, status, messages_sent::int AS n FROM workflows.execution_step WHERE execution_id = $1`,
        [run!.id],
      ),
    ).toEqual([
      { step_index: 0, kind: 'notification.hub', template: 'quota_limit', status: 'sent', n: 3 },
    ]);
    // the S115 notification itself, keyed on the quota event (one message, never a second one)
    const notes = await q(
      `SELECT n.recipient_user_id::text AS who, n.type, count(d.id)::int AS emails
         FROM notifications.notification n
         LEFT JOIN notifications.delivery d ON d.notification_id = n.id AND d.channel = 'email'
        WHERE n.organization_id = $1 GROUP BY 1, 2 ORDER BY 2, 1`,
      [b.organizationId],
    );
    expect(notes).toEqual(
      [
        { who: b.adminId, type: 'billing.limit.other80', emails: 0 },
        { who: b.memberId, type: 'billing.limit.other80', emails: 0 },
        { who: b.ownerId, type: 'billing.limit.owner80', emails: 1 },
      ].sort((x, y) => (x.type + x.who).localeCompare(y.type + y.who)),
    );

    // delivered again → no second run; the run itself is not run twice
    const replay = registry();
    const client = await appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE commercial_rw');
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [b.organizationId]);
      const [consumer] = replay.consumersFor('commercial.quota.threshold', 1);
      const [ev] = (
        await client.query(
          `SELECT event_id, type, version, occurred_at, organization_id, source_app, resource_id,
                  correlation_id, payload FROM commercial.outbox_events WHERE event_id = $1`,
          [event!.event_id],
        )
      ).rows;
      await consumer!.handle(
        {
          eventId: ev.event_id,
          type: ev.type,
          version: ev.version,
          occurredAt: ev.occurred_at,
          organizationId: ev.organization_id,
          sourceApp: ev.source_app,
          resourceId: ev.resource_id,
          correlationId: ev.correlation_id,
          payload: ev.payload,
        },
        client,
      );
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await runPendingExecutions({ limit: 100 });
    expect(await executions(b.organizationId)).toHaveLength(1);
    expect(
      (
        await q(
          `SELECT count(*)::int AS n FROM notifications.notification WHERE organization_id = $1`,
          [b.organizationId],
        )
      )[0]!.n,
    ).toBe(3);

    // Founder's log shows it, with the business and the automation
    const log = await listExecutionsForFounder({
      founderHeaders: founderHeaders(),
      organizationId: b.organizationId,
    });
    expect(log).toEqual([
      expect.objectContaining({
        status: 'succeeded',
        messagesSent: 3,
        definitionId: quotaDefinitionId,
      }),
    ]);
    const defs = await listDefinitionsForFounder({ founderHeaders: founderHeaders() });
    expect(defs.find((d) => d.id === quotaDefinitionId)).toMatchObject({
      trigger: 'commercial.quota_threshold',
      steps: [{ kind: 'notification.hub', template: 'quota_limit' }],
    });
    const on = await listActivationsForFounder({
      founderHeaders: founderHeaders(),
      definitionId: quotaDefinitionId,
    });
    expect(on.find((a) => a.organizationId === b.organizationId)).toMatchObject({
      status: 'active',
      reason: 'Test de capăt la capăt',
      activatedByFounderId: founderId,
    });
  });

  it('a step not available yet fails the run; „Rulează din nou” is audited and runs it again', async () => {
    const b = await business({ 'workflows.active': 2, 'booking.appointments': 10 });
    await activateWorkflow({
      founderHeaders: founderHeaders(),
      organizationId: b.organizationId,
      definitionId: unavailableDefinitionId,
      reason: 'Test',
    });
    await consume(b.organizationId, 8);
    await dispatchCommercial(b.organizationId);
    await runPendingExecutions({ limit: 100 });
    const [run] = await executions(b.organizationId);
    expect(run).toMatchObject({
      status: 'failed',
      reason_code: 'step.unavailable',
      messages_sent: 0,
    });
    expect(run!.definition_version).toBe(2); // the version saved last (S116: from the next run)

    await retryExecution({
      founderHeaders: founderHeaders(),
      organizationId: b.organizationId,
      executionId: run!.id,
    });
    const [retried] = await auditRows(b.organizationId, 'workflows.execution_retried');
    expect(retried).toMatchObject({ actor_id: founderId, target_id: run!.id });
    await runPendingExecutions({ limit: 100 });
    expect((await executions(b.organizationId))[0]).toMatchObject({
      status: 'failed',
      attempts: 2,
    });
    // only a failed run runs again
    const ok = await business({ 'workflows.active': 2, 'booking.appointments': 10 });
    await expect(
      retryExecution({
        founderHeaders: founderHeaders(),
        organizationId: ok.organizationId,
        executionId: run!.id,
      }),
    ).rejects.toBeInstanceOf(Conflict);
  });

  it('a run of an automation stopped in the meantime is skipped, and nothing is sent', async () => {
    const b = await business({ 'workflows.active': 2, 'booking.appointments': 10 });
    await activateWorkflow({
      founderHeaders: founderHeaders(),
      organizationId: b.organizationId,
      definitionId: quotaDefinitionId,
      reason: 'Test',
    });
    await consume(b.organizationId, 8);
    await dispatchCommercial(b.organizationId);
    await stopWorkflow({
      founderHeaders: founderHeaders(),
      organizationId: b.organizationId,
      definitionId: quotaDefinitionId,
      reason: 'Oprită înainte de execuție',
    });
    await runPendingExecutions({ limit: 100 });
    expect(await executions(b.organizationId)).toEqual([
      expect.objectContaining({
        status: 'skipped',
        reason_code: 'automation_stopped',
        messages_sent: 0,
      }),
    ]);
    expect(
      await q(`SELECT 1 FROM notifications.notification WHERE organization_id = $1`, [
        b.organizationId,
      ]),
    ).toEqual([]);
  });

  it('the central stop: runs are skipped („engine_paused”) and audited; resumed, the engine goes on', async () => {
    const b = await business({ 'workflows.active': 2, 'booking.appointments': 10 });
    await activateWorkflow({
      founderHeaders: founderHeaders(),
      organizationId: b.organizationId,
      definitionId: quotaDefinitionId,
      reason: 'Test',
    });
    await setEnginePaused({
      founderHeaders: founderHeaders(),
      paused: true,
      reason: 'Incident e-mail',
    });
    try {
      await consume(b.organizationId, 8);
      await dispatchCommercial(b.organizationId);
      await runPendingExecutions({ limit: 100 });
      expect(await executions(b.organizationId)).toEqual([
        expect.objectContaining({
          status: 'skipped',
          reason_code: 'engine_paused',
          messages_sent: 0,
        }),
      ]);
    } finally {
      await setEnginePaused({ founderHeaders: founderHeaders(), paused: false });
    }
    const rows = await q(
      `SELECT action, metadata FROM audit.audit_log
        WHERE action IN ('workflows.engine_paused', 'workflows.engine_resumed') AND founder_id = $1
        ORDER BY created_at`,
      [founderId],
    );
    expect(rows.map((r) => r.action).slice(-2)).toEqual([
      'workflows.engine_paused',
      'workflows.engine_resumed',
    ]);
    // a central stop needs its reason
    await expect(
      setEnginePaused({ founderHeaders: founderHeaders(), paused: true }),
    ).rejects.toBeInstanceOf(InvalidInput);
  });
});
