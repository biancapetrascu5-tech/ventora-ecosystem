import type { PoolClient } from 'pg';
import type { OutboxEnvelope, OutboxSqlClient } from '@ventora/db-kit';
import { freeStockQuota } from '@ventora/quota';
import { withAppCatalogTx, withAppTx } from './db';
import { STEP_HANDLERS, type StepOutcome } from './steps';
import {
  STEP_TEMPLATES,
  TRIGGERS,
  availableEventTypes,
  triggersForEvent,
  type ConditionCode,
  type ReasonCode,
  type StepInput,
  type TriggerCode,
} from './whitelist';

/*
 * Lot 4.10 — the engine (D-WF-1, D4-22 = b: its own service, apart from the dispatcher of
 * 4.1–4.2, which it only uses as a consumer and through the job registry).
 *
 *   1. workflowsTriggerConsumer: an outbox event of an available trigger → one pending execution
 *      per active automation of the business whose current version listens to it (run_key
 *      `event:<eventId>`: delivered twice → one execution). The delay („după 2 ore”) is the
 *      execution's available_at.
 *   2. runPendingExecutions (the job): each execution in its business's context — the central
 *      stop and a stop of the automation make it skipped; otherwise the current version of the
 *      automation (S116: the new version from the next run), the conditions (one false → skipped,
 *      with the reason), then the steps. A step sent is never sent again; a step that throws
 *      fails the run, and „Rulează din nou” (Founder) runs the remaining steps only.
 *   3. freeStoppedQuota (the job): the workflows.active unit of a stop not freed yet (D-WF-4).
 *
 * The log (execution, execution_step) has the result, the reason and the messages sent; only the
 * messages sent count (S116-D20).
 */

export const WORKFLOWS_QUOTA_KEY = 'workflows.active';

const ROLE_RE = /^[a-z_][a-z0-9_]*$/;

type Queryable = Pick<PoolClient, 'query'> | OutboxSqlClient;

async function rows<T>(tx: Queryable, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await tx.query(sql, params)).rows as T[];
}

/** Runs `fn` as workflows_rw inside a transaction opened as another module role (the dispatcher). */
async function asWorkflowsRw<T>(tx: OutboxSqlClient, fn: () => Promise<T>): Promise<T> {
  const [who] = await rows<{ role: string }>(tx, 'SELECT current_user::text AS role');
  const previous = who!.role;
  if (!ROLE_RE.test(previous)) throw new Error(`[workflows] unexpected role "${previous}"`);
  if (previous !== 'workflows_rw') await tx.query('SET LOCAL ROLE workflows_rw');
  try {
    return await fn();
  } finally {
    if (previous !== 'workflows_rw') await tx.query(`SET LOCAL ROLE ${previous}`);
  }
}

async function enginePaused(tx: Queryable): Promise<boolean> {
  const [row] = await rows<{ paused: boolean }>(
    tx,
    `SELECT paused FROM workflows.engine_control WHERE id = 1`,
  );
  return row?.paused ?? false;
}

type ListeningVersion = {
  activation_id: string;
  definition_id: string;
  trigger_type: TriggerCode;
  trigger_params: Record<string, unknown>;
  delay_minutes: number;
};

/** Whether the version's trigger parameters accept this event (the quota's threshold). */
function acceptsEvent(v: ListeningVersion, payload: unknown): boolean {
  if (v.trigger_type === 'commercial.quota_threshold') {
    const thresholds = (v.trigger_params.thresholds as number[] | undefined) ?? [80];
    return thresholds.includes((payload as { threshold?: number }).threshold ?? -1);
  }
  return true;
}

/**
 * The outbox consumer: one pending execution per active automation that listens to the event.
 * Runs in the dispatcher's transaction (the emitter's role, the business's context); the rows are
 * written as workflows_rw. Only the available triggers are listened to (the Booking ones start
 * when Booking emits them).
 */
