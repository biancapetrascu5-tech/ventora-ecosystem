import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import {
  closeAuditPools,
  readAuditLogAsFounder,
  readOrganizationAuditLog,
  runWithRequestContext,
  writeAuditEvent,
} from '../index';
import type { AuditEvent } from '../index';

const APP_URL = process.env.DATABASE_URL ?? '';
const FOUNDER_URL = process.env.DATABASE_URL_FOUNDER ?? '';
const ADMIN_URL = process.env.DIRECT_URL ?? '';
if (!APP_URL || !FOUNDER_URL || !ADMIN_URL) {
  throw new Error(
    'DATABASE_URL_TEST, DATABASE_URL_FOUNDER_TEST and DATABASE_URL_ADMIN_TEST are required',
  );
}

let adminPool: Pool;
let appPool: Pool;
let founderPool: Pool;

beforeAll(() => {
  adminPool = new Pool({ connectionString: ADMIN_URL, max: 2 });
  appPool = new Pool({ connectionString: APP_URL, max: 2 });
  founderPool = new Pool({ connectionString: FOUNDER_URL, max: 2 });
});

afterAll(async () => {
  await closeAuditPools();
  await Promise.all([adminPool.end(), appPool.end(), founderPool.end()]);
});

function event(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    category: 'identity',
    action: 'auth.login_succeeded',
    outcome: 'success',
    actorType: 'user',
    actorId: crypto.randomUUID(),
    ...overrides,
  };
}

async function adminRow(id: string) {
  const { rows } = await adminPool.query(
    `SELECT *, host(ip) AS ip_text FROM audit.audit_log WHERE id = $1::uuid`,
    [id],
  );
  return rows[0];
}

/** Runs `fn` on one connection of `pool` inside BEGIN … ROLLBACK. */
async function inTx<T>(pool: Pool, fn: (q: Pool['query']) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    return await fn(client.query.bind(client) as Pool['query']);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
}

describe('TA.1 — append_event writes the row, created_at comes from the DB', () => {
  it('writes every column and stamps created_at with the database clock', async () => {
    const { rows: before } = await adminPool.query('SELECT clock_timestamp() AS t');
    const orgId = crypto.randomUUID();
    const id = await writeAuditEvent(
      event({
        organizationId: orgId,
        targetType: 'user',
        targetId: 'target-1',
        metadata: { scope: 'one', createdAt: '1999-01-01T00:00:00Z' },
      }),
      { mode: 'required' },
    );
    const { rows: after } = await adminPool.query('SELECT clock_timestamp() AS t');

    const row = await adminRow(id!);
    expect(row.category).toBe('identity');
    expect(row.action).toBe('auth.login_succeeded');
    expect(row.outcome).toBe('success');
    expect(row.actor_type).toBe('user');
    expect(row.organization_id).toBe(orgId);
    expect(row.target_type).toBe('user');
    expect(row.target_id).toBe('target-1');
    // a timestamp in metadata never becomes created_at
    expect(row.created_at.getTime()).toBeGreaterThanOrEqual(before[0].t.getTime());
    expect(row.created_at.getTime()).toBeLessThanOrEqual(after[0].t.getTime());
  });

  it('the writer cannot pass created_at: append_event has no such parameter', async () => {
    const { rows } = await adminPool.query(
      `SELECT pg_get_function_identity_arguments('audit.append_event'::regproc) AS args`,
    );
    expect(rows[0].args).not.toMatch(/created_at/);
  });
});

