import type { PoolClient } from 'pg';
import {
  AuditActions,
  appendAuditEventInTx,
  type AuditSqlExecutor,
  type AuditTargetType,
} from '@ventora/audit';
import { Conflict, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { requireFounderSession } from '@ventora/identity';
import { commitQuota, releaseQuota, reserveQuota } from '@ventora/quota';
import { withFounderListTx, withFounderTx } from './db';
import { WORKFLOWS_QUOTA_KEY, freeActivationQuota } from './engine';
import { validateDefinition, type DefinitionInput, type TriggerCode } from './whitelist';

/*
 * Lot 4.10 — Founder · Automatizări (D-WF-2): only the Ventora team builds an automation, starts
 * it and stops it for a business; the Hub only reads (D-WF-3; workflows_rw has no right to write
 * an activation, so a business is refused by the database too). Every contract: a Founder
 * session with 2FA, the checks on the server, then one transaction as workflows_founder on
 * founder_runtime with its audit row on the Founder (required).
 *
 * Starting holds one unit of the stock quota workflows.active (D-WF-4), in the steps of §8.3:
 * reserve (over the limit → QuotaExceeded, nothing written), write the activation and its audit,
 * commit; a failed write releases the unit, and a process stopped in between is settled by the
 * reconciliation (the activation exists → commit). Stopping frees the unit (freeStockQuota,
 * idempotent); a freeing that fails after the stop is retried by the engine's job.
 *
 * NECESITĂ DECIZIE (raportul 4.10): the quota calls run on app_runtime (DATABASE_URL, as every
 * quota operation in core/commercial), so Founder needs DATABASE_URL besides DATABASE_URL_FOUNDER.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE_RE = /^[a-z][a-z0-9-]{0,63}$/;

type FounderParams = { founderHeaders: Headers };

function uuid(field: string, value: string): string {
  if (!UUID_RE.test(value ?? '')) throw new InvalidInput(field);
  return value;
}

function text(field: string, value: string, max: number): string {
  const v = value?.trim();
  if (!v || v.length > max) throw new InvalidInput(field);
  return v;
}

function optionalText(field: string, value: string | null | undefined, max: number): string | null {
  const v = value?.trim();
  if (!v) return null;
  if (v.length > max) throw new InvalidInput(field);
  return v;
}

async function audit(
  exec: AuditSqlExecutor,
  founderId: string,
  event: {
    action: string;
    targetType: AuditTargetType;
    targetId: string;
    organizationId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await appendAuditEventInTx(exec, {
    category: 'founder',
    action: event.action,
    outcome: 'success',
    actorType: 'founder',
    actorId: founderId,
    founderId,
    organizationId: event.organizationId ?? null,
    targetType: event.targetType,
    targetId: event.targetId,
    metadata: event.metadata ?? {},
  });
}

/** Postgres refusals from the CHECKs and triggers, as the errors the screens know. */
function mapDbError(err: unknown, field: string): never {
  const e = err as { code?: string; message?: string };
  if (e.code === '23505') throw new Conflict(e.message ?? 'Already exists');
  if (e.code === '23514' || e.code === 'P0001') throw new InvalidInput(field, e.message);
  throw err;
}

// ── The builder ────────────────────────────────────────────────────────────────────────────

/**
 * „Salvează automatizarea”: a new automation (version 1) or a new version of one; the businesses
 * that have it on get the new version from their next run. Only the whitelist (S116-D19).
 */
export async function saveDefinition(
  params: FounderParams & DefinitionInput & { definitionId?: string; code?: string; name: string },
): Promise<{ definitionId: string; version: number }> {
  const founder = await requireFounderSession(params.founderHeaders);
  const name = text('name', params.name, 200);
  const def = validateDefinition(params);
  const existingId = params.definitionId ? uuid('definitionId', params.definitionId) : null;
  const code = existingId ? null : params.code?.trim();
  if (!existingId && (!code || !CODE_RE.test(code))) throw new InvalidInput('code');

  return withFounderTx(null, async (client, exec) => {
    let definitionId: string;
    let version: number;
    if (existingId) {
      const { rows } = await client.query<{ current_version: number }>(
        `UPDATE workflows.definition
            SET current_version = current_version + 1, name = $2, updated_at = now()
          WHERE id = $1 RETURNING current_version`,
        [existingId, name],
      );
      if (!rows[0]) throw new ResourceNotFound('Automation not found');
      definitionId = existingId;
      version = rows[0].current_version;
    } else {
      definitionId = crypto.randomUUID();
      version = 1;
      await client
        .query(
          `INSERT INTO workflows.definition (id, code, name, current_version, created_by_founder_id)
           VALUES ($1, $2, $3, 1, $4)`,
          [definitionId, code, name, founder.userId],
        )
        .catch((err) => mapDbError(err, 'code'));
    }
    await client
      .query(
        `INSERT INTO workflows.definition_version
           (definition_id, version, trigger_type, trigger_params, delay_minutes, conditions, steps,
            created_by_founder_id)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6::text[], $7::jsonb, $8)`,
        [
          definitionId,
          version,
          def.trigger,
          JSON.stringify(def.triggerParams),
          def.delayMinutes,
          def.conditions,
          JSON.stringify(def.steps),
          founder.userId,
        ],
      )
      .catch((err) => mapDbError(err, 'steps'));
    await audit(exec, founder.userId, {
      action: AuditActions.workflowDefinitionSaved,
      targetType: 'workflow_definition',
      targetId: definitionId,
      metadata: {
        version,
        trigger: def.trigger,
        steps: def.steps.map((s) => `${s.kind}:${s.template}`),
      },
    });
    return { definitionId, version };
  });
}

// ── Starting and stopping, per business ────────────────────────────────────────────────────

export const startOperationId = (activationId: string) => `workflows.start:${activationId}`;

/**
 * „Pornește…”: the Dialog's „Motiv” is required, the support reference optional; both go in the
 * business's log with the Founder's name. Over workflows.active → QuotaExceeded (nothing written).
 * Already on for the business → Conflict.
 */
export async function activateWorkflow(
  params: FounderParams & {
    organizationId: string;
    definitionId: string;
    reason: string;
    supportRef?: string | null;
  },
): Promise<{ activationId: string }> {
  const founder = await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  const definitionId = uuid('definitionId', params.definitionId);
  const reason = text('reason', params.reason, 2000);
  const supportRef = optionalText('supportRef', params.supportRef, 64);

  // checked before the unit is taken: an unknown automation or one already on takes nothing
  await withFounderTx(
    organizationId,
    async (client) => {
      const { rows } = await client.query(`SELECT 1 FROM workflows.definition WHERE id = $1`, [
        definitionId,
      ]);
      if (!rows[0]) throw new ResourceNotFound('Automation not found');
      const on = await client.query(
        `SELECT 1 FROM workflows.activation WHERE definition_id = $1 AND status = 'active'`,
        [definitionId],
      );
      if (on.rows[0]) throw new Conflict('The automation is already on for this business');
    },
    true,
  );

  const activationId = crypto.randomUUID();
  const operationId = startOperationId(activationId);
  const ctx = { organizationId };
  await reserveQuota(ctx, WORKFLOWS_QUOTA_KEY, 1, operationId);
  try {
    await withFounderTx(organizationId, async (client, exec) => {
      await client
        .query(
          `INSERT INTO workflows.activation
             (id, organization_id, definition_id, quota_operation_id, activated_by_founder_id,
              activation_reason, activation_support_ref)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            activationId,
            organizationId,
            definitionId,
            operationId,
            founder.userId,
            reason,
            supportRef,
          ],
        )
        .catch((err) => mapDbError(err, 'definitionId'));
      await audit(exec, founder.userId, {
        action: AuditActions.workflowActivated,
        targetType: 'workflow_activation',
        targetId: activationId,
        organizationId,
        metadata: { definitionId, reason, supportRef },
      });
    });
  } catch (err) {
    await releaseQuota(ctx, operationId).catch((releaseErr: unknown) => {
      console.error('[workflows] activateWorkflow: releasing the quota failed', {
        operationId,
        error: releaseErr instanceof Error ? releaseErr.message : String(releaseErr),
      });
    });
    throw err;
  }
  // the activation exists: a commit that fails here is done by the reconciliation (§8.3)
  await commitQuota(ctx, operationId).catch((err: unknown) => {
    console.error('[workflows] activateWorkflow: committing the quota failed', {
      operationId,
      error: err instanceof Error ? err.message : String(err),
    });
  });
  return { activationId };
}

/**
 * „Oprește…”: nothing more is sent from now; what was sent stays in the log. Runs already
 * pending are skipped („automation_stopped”). Frees the workflows.active unit.
 */
export async function stopWorkflow(
  params: FounderParams & {
    organizationId: string;
    definitionId: string;
    reason: string;
    supportRef?: string | null;
  },
): Promise<{ activationId: string }> {
  const founder = await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  const definitionId = uuid('definitionId', params.definitionId);
  const reason = text('reason', params.reason, 2000);
  const supportRef = optionalText('supportRef', params.supportRef, 64);

  const activationId = await withFounderTx(organizationId, async (client, exec) => {
    const { rows } = await client.query<{ id: string }>(
      `UPDATE workflows.activation
          SET status = 'stopped', stopped_by_founder_id = $2, stop_reason = $3,
              stop_support_ref = $4
        WHERE definition_id = $1 AND status = 'active'
        RETURNING id`,
      [definitionId, founder.userId, reason, supportRef],
    );
    if (!rows[0]) throw new Conflict('The automation is not on for this business');
    await audit(exec, founder.userId, {
      action: AuditActions.workflowStopped,
      targetType: 'workflow_activation',
      targetId: rows[0].id,
      organizationId,
      metadata: { definitionId, reason, supportRef },
    });
    return rows[0].id;
  });
  await freeActivationQuota(organizationId, activationId).catch((err: unknown) => {
    // the stop holds; the engine's job frees the unit later (unfreed_stopped_activations)
    console.error('[workflows] stopWorkflow: freeing the quota failed', {
      activationId,
      error: err instanceof Error ? err.message : String(err),
    });
  });
  return { activationId };
}

// ── The run log ────────────────────────────────────────────────────────────────────────────

/** „Rulează din nou” on a failed run: only the steps not sent yet run again (audited). */
export async function retryExecution(
  params: FounderParams & { organizationId: string; executionId: string },
): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  const executionId = uuid('executionId', params.executionId);
  await withFounderTx(organizationId, async (client, exec) => {
    const { rows } = await client.query(
      `UPDATE workflows.execution SET status = 'pending', available_at = now()
        WHERE id = $1 AND status = 'failed' RETURNING id`,
      [executionId],
    );
    if (!rows[0]) throw new Conflict('Only a failed run can run again');
    await audit(exec, founder.userId, {
      action: AuditActions.workflowExecutionRetried,
      targetType: 'workflow_execution',
      targetId: executionId,
      organizationId,
    });
  });
}

/** The central stop: on, nothing is sent (runs are skipped, „engine_paused”); off, it goes on. */
export async function setEnginePaused(
  params: FounderParams & { paused: boolean; reason?: string | null },
): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  const reason = params.paused ? text('reason', params.reason ?? '', 2000) : null;
  await withFounderTx(null, async (client, exec) => {
    await client.query(
      `UPDATE workflows.engine_control SET paused = $1, reason = $2, changed_by_founder_id = $3
        WHERE id = 1`,
      [params.paused, reason, founder.userId],
    );
    await audit(exec, founder.userId, {
      action: params.paused
        ? AuditActions.workflowEnginePaused
        : AuditActions.workflowEngineResumed,
      targetType: 'workflow_engine',
      targetId: '1',
      metadata: reason ? { reason } : {},
    });
  });
}

// ── Reads (the Founder screens) ────────────────────────────────────────────────────────────

export interface DefinitionSummary {
  id: string;
  code: string;
  name: string;
  version: number;
  trigger: TriggerCode;
  triggerParams: Record<string, unknown>;
  delayMinutes: number;
  conditions: string[];
  steps: { kind: string; template: string }[];
  activeCount: number;
  runs30d: number;
  failed30d: number;
}

/** „Automatizări”: every automation with its current version and its figures. */
export async function listDefinitionsForFounder(
  params: FounderParams,
): Promise<DefinitionSummary[]> {
  await requireFounderSession(params.founderHeaders);
  const defs = await withFounderTx(
    null,
    async (client) =>
      (
        await client.query(
          `SELECT d.id, d.code, d.name, d.current_version AS version, v.trigger_type,
                  v.trigger_params, v.delay_minutes, v.conditions, v.steps
             FROM workflows.definition d
             JOIN workflows.definition_version v
               ON v.definition_id = d.id AND v.version = d.current_version
            ORDER BY d.created_at, d.id`,
        )
      ).rows,
    true,
  );
  const stats = await withFounderListTx(async (client) => {
    const { rows } = await client.query(`SELECT * FROM workflows.founder_definition_stats()`);
    return new Map(rows.map((r) => [r.definition_id as string, r]));
  });
  return defs.map((d) => {
    const s = stats.get(d.id);
    return {
      id: d.id,
      code: d.code,
      name: d.name,
      version: d.version,
      trigger: d.trigger_type,
      triggerParams: d.trigger_params,
      delayMinutes: d.delay_minutes,
      conditions: d.conditions,
      steps: d.steps,
      activeCount: Number(s?.active_count ?? 0),
      runs30d: Number(s?.runs_30d ?? 0),
      failed30d: Number(s?.failed_30d ?? 0),
    };
  });
}

export interface ActivationRow {
  activationId: string;
  organizationId: string;
  status: 'active' | 'stopped';
  activatedAt: Date;
  activatedByFounderId: string;
  reason: string;
  supportRef: string | null;
  stoppedAt: Date | null;
  stoppedByFounderId: string | null;
  stopReason: string | null;
  settings: Record<string, unknown> | null;
}

/** „Pornită la afaceri”: the latest activation of each business, with the business's setting. */
export async function listActivationsForFounder(
  params: FounderParams & { definitionId: string },
): Promise<ActivationRow[]> {
  await requireFounderSession(params.founderHeaders);
  const definitionId = uuid('definitionId', params.definitionId);
  return withFounderListTx(async (client) => {
    const { rows } = await client.query(`SELECT * FROM workflows.founder_list_activations($1)`, [
      definitionId,
    ]);
    return rows.map((r) => ({
      activationId: r.id,
      organizationId: r.organization_id,
      status: r.status,
      activatedAt: r.activated_at,
      activatedByFounderId: r.activated_by_founder_id,
      reason: r.activation_reason,
      supportRef: r.activation_support_ref,
      stoppedAt: r.stopped_at,
      stoppedByFounderId: r.stopped_by_founder_id,
      stopReason: r.stop_reason,
      settings: r.settings,
    }));
  });
}

export interface ExecutionLogRow {
  executionId: string;
  organizationId: string;
  definitionId: string;
  definitionVersion: number | null;
  trigger: TriggerCode;
  subjectType: string | null;
  subjectId: string | null;
  status: 'pending' | 'succeeded' | 'failed' | 'skipped';
  reasonCode: string | null;
  messagesSent: number;
  attempts: number;
  createdAt: Date;
  finishedAt: Date | null;
}

const LOG_STATUSES = ['pending', 'succeeded', 'failed', 'skipped'] as const;

/** „Jurnalul execuțiilor”: Toate / Reușite / Eșuate / Sărite, per automation or business. */
export async function listExecutionsForFounder(
  params: FounderParams & {
    status?: (typeof LOG_STATUSES)[number] | null;
    definitionId?: string | null;
    organizationId?: string | null;
    limit?: number;
  },
): Promise<ExecutionLogRow[]> {
  await requireFounderSession(params.founderHeaders);
  if (params.status && !LOG_STATUSES.includes(params.status)) throw new InvalidInput('status');
  const definitionId = params.definitionId ? uuid('definitionId', params.definitionId) : null;
  const organizationId = params.organizationId
    ? uuid('organizationId', params.organizationId)
    : null;
  return withFounderListTx(async (client: PoolClient) => {
    const { rows } = await client.query(
      `SELECT * FROM workflows.founder_list_executions($1, $2, $3, $4)`,
      [params.status ?? null, definitionId, organizationId, params.limit ?? 50],
    );
    return rows.map((r) => ({
      executionId: r.id,
      organizationId: r.organization_id,
      definitionId: r.definition_id,
      definitionVersion: r.definition_version,
      trigger: r.trigger_type,
      subjectType: r.subject_type,
      subjectId: r.subject_id,
      status: r.status,
      reasonCode: r.reason_code,
      messagesSent: r.messages_sent,
      attempts: r.attempts,
      createdAt: r.created_at,
      finishedAt: r.finished_at,
    }));
  });
}
