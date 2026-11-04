/**
 * seed-workflows.ts — Lot 4.10 (D4-24)
 *
 * Creates the six v1 automations (V1_AUTOMATIONS, as drawn in FounderAutomations) in schema
 * `workflows`, idempotently: an automation whose code exists is left as it is (it changes only
 * from the builder, as new versions). Each one created gets its audit row on the Founder given
 * by FOUNDER_EMAIL (category founder, workflows.definition_saved), in the same transaction.
 * Nothing is started for any business: starting is done from Founder, with a reason.
 *
 * Decision of 04.11.2026 (variant A, no new GRANT): on Supabase `postgres` cannot SET ROLE
 * audit_writer, so the script writes as a Founder write does —
 *   - DIRECT_URL (read only): the Founder's id from founder_identity.users (founder_runtime has
 *     no right on that schema);
 *   - DATABASE_URL_FOUNDER: founder_runtime, SET LOCAL ROLE workflows_founder for the
 *     definitions, and the audit row through appendAuditEventInTx (audit_writer).
 *
 * Run after `prisma migrate deploy` of core/workflows. On staging only from an up-to-date `main`,
 * with an approved plan (CLAUDE.md, rule 11).
 *
 *   DIRECT_URL=… DATABASE_URL_FOUNDER=… FOUNDER_EMAIL=… pnpm tsx scripts/seed-workflows.ts [--expect-noop]
 */

import { Pool } from 'pg';
import { AuditActions, appendAuditEventInTx, pgExecutor } from '../core/audit/src/index.js';
import { V1_AUTOMATIONS, validateDefinition } from '../core/workflows/src/whitelist.js';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

/** The Founder's id, read only, as the owner of the database (DIRECT_URL). */
async function founderIdOf(email: string): Promise<string> {
  const pool = new Pool({ connectionString: required('DIRECT_URL'), max: 1 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM founder_identity.users WHERE lower(email) = $1`,
      [email],
    );
    if (!rows[0]) throw new Error(`No Founder with the e-mail ${email}`);
    return rows[0].id;
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    await pool.end();
  }
}

async function main() {
  const email = required('FOUNDER_EMAIL').toLowerCase();
  const expectNoop = process.argv.includes('--expect-noop');
  const founderId = await founderIdOf(email);

  const pool = new Pool({ connectionString: required('DATABASE_URL_FOUNDER'), max: 1 });
  const client = await pool.connect();
  const created: string[] = [];
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE workflows_founder');
    for (const a of V1_AUTOMATIONS) {
      const def = validateDefinition(a);
      const exists = await client.query(`SELECT 1 FROM workflows.definition WHERE code = $1`, [
        a.code,
      ]);
      if (exists.rows[0]) continue;
      const id = crypto.randomUUID();
      await client.query(
        `INSERT INTO workflows.definition (id, code, name, current_version, created_by_founder_id)
         VALUES ($1, $2, $3, 1, $4)`,
        [id, a.code, a.name, founderId],
      );
      await client.query(
        `INSERT INTO workflows.definition_version
           (definition_id, version, trigger_type, trigger_params, delay_minutes, conditions, steps,
            created_by_founder_id)
         VALUES ($1, 1, $2, $3::jsonb, $4, $5::text[], $6::jsonb, $7)`,
        [
          id,
          def.trigger,
          JSON.stringify(def.triggerParams),
          def.delayMinutes,
          def.conditions,
          JSON.stringify(def.steps),
          founderId,
        ],
      );
      // audit_writer for the row, then back to workflows_founder (as the Founder contracts)
      await appendAuditEventInTx(pgExecutor(client), {
        category: 'founder',
        action: AuditActions.workflowDefinitionSaved,
        outcome: 'success',
        actorType: 'founder',
        actorId: founderId,
        founderId,
        targetType: 'workflow_definition',
        targetId: id,
        metadata: {
          version: 1,
          trigger: def.trigger,
          steps: def.steps.map((s) => `${s.kind}:${s.template}`),
          seed: 'v1',
        },
      });
      created.push(a.code);
    }
    if (expectNoop && created.length > 0) {
      throw new Error(`--expect-noop: created ${created.join(', ')}`);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
  console.log(
    created.length
      ? `Workflows v1: created ${created.join(', ')}`
      : 'Workflows v1: nothing to create (all six exist)',
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
