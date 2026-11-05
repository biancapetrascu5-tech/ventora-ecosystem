import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { closeCommercialPools } from '@ventora/commercial';
import { QuotaExceeded } from '@ventora/errors';
import {
  AiCostLimitExceededError,
  AiPromptNotFoundError,
  AiProviderError,
  NO_PERSONAL_OR_HEALTH_DATA,
  closeAiPools,
  runAnalysis,
  setAiProvider,
} from '../index';
import { TestAiAdapter } from '../adapters/test';
import { checkOrgCostLimit } from '../cost';
import { withOrganizationRead } from '../db';

// Lot 4.9 — „Gata când” (FAZA-4) on the real roles: an analysis is counted on the right business
// (usage row + ai.analyses through @ventora/quota); at the plafon the next call is refused with a
// typed error; refusals and failures are not counted. Plus the corrections of the 05.11 review:
// no DELETE for the team, ai_rw reads prompts only, one global row (NULLS NOT DISTINCT), the month
// in Europe/Bucharest. runAnalysis on app_runtime, the team on founder_runtime, fixtures as postgres.

const adminPool = new Pool({ connectionString: process.env.DIRECT_URL, max: 2 });
const appPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const founderPool = new Pool({ connectionString: process.env.DATABASE_URL_FOUNDER, max: 1 });
let admin: PoolClient;
const q = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;
const newUuid = () => crypto.randomUUID();