export const workflowsTriggerConsumer = {
  name: 'workflows.trigger',
  handles: availableEventTypes(),
  async handle(envelope: OutboxEnvelope, tx: OutboxSqlClient): Promise<void> {
    const triggers = triggersForEvent(envelope.type, envelope.version);
    if (triggers.length === 0) return;
    await asWorkflowsRw(tx, async () => {
      const listening = await rows<ListeningVersion>(
        tx,
        `SELECT a.id AS activation_id, a.definition_id, v.trigger_type, v.trigger_params,
                v.delay_minutes
           FROM workflows.activation a
           JOIN workflows.definition d ON d.id = a.definition_id
           JOIN workflows.definition_version v
             ON v.definition_id = d.id AND v.version = d.current_version
          WHERE a.organization_id = $1::uuid AND a.status = 'active'
            AND v.trigger_type = ANY($2::text[])`,
        [envelope.organizationId, triggers],
      );
      const paused = await enginePaused(tx);
      for (const v of listening) {
        if (!acceptsEvent(v, envelope.payload)) continue;
        const availableAt = new Date(envelope.occurredAt.getTime() + v.delay_minutes * 60_000);
        await tx.query(
          `INSERT INTO workflows.execution
             (id, organization_id, activation_id, definition_id, run_key, trigger_type,
              trigger_event_id, trigger_payload, subject_type, status, reason_code, available_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)
           ON CONFLICT (activation_id, run_key) DO NOTHING`,
          [
            envelope.organizationId,
            v.activation_id,
            v.definition_id,
            `event:${envelope.eventId}`,
            v.trigger_type,
            envelope.eventId,
            JSON.stringify(envelope.payload ?? {}),
            TRIGGERS[v.trigger_type].subject,
            paused ? 'skipped' : 'pending',
            paused ? 'engine_paused' : null,
            availableAt,
          ],
        );
      }
    });
  },
};

type ExecutionRow = {
  id: string;
  organization_id: string;
  activation_id: string;
  definition_id: string;
  trigger_type: TriggerCode;
  trigger_event_id: string | null;
  trigger_payload: Record<string, unknown>;
  subject_type: string | null;
  subject_id: string | null;
  messages_sent: number;
  activation_status: 'active' | 'stopped';
};

type StepRow = { step_index: number; status: 'sent' | 'failed' | 'skipped' };

export type RunResult = 'succeeded' | 'failed' | 'skipped' | 'not_pending';

async function finish(
  tx: Queryable,
  id: string,
  status: 'succeeded' | 'failed' | 'skipped',
  reason: ReasonCode | null,
  messagesSent: number,
): Promise<void> {
  await tx.query(
    `UPDATE workflows.execution SET status = $2, reason_code = $3, messages_sent = $4
      WHERE id = $1`,
    [id, status, reason, messagesSent],
  );
}

/** A condition on the run's recipient; false → the run is skipped with its reason. */
async function conditionHolds(
  tx: Queryable,
  e: ExecutionRow,
  code: ConditionCode,
): Promise<boolean | 'unavailable'> {
  if (code === 'not_sent_in_30_days') {
    const [row] = await rows<{ n: number }>(
      tx,
      `SELECT count(*)::int AS n FROM workflows.execution
        WHERE activation_id = $1 AND id <> $2 AND status = 'succeeded'
          AND subject_type IS NOT DISTINCT FROM $3 AND subject_id IS NOT DISTINCT FROM $4
          AND finished_at > now() - INTERVAL '30 days'`,
      [e.activation_id, e.id, e.subject_type, e.subject_id],
    );
    return row!.n === 0;
  }
  // The e-mail address and the unsubscribe are the client's (Booking): for the owner and the
  // members (users of the business) the operational messages always have an address and go.
  // The client's data comes with Booking core: until then the run fails visibly, no guess.
  return e.subject_type === 'client' ? 'unavailable' : true;
}

/**
 * One execution, in its business's context, as workflows_rw. Locks the row (another worker
 * skips it); a run that is no longer pending is left alone.
 */