describe('TA.2 / TA.3 — app_runtime cannot UPDATE or DELETE', () => {
  let rowId: string;
  beforeAll(async () => {
    rowId = (await writeAuditEvent(event(), { mode: 'required' }))!;
  });

  for (const role of [null, 'audit_writer', 'audit_org_reader']) {
    it(`UPDATE as app_runtime${role ? ` → ${role}` : ''} → permission denied`, async () => {
      await expect(
        inTx(appPool, async (q) => {
          if (role) await q(`SET LOCAL ROLE ${role}`);
          await q(`UPDATE audit.audit_log SET outcome = 'failure' WHERE id = $1::uuid`, [rowId]);
        }),
      ).rejects.toThrow(/permission denied/i);
    });

    it(`DELETE as app_runtime${role ? ` → ${role}` : ''} → permission denied`, async () => {
      await expect(
        inTx(appPool, async (q) => {
          if (role) await q(`SET LOCAL ROLE ${role}`);
          await q(`DELETE FROM audit.audit_log WHERE id = $1::uuid`, [rowId]);
        }),
      ).rejects.toThrow(/permission denied/i);
    });
  }

  it('founder_runtime → audit_founder_reader: UPDATE / DELETE → permission denied', async () => {
    for (const sql of [
      `UPDATE audit.audit_log SET outcome = 'failure' WHERE id = $1::uuid`,
      `DELETE FROM audit.audit_log WHERE id = $1::uuid`,
    ]) {
      await expect(
        inTx(founderPool, async (q) => {
          await q('SET LOCAL ROLE audit_founder_reader');
          await q(sql, [rowId]);
        }),
      ).rejects.toThrow(/permission denied/i);
    }
  });
});

describe('TA.4 / TA.5 — immutability trigger also blocks postgres', () => {
  let rowId: string;
  beforeAll(async () => {
    rowId = (await writeAuditEvent(event(), { mode: 'required' }))!;
  });

  it('postgres UPDATE → trigger exception', async () => {
    await expect(
      adminPool.query(`UPDATE audit.audit_log SET outcome = 'failure' WHERE id = $1::uuid`, [
        rowId,
      ]),
    ).rejects.toThrow(/audit_log_immutable: UPDATE/);
  });

  it('postgres DELETE → trigger exception', async () => {
    await expect(
      adminPool.query(`DELETE FROM audit.audit_log WHERE id = $1::uuid`, [rowId]),
    ).rejects.toThrow(/audit_log_immutable: DELETE/);
  });

  it('postgres TRUNCATE → trigger exception', async () => {
    await expect(adminPool.query('TRUNCATE audit.audit_log')).rejects.toThrow(
      /audit_log_immutable: TRUNCATE/,
    );
  });

  it('row is unchanged afterwards', async () => {
    const row = await adminRow(rowId);
    expect(row.outcome).toBe('success');
  });
});