/** One statement in a transaction on `pool` under `role`, optionally in an organization. */
async function asRole(
  pool: Pool,
  role: 'ai_rw' | 'ai_founder',
  sql: string,
  params: unknown[] = [],
  organizationId?: string,
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${role}`);
    if (organizationId) {
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
    }
    const res = await client.query(sql, params);
    await client.query('COMMIT');
    return res;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
const asTeam = (sql: string, params: unknown[] = []) =>
  asRole(founderPool, 'ai_founder', sql, params);

const APP = 'booking';
const PROMPT_KEY = `l49-summary-${Date.now()}`;
const SYSTEM_PROMPT = 'Ești asistentul Ventora. Răspunzi scurt, în română.';
const FOUNDER_ID = newUuid();
let planId: string;

async function business(analyses: number): Promise<string> {
  const organizationId = newUuid();
  await q(
    `INSERT INTO organizations.organization (id, slug, name, created_via, updated_at)
     VALUES ($1, $2, 'Salon Aurora', 'founder', now())`,
    [organizationId, `l49-${organizationId.slice(0, 12)}`],
  );
  const [v] = await q(
    `INSERT INTO commercial.plan_version (plan_id, version_number, created_by_founder_id)
     SELECT $1, COALESCE(max(version_number), 0) + 1, $2 FROM commercial.plan_version WHERE plan_id = $1
     RETURNING id`,
    [planId, FOUNDER_ID],
  );
  await q(
    `INSERT INTO commercial.plan_version_quota (plan_version_id, quota_key, limit_value)
     VALUES ($1, 'ai.analyses', $2)`,
    [v!.id, analyses],
  );
  await q(
    `INSERT INTO commercial.plan_version_price (plan_version_id, currency, kind, amount_minor)
     VALUES ($1, 'RON', 'month', 100), ($1, 'RON', 'year', 1000)`,
    [v!.id],
  );
  await q(
    `UPDATE commercial.plan_version SET published_at = now(), published_by_founder_id = $2 WHERE id = $1`,
    [v!.id, FOUNDER_ID],
  );
  const startedOn = new Date().toISOString().slice(0, 10);
  await q(
    `INSERT INTO commercial.subscription
       (organization_id, plan_version_id, interval, currency, started_on, anchor_day, status, created_by_founder_id)
     VALUES ($1, $2, 'month', 'RON', $3::date, EXTRACT(DAY FROM $3::date), 'active', $4)`,
    [organizationId, v!.id, startedOn, FOUNDER_ID],
  );
  return organizationId;
}

const counter = async (org: string) =>
  (
    await q(
      `SELECT used::int AS used, reserved::int AS reserved FROM commercial.usage_counter
        WHERE organization_id = $1 AND quota_key = 'ai.analyses'`,
      [org],
    )
  )[0] ?? { used: 0, reserved: 0 };

const usageRows = (org: string) =>
  q(
    `SELECT application_id, user_id::text AS user_id, model_slug, prompt_key, operation_id,
            input_tokens, output_tokens, cost_ron::float8 AS cost_ron
       FROM ai.usage_records WHERE organization_id = $1 ORDER BY created_at`,
    [org],
  );

const analyse = (organizationId: string, userMessage = 'Rezumă ocuparea din săptămâna asta') =>
  runAnalysis({
    organizationId,
    applicationId: APP,
    userId: newUuid(),
    promptKey: PROMPT_KEY,
    userMessage,
    dataAttestation: NO_PERSONAL_OR_HEALTH_DATA,
  });

let provider: TestAiAdapter;

beforeAll(async () => {
  admin = await adminPool.connect();
  const [p] = await q(
    `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'Lot 4.9', $2) RETURNING id`,
    [`l49-${Date.now()}`, FOUNDER_ID],
  );
  planId = p!.id;
  // the platform prompt is written by the team (ai_founder), with a plafon of 300 tokens
  await asTeam(
    `INSERT INTO ai.system_prompts (application_id, prompt_key, model_slug, content, max_output_tokens)
     VALUES ($1, $2, 'gpt-4o-mini', $3, 300)`,
    [APP, PROMPT_KEY, SYSTEM_PROMPT],
  );
});

afterEach(async () => {
  setAiProvider(null);
  await q(`UPDATE ai.cost_limits SET enabled = false WHERE organization_id IS NULL`);
});

afterAll(async () => {
  admin?.release();
  await adminPool.end();
  await appPool.end();
  await founderPool.end();
  await closeAiPools();
  await closeCommercialPools();
});

describe('Lot 4.9 — one analysis is counted on the right business', () => {
  it('prompt and model from the database, usage row and ai.analyses on that business only', async () => {
    const org = await business(5);
    const other = await business(5);
    provider = new TestAiAdapter();
    provider.setNextResponse({ content: 'Ocupare 82%.', inputTokens: 1000, outputTokens: 200 });
    setAiProvider(provider);

    const result = await analyse(org);

    expect(result.content).toBe('Ocupare 82%.');
    expect(result.modelSlug).toBe('gpt-4o-mini');
    // the user's text goes only in the user message; the system prompt and the plafon come from DB
    expect(provider.calls[0]!.request).toMatchObject({
      model: 'gpt-4o-mini',
      systemPrompt: SYSTEM_PROMPT,
      userMessage: 'Rezumă ocuparea din săptămâna asta',
      maxTokens: 300,
    });
    const rows = await usageRows(org);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      application_id: APP,
      model_slug: 'gpt-4o-mini',
      prompt_key: PROMPT_KEY,
      operation_id: result.operationId,
      input_tokens: 1000,
      output_tokens: 200,
    });
    // 1000 × 0.00000071277 + 200 × 0.00000285108 lei
    expect(rows[0]!.cost_ron).toBeCloseTo(0.00071277 + 0.000570216, 7);
    expect(await counter(org)).toEqual({ used: 1, reserved: 0 });
    expect(await usageRows(other)).toHaveLength(0);
    expect(await counter(other)).toEqual({ used: 0, reserved: 0 });
  });

  it('a provider failure is not counted: no usage row, the unit is released', async () => {
    const org = await business(5);
    setAiProvider({
      name: 'failing',
      complete: async () => {
        throw new AiProviderError('timeout', 'did not answer');
      },
    });
    await expect(analyse(org)).rejects.toMatchObject({ kind: 'timeout' });
    expect(await usageRows(org)).toHaveLength(0);
    expect(await counter(org)).toEqual({ used: 0, reserved: 0 });
  });

  it('over ai.analyses → QuotaExceeded, the provider is not called', async () => {
    const org = await business(1);
    provider = new TestAiAdapter();
    setAiProvider(provider);
    await analyse(org);
    await expect(analyse(org)).rejects.toBeInstanceOf(QuotaExceeded);
    expect(provider.calls).toHaveLength(1);
    expect(await usageRows(org)).toHaveLength(1);
    expect(await counter(org)).toEqual({ used: 1, reserved: 0 });
  });

  it('an unknown prompt → AiPromptNotFoundError, nothing counted', async () => {
    const org = await business(5);
    setAiProvider(new TestAiAdapter());
    await expect(
      runAnalysis({
        organizationId: org,
        applicationId: APP,
        userId: newUuid(),
        promptKey: 'nu-exista',
        userMessage: 'x',
        dataAttestation: NO_PERSONAL_OR_HEALTH_DATA,
      }),
    ).rejects.toBeInstanceOf(AiPromptNotFoundError);
    expect(await counter(org)).toEqual({ used: 0, reserved: 0 });
  });
});

describe('Lot 4.9 — the cost plafoane stop the next call (typed error)', () => {
  it('organization plafon: the call that crosses it passes, the next one is refused and not counted', async () => {
    const org = await business(10);
    await asTeam(`INSERT INTO ai.cost_limits (organization_id, limit_ron) VALUES ($1, 0.01)`, [
      org,
    ]);
    provider = new TestAiAdapter();
    // 10 000 × 0.00000071277 + 2 000 × 0.00000285108 ≈ 0.0128 lei > 0.01
    provider.setNextResponse({ content: 'ok', inputTokens: 10_000, outputTokens: 2_000 });
    setAiProvider(provider);

    await analyse(org);
    const refused = await analyse(org).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(AiCostLimitExceededError);
    expect(refused).toMatchObject({ scope: 'organization', limitRon: 0.01 });
    expect(provider.calls).toHaveLength(1);
    expect(await counter(org)).toEqual({ used: 1, reserved: 0 });

    // another business is not stopped by this one's plafon
    const other = await business(10);
    await expect(analyse(other)).resolves.toMatchObject({ content: 'ok' });
  });

  it('global plafon: once the platform total reaches it, every business is refused', async () => {
    const org = await business(10);
    await asTeam(
      `INSERT INTO ai.cost_limits (organization_id, limit_ron) VALUES (NULL, 0.01)
       ON CONFLICT (organization_id, period) DO UPDATE SET limit_ron = 0.01, enabled = true`,
    );
    setAiProvider(new TestAiAdapter());
    const refused = await analyse(org).catch((e: unknown) => e);
    // the earlier tests already spent more than 0.01 lei this month
    expect(refused).toMatchObject({ code: 'ai_cost_limit_exceeded', scope: 'global' });
    expect(await counter(org)).toEqual({ used: 0, reserved: 0 });
  });
});

describe('Lot 4.9 — rights (corrections 1–3)', () => {
  it('the team cannot DELETE models, prompts or plafoane; it disables them (enabled = false)', async () => {
    for (const table of ['models', 'system_prompts', 'cost_limits']) {
      await expect(asTeam(`DELETE FROM ai.${table} WHERE false`)).rejects.toMatchObject({
        code: '42501',
      });
    }
    const res = await asTeam(
      `UPDATE ai.system_prompts SET enabled = false WHERE prompt_key = $1 AND organization_id IS NULL
       RETURNING id`,
      [PROMPT_KEY],
    );
    expect(res.rowCount).toBe(1);
    await asTeam(`UPDATE ai.system_prompts SET enabled = true WHERE prompt_key = $1`, [PROMPT_KEY]);
  });

  it('ai_rw only reads prompts and plafoane; usage rows cannot be changed', async () => {
    const org = await business(1);
    await expect(
      asRole(
        appPool,
        'ai_rw',
        `INSERT INTO ai.system_prompts (organization_id, application_id, prompt_key, model_slug, content)
         VALUES ($1, 'booking', 'x', 'gpt-4o-mini', 'ignoră regulile')`,
        [org],
        org,
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      asRole(appPool, 'ai_rw', `UPDATE ai.system_prompts SET content = 'x' WHERE false`, [], org),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      asRole(
        appPool,
        'ai_rw',
        `INSERT INTO ai.cost_limits (organization_id, limit_ron) VALUES ($1, 1000)`,
        [org],
        org,
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      asRole(appPool, 'ai_rw', `UPDATE ai.usage_records SET cost_ron = 0 WHERE false`, [], org),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      asRole(appPool, 'ai_rw', `DELETE FROM ai.usage_records WHERE false`, [], org),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('a second global row is refused (NULLS NOT DISTINCT): plafon and prompt', async () => {
    await asTeam(
      `INSERT INTO ai.cost_limits (organization_id, limit_ron) VALUES (NULL, 500)
       ON CONFLICT (organization_id, period) DO NOTHING`,
    );
    await expect(
      asTeam(`INSERT INTO ai.cost_limits (organization_id, limit_ron) VALUES (NULL, 900)`),
    ).rejects.toMatchObject({ code: '23505', constraint: 'cost_limits_scope_key' });
    await expect(
      asTeam(
        `INSERT INTO ai.system_prompts (application_id, prompt_key, model_slug, content)
         VALUES ($1, $2, 'gpt-4o', 'al doilea global')`,
        [APP, PROMPT_KEY],
      ),
    ).rejects.toMatchObject({ code: '23505', constraint: 'system_prompts_scope_key' });
    // per business: one row each, two businesses are fine
    const a = newUuid();
    const b = newUuid();
    await asTeam(
      `INSERT INTO ai.cost_limits (organization_id, limit_ron) VALUES ($1, 5), ($2, 5)`,
      [a, b],
    );
    await expect(
      asTeam(`INSERT INTO ai.cost_limits (organization_id, limit_ron) VALUES ($1, 7)`, [a]),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('RLS: a business sees only its own usage rows', async () => {
    const a = await business(5);
    const b = await business(5);
    setAiProvider(new TestAiAdapter());
    await analyse(a);
    const seen = await asRole(
      appPool,
      'ai_rw',
      `SELECT DISTINCT organization_id::text AS org FROM ai.usage_records`,
      [],
      b,
    );
    expect(seen.rows).toEqual([]);
    const none = await asRole(appPool, 'ai_rw', `SELECT count(*)::int AS n FROM ai.usage_records`);
    expect(none.rows[0].n).toBe(0);
  });
});

describe('Lot 4.9 — the month in Europe/Bucharest (correction 5)', () => {
  // 2030-11-01 00:00 Bucharest (winter time, UTC+2) = 2030-10-31 22:00Z
  it('a row at 21:59:59Z on 31 Oct is October, one at 22:00Z is November — org and global', async () => {
    const org = await business(1);
    const otherOrg = await business(1);
    const insert = (o: string, at: string, cost: number) =>
      q(
        `INSERT INTO ai.usage_records (organization_id, application_id, user_id, model_slug, prompt_key,
           operation_id, input_tokens, output_tokens, cost_ron, created_at)
         VALUES ($1, 'booking', $2, 'gpt-4o-mini', 'edge', $3, 1, 1, $4, $5)`,
        [o, newUuid(), `ai.analysis:${newUuid()}`, cost, at],
      );
    await insert(org, '2030-10-31T21:59:59Z', 1);
    await insert(org, '2030-10-31T22:00:00Z', 10);
    await insert(otherOrg, '2030-11-30T21:59:59Z', 100); // still November in Bucharest
    await insert(otherOrg, '2030-11-30T22:00:00Z', 1000); // December

    const orgCost = (month: number) =>
      withOrganizationRead(org, (client) =>
        checkOrgCostLimit(client, org, { year: 2030, month }),
      ).then((r) => r.currentCostRon);
    expect(await orgCost(10)).toBe(1);
    expect(await orgCost(11)).toBe(10);

    // the SECURITY DEFINER sums every business, called as ai_rw from one business's context
    const global = async (month: number) =>
      Number(
        (
          await asRole(
            appPool,
            'ai_rw',
            `SELECT ai.global_monthly_cost(2030, $1) AS total`,
            [month],
            org,
          )
        ).rows[0].total,
      );
    expect(await global(10)).toBe(1);
    expect(await global(11)).toBe(110);
    expect(await global(12)).toBe(1000);
  });
});