export async function runExecutionInTx(tx: PoolClient, executionId: string): Promise<RunResult> {
  const [e] = await rows<ExecutionRow>(
    tx,
    `SELECT e.id, e.organization_id, e.activation_id, e.definition_id, e.trigger_type,
            e.trigger_event_id, e.trigger_payload, e.subject_type, e.subject_id, e.messages_sent,
            a.status AS activation_status
       FROM workflows.execution e
       JOIN workflows.activation a ON a.id = e.activation_id
      WHERE e.id = $1 AND e.status = 'pending'
      FOR UPDATE OF e SKIP LOCKED`,
    [executionId],
  );
  if (!e) return 'not_pending';

  if (await enginePaused(tx)) {
    await finish(tx, e.id, 'skipped', 'engine_paused', e.messages_sent);
    return 'skipped';
  }
  if (e.activation_status !== 'active') {
    await finish(tx, e.id, 'skipped', 'automation_stopped', e.messages_sent);
    return 'skipped';
  }

  // S116: the businesses that have it on get the new version from the next run
  const [v] = await rows<{ version: number; conditions: ConditionCode[]; steps: StepInput[] }>(
    tx,
    `SELECT v.version, v.conditions, v.steps
       FROM workflows.definition d
       JOIN workflows.definition_version v
         ON v.definition_id = d.id AND v.version = d.current_version
      WHERE d.id = $1`,
    [e.definition_id],
  );
  await tx.query(
    `UPDATE workflows.execution
        SET definition_version = $2, attempts = attempts + 1,
            started_at = COALESCE(started_at, now())
      WHERE id = $1`,
    [e.id, v!.version],
  );

  for (const code of v!.conditions) {
    const holds = await conditionHolds(tx, e, code);
    if (holds === 'unavailable') {
      await finish(tx, e.id, 'failed', 'step.unavailable', e.messages_sent);
      return 'failed';
    }
    if (!holds) {
      await finish(tx, e.id, 'skipped', `condition.${code}`, e.messages_sent);
      return 'skipped';
    }
  }

  const done = new Map(
    (
      await rows<StepRow>(
        tx,
        `SELECT step_index, status FROM workflows.execution_step WHERE execution_id = $1`,
        [e.id],
      )
    ).map((s) => [s.step_index, s.status]),
  );
  let messagesSent = e.messages_sent;
  let anySent = false;
  let firstSkip: ReasonCode | null = null;

  for (const [index, step] of v!.steps.entries()) {
    const previous = done.get(index);
    if (previous === 'sent') {
      anySent = true;
      continue;
    }
    let outcome: StepOutcome | { status: 'failed'; reason: ReasonCode };
    const handler = STEP_HANDLERS[`${step.kind}:${step.template}`];
    if (!handler || !STEP_TEMPLATES[step.kind]?.[step.template]?.available) {
      outcome = { status: 'failed', reason: 'step.unavailable' };
    } else {
      // the step's own savepoint: a step that throws leaves nothing, the run records the failure
      await tx.query('SAVEPOINT workflows_step');
      try {
        outcome = await handler({
          tx,
          organizationId: e.organization_id,
          executionId: e.id,
          stepIndex: index,
          triggerEventId: e.trigger_event_id,
          triggerPayload: e.trigger_payload,
        });
        await tx.query('RELEASE SAVEPOINT workflows_step');
      } catch (err) {
        await tx.query('ROLLBACK TO SAVEPOINT workflows_step');
        // ids only, no personal data
        console.error('[workflows] a step failed', {
          executionId: e.id,
          organizationId: e.organization_id,
          step: `${step.kind}:${step.template}`,
          error: err instanceof Error ? err.message : String(err),
        });
        outcome = { status: 'failed', reason: 'step.failed' };
      }
    }
    const sent = outcome.status === 'sent' ? outcome.messagesSent : 0;
    const reason = outcome.status === 'sent' ? null : outcome.reason;
    await tx.query(
      `INSERT INTO workflows.execution_step
         (execution_id, step_index, organization_id, kind, template, status, messages_sent,
          reason_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (execution_id, step_index)
       DO UPDATE SET status = EXCLUDED.status, messages_sent = EXCLUDED.messages_sent,
                     reason_code = EXCLUDED.reason_code`,
      [e.id, index, e.organization_id, step.kind, step.template, outcome.status, sent, reason],
    );
    messagesSent += sent;
    if (outcome.status === 'failed') {
      await finish(tx, e.id, 'failed', outcome.reason, messagesSent);
      return 'failed';
    }
    if (outcome.status === 'sent') anySent = true;
    else firstSkip ??= outcome.reason;
  }

  if (anySent) {
    await finish(tx, e.id, 'succeeded', null, messagesSent);
    return 'succeeded';
  }
  await finish(tx, e.id, 'skipped', firstSkip ?? 'no_recipient', messagesSent);
  return 'skipped';
}