describe('TA.6 — no direct INSERT, only through the function', () => {
  const insertSql = `INSERT INTO audit.audit_log (category, action, outcome, actor_type)
                     VALUES ('identity', 'auth.login_succeeded', 'success', 'user')`;

  it('app_runtime without role → permission denied', async () => {
    await expect(inTx(appPool, (q) => q(insertSql))).rejects.toThrow(/permission denied/i);
  });

  it('app_runtime → audit_writer → INSERT permission denied', async () => {
    await expect(
      inTx(appPool, async (q) => {
        await q('SET LOCAL ROLE audit_writer');
        await q(insertSql);
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('audit_writer cannot read the log', async () => {
    await expect(
      inTx(appPool, async (q) => {
        await q('SET LOCAL ROLE audit_writer');
        await q('SELECT 1 FROM audit.audit_log LIMIT 1');
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('PUBLIC has no EXECUTE on append_event; only audit_writer has', async () => {
    const { rows } = await adminPool.query(
      `SELECT r.rolname, has_function_privilege(r.rolname, 'audit.append_event(text,text,text,text,text,text,uuid,uuid,text,text,inet,text,text,jsonb)', 'EXECUTE') AS can
         FROM pg_roles r
        WHERE r.rolname IN ('audit_writer', 'audit_org_reader', 'audit_founder_reader', 'app_runtime', 'founder_runtime')`,
    );
    const can = Object.fromEntries(rows.map((r) => [r.rolname, r.can]));
    expect(can.audit_writer).toBe(true);
    expect(can.audit_org_reader).toBe(false);
    expect(can.audit_founder_reader).toBe(false);
    // NOINHERIT login roles: no privilege until SET ROLE audit_writer
    expect(can.app_runtime).toBe(false);
    expect(can.founder_runtime).toBe(false);
  });
});

describe('TA.7 — RLS: an organization reads only its own rows', () => {
  const orgA = crypto.randomUUID();
  const orgB = crypto.randomUUID();
  const marker = crypto.randomUUID();
  let ids: { a: string; b: string; none: string };

  beforeAll(async () => {
    const md = { marker };
    ids = {
      a: (await writeAuditEvent(event({ organizationId: orgA, metadata: md }), {
        mode: 'required',
      }))!,
      b: (await writeAuditEvent(event({ organizationId: orgB, metadata: md }), {
        mode: 'required',
      }))!,
      none: (await writeAuditEvent(event({ metadata: md }), { mode: 'required' }))!,
    };
  });

  async function visibleIds(orgSetting: string | null): Promise<string[]> {
    return inTx(appPool, async (q) => {
      await q('SET LOCAL ROLE audit_org_reader');
      if (orgSetting !== null)
        await q(`SELECT set_config('app.organization_id', $1, true)`, [orgSetting]);
      const { rows } = await q(
        `SELECT id::text AS id FROM audit.audit_log WHERE metadata->>'marker' = $1`,
        [marker],
      );
      return rows.map((r: { id: string }) => r.id);
    });
  }

  it('org A sees only org A (even without a WHERE on organization_id)', async () => {
    expect(await visibleIds(orgA)).toEqual([ids.a]);
  });

  it('no app.organization_id → 0 rows (fail-safe)', async () => {
    expect(await visibleIds(null)).toEqual([]);
    expect(await visibleIds('')).toEqual([]);
  });

  it('rows with organization_id NULL are invisible to organizations', async () => {
    expect(await visibleIds(orgB)).toEqual([ids.b]);
    expect(await visibleIds(orgA)).not.toContain(ids.none);
  });

  it('readOrganizationAuditLog(orgA) returns only org A rows', async () => {
    const entries = await readOrganizationAuditLog(orgA);
    expect(entries.map((e) => e.id)).toEqual([ids.a]);
    expect(entries[0]!.organizationId).toBe(orgA);
  });
});

describe('TA.8 — Founder reads everything; app_runtime cannot become audit_founder_reader', () => {
  const orgA = crypto.randomUUID();
  const marker = crypto.randomUUID();
  let ids: string[];

  beforeAll(async () => {
    ids = [
      (await writeAuditEvent(event({ organizationId: orgA, metadata: { marker } }), {
        mode: 'required',
      }))!,
      (await writeAuditEvent(event({ metadata: { marker } }), { mode: 'required' }))!,
    ];
  });

  it('founder_runtime → audit_founder_reader sees rows of any org and with org NULL', async () => {
    const seen = await inTx(founderPool, async (q) => {
      await q('SET LOCAL ROLE audit_founder_reader');
      const { rows } = await q(
        `SELECT id::text AS id FROM audit.audit_log WHERE metadata->>'marker' = $1`,
        [marker],
      );
      return rows.map((r: { id: string }) => r.id).sort();
    });
    expect(seen).toEqual([...ids].sort());
  });

  it('app_runtime → SET ROLE audit_founder_reader → refused', async () => {
    await expect(inTx(appPool, (q) => q('SET LOCAL ROLE audit_founder_reader'))).rejects.toThrow(
      /permission denied to set role/i,
    );
  });

  it('founder_runtime cannot become audit_org_reader (no cross-grant)', async () => {
    await expect(inTx(founderPool, (q) => q('SET LOCAL ROLE audit_org_reader'))).rejects.toThrow(
      /permission denied to set role/i,
    );
  });

  it('readAuditLogAsFounder returns all matching rows and writes E33 in the same transaction', async () => {
    const founderId = crypto.randomUUID();
    const entries = await readAuditLogAsFounder(founderId, { organizationId: orgA });
    expect(entries.map((e) => e.id)).toContain(ids[0]);

    const { rows } = await adminPool.query(
      `SELECT * FROM audit.audit_log WHERE action = 'founder.audit_viewed' AND founder_id = $1`,
      [founderId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe('founder');
    expect(rows[0].actor_type).toBe('founder');
    expect(rows[0].actor_id).toBe(founderId);
    expect(rows[0].organization_id).toBe(orgA);
    expect(rows[0].metadata.resultCount).toBe(entries.length);
  });
});

describe('TA.10 — forbidden keys never reach the stored metadata', () => {
  it('password / token / code / secret / backupCodes are dropped before the write', async () => {
    const id = await writeAuditEvent(
      event({
        metadata: {
          password: 'P@ss',
          token: 'tok',
          code: '123456',
          secret: 'JBSWY3DP',
          backupCodes: ['aaaa-bbbb'],
          nested: { token: 'inner', keep: 'yes' },
          method: 'totp',
        },
      }),
      { mode: 'required' },
    );
    const row = await adminRow(id!);
    expect(row.metadata).toEqual({ nested: { keep: 'yes' }, method: 'totp' });
  });
});

describe('TA.11 — invalid input rejected by the database', () => {
  it('metadata > 8 KB → rejected', async () => {
    await expect(
      writeAuditEvent(event({ metadata: { blob: 'x'.repeat(9000) } }), { mode: 'required' }),
    ).rejects.toThrow(/exceeds 8192 bytes/);
  });

  it('invalid category → CHECK violation', async () => {
    await expect(
      writeAuditEvent(event({ category: 'billing' as never }), { mode: 'required' }),
    ).rejects.toThrow(/audit_log_category_check/);
  });

  it('invalid outcome → CHECK violation', async () => {
    await expect(
      writeAuditEvent(event({ outcome: 'maybe' as never }), { mode: 'required' }),
    ).rejects.toThrow(/audit_log_outcome_check/);
  });

  it('invalid actor_type → CHECK violation', async () => {
    await expect(
      writeAuditEvent(event({ actorType: 'robot' as never }), { mode: 'required' }),
    ).rejects.toThrow(/audit_log_actor_type_check/);
  });

  it('malformed action → rejected', async () => {
    await expect(
      writeAuditEvent(event({ action: 'DROP TABLE' }), { mode: 'required' }),
    ).rejects.toThrow(/invalid action/);
  });

  it('best_effort never throws on the same invalid input (returns null)', async () => {
    const original = console.error;
    console.error = () => {};
    try {
      await expect(
        writeAuditEvent(event({ outcome: 'maybe' as never }), { mode: 'best_effort' }),
      ).resolves.toBeNull();
    } finally {
      console.error = original;
    }
  });
});

describe('TA.14 — ip, user agent and request id come from the request context', () => {
  it('inside runWithRequestContext → stored on the row', async () => {
    const requestId = `req-${crypto.randomUUID()}`;
    const id = await runWithRequestContext(
      { ip: '203.0.113.9, 10.0.0.1', userAgent: 'Vitest/5 (audit)', requestId },
      () => writeAuditEvent(event(), { mode: 'required' }),
    );
    const row = await adminRow(id!);
    expect(row.ip_text).toBe('203.0.113.9');
    expect(row.user_agent).toBe('Vitest/5 (audit)');
    expect(row.request_id).toBe(requestId);
  });

  it('without a context → NULL', async () => {
    const id = await writeAuditEvent(event(), { mode: 'required' });
    const row = await adminRow(id!);
    expect(row.ip).toBeNull();
    expect(row.user_agent).toBeNull();
    expect(row.request_id).toBeNull();
  });

  it('user agent longer than 512 characters is truncated, not rejected', async () => {
    const id = await runWithRequestContext({ userAgent: 'u'.repeat(600) }, () =>
      writeAuditEvent(event(), { mode: 'required' }),
    );
    const row = await adminRow(id!);
    expect(row.user_agent).toHaveLength(512);
  });
});