export interface RunReport {
  succeeded: number;
  failed: number;
  skipped: number;
  /** An execution whose transaction threw (not a failed step): left pending for the next run. */
  errors: { executionId: string; organizationId: string; error: unknown }[];
}

/** The job: the pending executions whose time has come, each in its business's context. */
export async function runPendingExecutions(params: { limit?: number } = {}): Promise<RunReport> {
  const due = await withAppCatalogTx((client) =>
    rows<{ id: string; organization_id: string }>(
      client,
      `SELECT id, organization_id FROM workflows.pending_executions($1)`,
      [params.limit ?? 50],
    ),
  );
  const report: RunReport = { succeeded: 0, failed: 0, skipped: 0, errors: [] };
  for (const d of due) {
    try {
      const r = await withAppTx(d.organization_id, (tx) => runExecutionInTx(tx, d.id));
      if (r !== 'not_pending') report[r] += 1;
    } catch (error) {
      report.errors.push({ executionId: d.id, organizationId: d.organization_id, error });
    }
  }
  return report;
}

export const stopOperationId = (activationId: string) => `workflows.stop:${activationId}`;

/**
 * D-WF-4: frees the workflows.active unit of one stopped activation and marks it freed.
 * Idempotent (freeStockQuota on the stop's operation id): safe to call again after a failure.
 */
export async function freeActivationQuota(
  organizationId: string,
  activationId: string,
): Promise<void> {
  await freeStockQuota({ organizationId }, WORKFLOWS_QUOTA_KEY, 1, stopOperationId(activationId));
  await withAppTx(organizationId, (tx) =>
    tx.query(
      `UPDATE workflows.activation SET quota_freed_at = now()
        WHERE id = $1 AND status = 'stopped' AND quota_freed_at IS NULL`,
      [activationId],
    ),
  );
}

/** The job: the stops whose unit was not freed (an error between the stop and the freeing). */
export async function freeStoppedQuota(params: { limit?: number } = {}): Promise<{
  freed: number;
  errors: { activationId: string; organizationId: string; error: unknown }[];
}> {
  const due = await withAppCatalogTx((client) =>
    rows<{ id: string; organization_id: string }>(
      client,
      `SELECT id, organization_id FROM workflows.unfreed_stopped_activations($1)`,
      [params.limit ?? 50],
    ),
  );
  const out = {
    freed: 0,
    errors: [] as { activationId: string; organizationId: string; error: unknown }[],
  };
  for (const a of due) {
    try {
      await freeActivationQuota(a.organization_id, a.id);
      out.freed += 1;
    } catch (error) {
      out.errors.push({ activationId: a.id, organizationId: a.organization_id, error });
    }
  }
  return out;
}

/**
 * The reconciliation of an expired workflows.active reservation (ARCHITECTURE §8.3 step 4): the
 * activation with that operation id exists → commit, otherwise → release.
 */
export async function activationExists(
  organizationId: string,
  operationId: string,
): Promise<boolean> {
  return withAppTx(
    organizationId,
    async (tx) =>
      (
        await rows(tx, `SELECT 1 FROM workflows.activation WHERE quota_operation_id = $1`, [
          operationId,
        ])
      ).length > 0,
    true,
  );
}
