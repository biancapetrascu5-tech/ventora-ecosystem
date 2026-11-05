import type { PoolClient } from 'pg';
import {
  CommercialDunningChangedV1,
  CommercialSetupRequestChangedV1,
  CommercialTrialEndingV1,
} from '@ventora/contracts';
import { Conflict, Forbidden, InvalidInput, ResourceNotFound } from '@ventora/errors';
import {
  AuditActions,
  appendAuditEventInTx,
  pgExecutor,
  type AuditSqlExecutor,
} from '@ventora/audit';
import { writeOutboxEvent } from '@ventora/db-kit';
import { requireFounderSession } from '@ventora/identity';
import {
  withFounderModuleRead,
  withFounderRead,
  withFounderWrite,
  withModuleRead,
  withOrganizationRead,
  withOrganizationWrite,
} from './db';
import { computeEntitlementsInTx } from './entitlements';
import type { RequestActor } from './requests';

/*
 * Lot 3.8 — the rest of the commercial life cycle (FAZA-3 „Lot 3.8”), on the model of migration
 * 20261104000020_commercial_lifecycle (the triggers decide; this file names the steps):
 *
 *   - the trial of an application (D3-5): 14 days, no card, started by the owner from the Hub,
 *     once per application for good (N3); the job ends it at its term (the data stays) and
 *     reminds the owner 3 days before (`commercial.trial.ending`);
 *   - the trial of the whole subscription (FounderNewBusiness, N4): at its term the subscription
 *     goes `active`; without a card and without manual payment the business goes read-only at once
 *     (a non-payment case `trial` with grace 0). Whether a payment is ready is billing's to say
 *     (billing depends on commercial, not the reverse): `endSubscriptionTrial(…, paymentReady)`;
 *   - non-payment (D3-12): the case opened by billing (the card: Stripe gave up; the transfer: the
 *     due date passed), 14 days of grace set by the server, then read-only and export. The only
 *     source of truth for rights (N13): `subscription.status = 'past_due'` is Stripe's mirror;
 *   - the requests with implementation (S121, D3-23 / D3-24): requested → accepted → confirmed →
 *     paid → in progress → live, plus cancelled / refunded; every step audited and told to the
 *     owner (`commercial.setup_request.changed`).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TRIAL_DAYS = 14;
export const TRIAL_REMINDER_DAYS = 3;
export const GRACE_DAYS = 14;
export const SETUP_REASON_MAX = 1000;
export const DUNNING_REASON_MIN = 10;

function uuid(field: string, value: string): string {
  if (!UUID_RE.test(value ?? '')) throw new InvalidInput(field);
  return value;
}

/** The trigger's refusals (HINT) as the errors the screens know. */
function mapLifecycleError(err: unknown): never {
  const hint = (err as { hint?: string } | null)?.hint;
  const code = (err as { code?: string } | null)?.code;
  if (code === '23505') throw new Conflict('Already exists');
  switch (hint) {
    case 'trial_ended':
    case 'trial_immutable':
    case 'setup_closed':
    case 'setup_transition':
    case 'setup_no_offer':
    case 'dunning_resolved':
      throw new Conflict(hint);
    case 'setup_no_subscription':
      throw new InvalidInput('organizationId', 'The business has no subscription in its currency');
    case 'setup_live_line':
      throw new Conflict(hint);
    default:
      throw err;
  }
}

// ── the trial of an application ─────────────────────────────────────────────────────────────

export interface TrialRow {
  id: string;
  kind: 'application' | 'feature';
  applicationId: string | null;
  featureKey: string | null;
  source: 'owner' | 'founder';
  startsAt: Date;
  endsAt: Date;
  endedAt: Date | null;
  endReason: string | null;
}

type TrialDb = {
  id: string;
  kind: 'application' | 'feature';
  application_id: string | null;
  feature_key: string | null;
  source: 'owner' | 'founder';
  starts_at: Date;
  ends_at: Date;
  ended_at: Date | null;
  end_reason: string | null;
};

const toTrial = (r: TrialDb): TrialRow => ({
  id: r.id,
  kind: r.kind,
  applicationId: r.application_id,
  featureKey: r.feature_key,
  source: r.source,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  endedAt: r.ended_at,
  endReason: r.end_reason,
});

/**
 * „Încearcă 14 zile” (UpgradeDialog, varianta trial): the owner starts the trial of an
 * application the business does not have. The server sets the 14 days (the trigger); once per
 * application, for good (N3): a second start is refused (`Conflict`).
 */
export async function startApplicationTrial(
  actor: RequestActor,
  applicationId: string,
): Promise<TrialRow> {
  const organizationId = uuid('organizationId', actor.organizationId);
  if (actor.actor !== 'user' || actor.role !== 'owner') {
    throw new Forbidden('Only the owner starts a trial');
  }
  const appId = String(applicationId ?? '').trim();
  if (!appId || appId.length > 64) throw new InvalidInput('applicationId');
  return withOrganizationWrite(organizationId, async (client) => {
    const app = await client.query(
      `SELECT 1 FROM commercial.application WHERE id = $1 AND retired_at IS NULL AND NOT is_platform`,
      [appId],
    );
    if (!app.rows[0]) throw new InvalidInput('applicationId', 'Unknown application');
    const entitlements = await computeEntitlementsInTx(client, organizationId, null);
    if (entitlements.applications.includes(appId)) {
      throw new InvalidInput('applicationId', 'The application is already active');
    }
    const used = await client.query(
      `SELECT 1 FROM commercial.trial WHERE application_id = $1 AND source = 'owner'`,
      [appId],
    );
    if (used.rows[0]) throw new Conflict('trial_used');
    const { rows } = await client
      .query<TrialDb>(
        `INSERT INTO commercial.trial
           (organization_id, kind, application_id, source, started_by, ends_at)
         VALUES ($1, 'application', $2, 'owner', $3, now() + interval '${TRIAL_DAYS} days')
         RETURNING id, kind, application_id, feature_key, source, starts_at, ends_at, ended_at,
                   end_reason`,
        [organizationId, appId, actor.userId],
      )
      .catch(mapLifecycleError);
    const trial = rows[0]!;
    await appendAuditEventInTx(pgExecutor(client), {
      category: 'commercial',
      action: AuditActions.commercialTrialStarted,
      outcome: 'success',
      actorType: 'user',
      actorId: actor.userId,
      organizationId,
      targetType: 'trial',
      targetId: trial.id,
      metadata: { applicationId: appId, endsAt: trial.ends_at.toISOString() },
    });
    return toTrial(trial);
  });
}

/** The business's trials (CommercialStates: „se încheie” / „s-a încheiat”), newest first. */
export async function listTrials(organizationId: string): Promise<TrialRow[]> {
  uuid('organizationId', organizationId);
  return withOrganizationRead(organizationId, async (client) => {
    const { rows } = await client.query<TrialDb>(
      `SELECT id, kind, application_id, feature_key, source, starts_at, ends_at, ended_at, end_reason
         FROM commercial.trial ORDER BY starts_at DESC LIMIT 100`,
    );
    return rows.map(toTrial);
  });
}

/**
 * The job (`commercial.trial-end`, the platform): every trial past its term ends (`expired`,
 * data kept), and every trial 3 days from its term reminds the owner, once.
 */
export async function runTrialJob(opts: { limit?: number } = {}): Promise<{
  ended: number;
  reminded: number;
  errors: Array<{ trialId: string; error: unknown }>;
}> {
  const limit = opts.limit ?? 100;
  const due = await withModuleRead((client) =>
    client.query<{ id: string; organization_id: string }>(
      `SELECT id, organization_id FROM commercial.trials_due($1)`,
      [limit],
    ),
  );
  const remind = await withModuleRead((client) =>
    client.query<{ id: string; organization_id: string }>(
      `SELECT id, organization_id FROM commercial.trials_to_remind($1)`,
      [limit],
    ),
  );
  let ended = 0;
  let reminded = 0;
  const errors: Array<{ trialId: string; error: unknown }> = [];
  for (const t of due.rows) {
    try {
      const done = await withOrganizationWrite(t.organization_id, async (client) => {
        const { rows } = await client.query<TrialDb>(
          `UPDATE commercial.trial SET ended_at = now(), end_reason = 'expired'
            WHERE id = $1 AND ended_at IS NULL AND ends_at <= now()
            RETURNING id, kind, application_id, feature_key, source, starts_at, ends_at, ended_at,
                      end_reason`,
          [t.id],
        );
        if (!rows[0]) return false;
        await appendAuditEventInTx(pgExecutor(client), {
          category: 'commercial',
          action: AuditActions.commercialTrialEnded,
          outcome: 'success',
          actorType: 'system',
          organizationId: t.organization_id,
          targetType: 'trial',
          targetId: t.id,
          metadata: { reason: 'expired', applicationId: rows[0].application_id },
        });
        return true;
      });
      if (done) ended++;
    } catch (error) {
      errors.push({ trialId: t.id, error });
    }
  }
  for (const t of remind.rows) {
    try {
      const done = await withOrganizationWrite(t.organization_id, async (client) => {
        const { rows } = await client.query<TrialDb>(
          `UPDATE commercial.trial SET reminder_sent_at = now()
            WHERE id = $1 AND reminder_sent_at IS NULL AND ended_at IS NULL
            RETURNING id, kind, application_id, feature_key, source, starts_at, ends_at, ended_at,
                      end_reason`,
          [t.id],
        );
        const r = rows[0];
        if (!r) return false;
        await writeOutboxEvent(client, 'commercial', CommercialTrialEndingV1, {
          organizationId: t.organization_id,
          sourceApp: CommercialTrialEndingV1.sourceApp,
          resourceId: t.id,
          payload: {
            trialId: t.id,
            kind: r.kind,
            applicationId: r.application_id,
            endsAt: r.ends_at.toISOString(),
          },
        });
        return true;
      });
      if (done) reminded++;
    } catch (error) {
      errors.push({ trialId: t.id, error });
    }
  }
  return { ended, reminded, errors };
}

// ── the trial of the whole subscription (N4) ────────────────────────────────────────────────

/** The subscriptions whose trial is past its term (the job of billing decides each). */
export async function listSubscriptionTrialsDue(
  limit = 100,
): Promise<Array<{ subscriptionId: string; organizationId: string }>> {
  const { rows } = await withModuleRead((client) =>
    client.query<{ subscription_id: string; organization_id: string }>(
      `SELECT subscription_id, organization_id FROM commercial.subscription_trials_due($1)`,
      [limit],
    ),
  );
  return rows.map((r) => ({
    subscriptionId: r.subscription_id,
    organizationId: r.organization_id,
  }));
}

/**
 * N4: the subscription's trial ends — `active`; without a payment ready (no card, no manual
 * payment) the business goes read-only at once (grace 0). Idempotent: false when it had ended.
 */
export async function endSubscriptionTrial(
  organizationId: string,
  subscriptionId: string,
  paymentReady: boolean,
): Promise<{ ended: boolean; dunningId: string | null }> {
  uuid('organizationId', organizationId);
  uuid('subscriptionId', subscriptionId);
  return withOrganizationWrite(organizationId, async (client) => {
    const { rows } = await client.query<{ ended: boolean; dunning_id: string | null }>(
      `SELECT ended, dunning_id FROM commercial.end_subscription_trial($1, $2)`,
      [subscriptionId, paymentReady],
    );
    const r = rows[0];
    if (!r?.ended) return { ended: false, dunningId: null };
    const exec = pgExecutor(client);
    await appendAuditEventInTx(exec, {
      category: 'commercial',
      action: AuditActions.commercialSubscriptionTrialEnded,
      outcome: 'success',
      actorType: 'system',
      organizationId,
      targetType: 'subscription',
      targetId: subscriptionId,
      metadata: { paymentReady, readOnly: !!r.dunning_id },
    });
    if (r.dunning_id) {
      await dunningEventInTx(client, exec, organizationId, r.dunning_id, 'trial', 'read_only');
    }
    return { ended: true, dunningId: r.dunning_id };
  });
}

// ── non-payment (D3-12) ─────────────────────────────────────────────────────────────────────

export type DunningCause = 'card' | 'transfer' | 'trial';

export interface DunningState {
  id: string;
  cause: DunningCause;
  sourceRef: string;
  amountMinor: number;
  currency: 'RON' | 'EUR';
  overdueSince: Date;
  graceEndsAt: Date;
  readOnlyAt: Date | null;
}

type DunningDb = {
  id: string;
  cause: DunningCause;
  source_ref: string;
  amount_minor: string;
  currency: 'RON' | 'EUR';
  overdue_since: Date;
  grace_ends_at: Date;
  read_only_at: Date | null;
};

const toDunning = (r: DunningDb): DunningState => ({
  id: r.id,
  cause: r.cause,
  sourceRef: r.source_ref,
  amountMinor: Number(r.amount_minor),
  currency: r.currency,
  overdueSince: r.overdue_since,
  graceEndsAt: r.grace_ends_at,
  readOnlyAt: r.read_only_at,
});

async function dunningEventInTx(
  client: PoolClient,
  exec: AuditSqlExecutor,
  organizationId: string,
  dunningId: string,
  cause: DunningCause,
  state: 'opened' | 'read_only' | 'resolved',
  audit: { actorType: 'system' | 'founder'; founderId?: string; metadata?: object } = {
    actorType: 'system',
  },
): Promise<void> {
  await writeOutboxEvent(client, 'commercial', CommercialDunningChangedV1, {
    organizationId,
    sourceApp: CommercialDunningChangedV1.sourceApp,
    resourceId: dunningId,
    payload: { dunningId, cause, state },
  });
  await appendAuditEventInTx(exec, {
    category: 'commercial',
    action:
      state === 'opened'
        ? AuditActions.commercialDunningOpened
        : state === 'read_only'
          ? AuditActions.commercialDunningReadOnly
          : AuditActions.commercialDunningResolved,
    outcome: 'success',
    actorType: audit.actorType,
    ...(audit.founderId ? { actorId: audit.founderId, founderId: audit.founderId } : {}),
    organizationId,
    targetType: 'dunning',
    targetId: dunningId,
    metadata: { cause, ...(audit.metadata ?? {}) },
  });
}

/** The open case of the business, if any (one at a time). */
export async function getOpenDunning(organizationId: string): Promise<DunningState | null> {
  uuid('organizationId', organizationId);
  return withOrganizationRead(organizationId, async (client) => {
    const { rows } = await client.query<DunningDb>(
      `SELECT id, cause, source_ref, amount_minor::text AS amount_minor, currency, overdue_since,
              grace_ends_at, read_only_at
         FROM commercial.dunning WHERE resolved_at IS NULL LIMIT 1`,
    );
    return rows[0] ? toDunning(rows[0]) : null;
  });
}

/**
 * Whether the business is read-only and export only (D3-12). The source the access check reads
 * (N14: `authorize()` refuses the writes in a separate PR, with the tests of every module).
 */
export async function isReadOnly(organizationId: string): Promise<boolean> {
  const open = await getOpenDunning(organizationId);
  return !!open?.readOnlyAt;
}

/**
 * Billing opens a case (in its own call, after its transaction): the card (Stripe gave up on
 * an invoice, `sourceRef` = in_…) or the transfer (the due date passed, `sourceRef` = the
 * invoice id). Idempotent: the same source → the same case; another case already open → that one.
 */
export async function openDunning(input: {
  organizationId: string;
  cause: 'card' | 'transfer';
  sourceRef: string;
  amountMinor: number;
  currency: 'RON' | 'EUR';
  overdueSince: Date;
}): Promise<{ dunningId: string; opened: boolean }> {
  const organizationId = uuid('organizationId', input.organizationId);
  const sourceRef = String(input.sourceRef ?? '').trim();
  if (!sourceRef || sourceRef.length > 255) throw new InvalidInput('sourceRef');
  if (!Number.isInteger(input.amountMinor) || input.amountMinor < 0) {
    throw new InvalidInput('amountMinor');
  }
  return withOrganizationWrite(organizationId, async (client) => {
    const open = await client.query<{ id: string }>(
      `SELECT id FROM commercial.dunning WHERE resolved_at IS NULL LIMIT 1`,
    );
    if (open.rows[0]) return { dunningId: open.rows[0].id, opened: false };
    const same = await client.query<{ id: string }>(
      `SELECT id FROM commercial.dunning WHERE cause = $1 AND source_ref = $2`,
      [input.cause, sourceRef],
    );
    if (same.rows[0]) return { dunningId: same.rows[0].id, opened: false };
    const sub = await client.query<{ id: string }>(
      `SELECT id FROM commercial.subscription WHERE canceled_at IS NULL
        ORDER BY started_on DESC LIMIT 1`,
    );
    if (!sub.rows[0]) throw new InvalidInput('organizationId', 'The business has no subscription');
    const overdue = new Date(Math.min(input.overdueSince.getTime(), Date.now()));
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO commercial.dunning
         (organization_id, subscription_id, cause, source_ref, amount_minor, currency,
          overdue_since, grace_ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       RETURNING id`,
      [
        organizationId,
        sub.rows[0].id,
        input.cause,
        sourceRef,
        input.amountMinor,
        input.currency,
        overdue,
      ],
    );
    const dunningId = rows[0]!.id;
    await dunningEventInTx(
      client,
      pgExecutor(client),
      organizationId,
      dunningId,
      input.cause,
      'opened',
      {
        actorType: 'system',
        metadata: { sourceRef, amountMinor: input.amountMinor, currency: input.currency },
      },
    );
    return { dunningId, opened: true };
  });
}

/**
 * The payment came (billing: the Stripe invoice paid, the transfer confirmed, a card saved and
 * charged after the trial): the open case closes as `paid`. With `sourceRef`, the case of that
 * source or a `trial` case (any payment ends it); without it, the open case whatever its cause.
 */
export async function resolveDunningPaid(
  organizationId: string,
  sourceRef?: string,
): Promise<boolean> {
  uuid('organizationId', organizationId);
  return withOrganizationWrite(organizationId, async (client) => {
    const { rows } = await client.query<{ id: string; cause: DunningCause }>(
      `UPDATE commercial.dunning SET resolution = 'paid'
        WHERE resolved_at IS NULL AND ($1::text IS NULL OR source_ref = $1 OR cause = 'trial')
        RETURNING id, cause`,
      [sourceRef ?? null],
    );
    const r = rows[0];
    if (!r) return false;
    await dunningEventInTx(client, pgExecutor(client), organizationId, r.id, r.cause, 'resolved', {
      actorType: 'system',
      metadata: { resolution: 'paid' },
    });
    return true;
  });
}

/** The grace job (`commercial.dunning-grace`): every case past its grace goes read-only, once. */
export async function runDunningGraceJob(opts: { limit?: number } = {}): Promise<{
  readOnly: number;
  errors: Array<{ dunningId: string; error: unknown }>;
}> {
  const due = await withModuleRead((client) =>
    client.query<{ id: string; organization_id: string }>(
      `SELECT id, organization_id FROM commercial.dunning_due($1)`,
      [opts.limit ?? 100],
    ),
  );
  let readOnly = 0;
  const errors: Array<{ dunningId: string; error: unknown }> = [];
  for (const d of due.rows) {
    try {
      const done = await withOrganizationWrite(d.organization_id, async (client) => {
        const { rows } = await client.query<{ cause: DunningCause }>(
          `UPDATE commercial.dunning SET read_only_at = now()
            WHERE id = $1 AND resolved_at IS NULL AND read_only_at IS NULL AND grace_ends_at <= now()
            RETURNING cause`,
          [d.id],
        );
        if (!rows[0]) return false;
        await dunningEventInTx(
          client,
          pgExecutor(client),
          d.organization_id,
          d.id,
          rows[0].cause,
          'read_only',
        );
        return true;
      });
      if (done) readOnly++;
    } catch (error) {
      errors.push({ dunningId: d.id, error });
    }
  }
  return { readOnly, errors };
}

export interface FounderDunningRow {
  id: string;
  organizationId: string;
  cause: DunningCause;
  amountMinor: number;
  currency: 'RON' | 'EUR';
  overdueSince: Date;
  graceEndsAt: Date;
  readOnlyAt: Date | null;
}

/** Founder · Prezentare: the open cases of every business. */
export async function listDunningForFounder(params: {
  founderHeaders: Headers;
  limit?: number;
}): Promise<FounderDunningRow[]> {
  await requireFounderSession(params.founderHeaders);
  return withFounderRead(async (client) => {
    const { rows } = await client.query<{
      id: string;
      organization_id: string;
      cause: DunningCause;
      amount_minor: string;
      currency: 'RON' | 'EUR';
      overdue_since: Date;
      grace_ends_at: Date;
      read_only_at: Date | null;
    }>(
      `SELECT id, organization_id, cause, amount_minor::text AS amount_minor, currency,
              overdue_since, grace_ends_at, read_only_at
         FROM commercial.founder_list_dunning($1)`,
      [params.limit ?? 100],
    );
    return rows.map((r) => ({
      id: r.id,
      organizationId: r.organization_id,
      cause: r.cause,
      amountMinor: Number(r.amount_minor),
      currency: r.currency,
      overdueSince: r.overdue_since,
      graceEndsAt: r.grace_ends_at,
      readOnlyAt: r.read_only_at,
    }));
  });
}

/** Founder closes a case by hand (a payment arranged otherwise), with a reason of 10+ characters. */
export async function resolveDunningByFounder(params: {
  founderHeaders: Headers;
  organizationId: string;
  dunningId: string;
  reason: string;
}): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  const dunningId = uuid('dunningId', params.dunningId);
  const reason = params.reason?.trim() ?? '';
  if (reason.length < DUNNING_REASON_MIN || reason.length > SETUP_REASON_MAX) {
    throw new InvalidInput('reason');
  }
  await withFounderWrite(organizationId, async (client, exec) => {
    const { rows } = await client
      .query<{ cause: DunningCause }>(
        `UPDATE commercial.dunning
            SET resolution = 'founder', resolved_by_founder_id = $2, resolve_reason = $3
          WHERE id = $1 RETURNING cause`,
        [dunningId, founder.userId, reason],
      )
      .catch(mapLifecycleError);
    if (!rows[0]) throw new ResourceNotFound('Case not found');
    await dunningEventInTx(client, exec, organizationId, dunningId, rows[0].cause, 'resolved', {
      actorType: 'founder',
      founderId: founder.userId,
      metadata: { resolution: 'founder', reason },
    });
  });
}

// ── the requests with implementation (S121) ─────────────────────────────────────────────────

export type SetupStatus =
  | 'requested'
  | 'accepted'
  | 'confirmed'
  | 'paid'
  | 'in_progress'
  | 'live'
  | 'cancelled'
  | 'refunded';

export interface SetupRequestRow {
  id: string;
  organizationId: string;
  applicationId: string;
  currency: 'RON' | 'EUR';
  status: SetupStatus;
  requestedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  setupMinor: number | null;
  maintenanceMinor: number | null;
  maintenanceInterval: 'month' | 'year' | null;
  estimatedStartOn: string | null;
  offerNote: string | null;
  offerSentAt: Date | null;
  acceptedAt: Date | null;
  startOn: string | null;
  confirmedAt: Date | null;
  paidAt: Date | null;
  paymentMethod: 'card' | 'transfer' | null;
  paymentRef: string | null;
  workStartedAt: Date | null;
  liveAt: Date | null;
  subscriptionApplicationId: string | null;
  cancelledAt: Date | null;
  cancelledBy: 'owner' | 'founder' | null;
  cancelReason: string | null;
  refundedAt: Date | null;
}

const SETUP_COLUMNS = `id, organization_id, application_id, currency, status, requested_by_user_id,
  created_at, updated_at, setup_minor::text AS setup_minor,
  maintenance_minor::text AS maintenance_minor, maintenance_interval,
  estimated_start_on::text AS estimated_start_on, offer_note, offer_sent_at, accepted_at,
  start_on::text AS start_on, confirmed_at, paid_at, payment_method, payment_ref, work_started_at,
  live_at, subscription_application_id, cancelled_at, cancelled_by, cancel_reason, refunded_at`;

type SetupDb = Record<string, unknown>;

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function toSetup(r: SetupDb): SetupRequestRow {
  return {
    id: r.id as string,
    organizationId: r.organization_id as string,
    applicationId: r.application_id as string,
    currency: r.currency as 'RON' | 'EUR',
    status: r.status as SetupStatus,
    requestedByUserId: r.requested_by_user_id as string,
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
    setupMinor: num(r.setup_minor),
    maintenanceMinor: num(r.maintenance_minor),
    maintenanceInterval: (r.maintenance_interval as 'month' | 'year' | null) ?? null,
    estimatedStartOn: (r.estimated_start_on as string | null) ?? null,
    offerNote: (r.offer_note as string | null) ?? null,
    offerSentAt: (r.offer_sent_at as Date | null) ?? null,
    acceptedAt: (r.accepted_at as Date | null) ?? null,
    startOn: (r.start_on as string | null) ?? null,
    confirmedAt: (r.confirmed_at as Date | null) ?? null,
    paidAt: (r.paid_at as Date | null) ?? null,
    paymentMethod: (r.payment_method as 'card' | 'transfer' | null) ?? null,
    paymentRef: (r.payment_ref as string | null) ?? null,
    workStartedAt: (r.work_started_at as Date | null) ?? null,
    liveAt: (r.live_at as Date | null) ?? null,
    subscriptionApplicationId: (r.subscription_application_id as string | null) ?? null,
    cancelledAt: (r.cancelled_at as Date | null) ?? null,
    cancelledBy: (r.cancelled_by as 'owner' | 'founder' | null) ?? null,
    cancelReason: (r.cancel_reason as string | null) ?? null,
    refundedAt: (r.refunded_at as Date | null) ?? null,
  };
}

async function setupEventInTx(
  client: PoolClient,
  exec: AuditSqlExecutor,
  row: SetupRequestRow,
  action: string,
  actor: { actorType: 'user' | 'founder' | 'system'; id?: string },
  metadata: object = {},
): Promise<void> {
  await writeOutboxEvent(client, 'commercial', CommercialSetupRequestChangedV1, {
    organizationId: row.organizationId,
    sourceApp: CommercialSetupRequestChangedV1.sourceApp,
    resourceId: row.id,
    payload: {
      setupRequestId: row.id,
      applicationId: row.applicationId,
      status: row.status,
      offerSent: !!row.offerSentAt,
    },
  });
  await appendAuditEventInTx(exec, {
    category: 'commercial',
    action,
    outcome: 'success',
    actorType: actor.actorType,
    ...(actor.id ? { actorId: actor.id } : {}),
    ...(actor.actorType === 'founder' && actor.id ? { founderId: actor.id } : {}),
    organizationId: row.organizationId,
    targetType: 'setup_request',
    targetId: row.id,
    metadata: { applicationId: row.applicationId, status: row.status, ...metadata },
  });
}

/**
 * „Cere activare” on an application with implementation, „la cerere” (D3-24): the owner asks;
 * the team sends the offer. One open request per application: asking again returns it.
 */
export async function requestSetup(
  actor: RequestActor,
  applicationId: string,
): Promise<{ setupRequestId: string; created: boolean }> {
  const organizationId = uuid('organizationId', actor.organizationId);
  if (actor.actor !== 'user' || actor.role !== 'owner') {
    throw new Forbidden('Only the owner asks for an application with implementation');
  }
  const appId = String(applicationId ?? '').trim();
  if (!appId || appId.length > 64) throw new InvalidInput('applicationId');
  return withOrganizationWrite(organizationId, async (client) => {
    const app = await client.query(
      `SELECT 1 FROM commercial.application WHERE id = $1 AND retired_at IS NULL AND NOT is_platform`,
      [appId],
    );
    if (!app.rows[0]) throw new InvalidInput('applicationId', 'Unknown application');
    const entitlements = await computeEntitlementsInTx(client, organizationId, null);
    if (entitlements.applications.includes(appId) && !(await onTrialOnly(client, appId))) {
      throw new InvalidInput('applicationId', 'The application is already active');
    }
    const open = await client.query<{ id: string }>(
      `SELECT id FROM commercial.setup_request
        WHERE application_id = $1 AND status NOT IN ('live', 'cancelled', 'refunded')`,
      [appId],
    );
    if (open.rows[0]) return { setupRequestId: open.rows[0].id, created: false };
    const sub = await client.query<{ currency: 'RON' | 'EUR' }>(
      `SELECT currency FROM commercial.subscription WHERE canceled_at IS NULL
        ORDER BY started_on DESC LIMIT 1`,
    );
    if (!sub.rows[0]) throw new InvalidInput('organizationId', 'The business has no subscription');
    const { rows } = await client
      .query<SetupDb>(
        `INSERT INTO commercial.setup_request (organization_id, application_id, currency, requested_by_user_id)
         VALUES ($1, $2, $3, $4) RETURNING ${SETUP_COLUMNS}`,
        [organizationId, appId, sub.rows[0].currency, actor.userId],
      )
      .catch(mapLifecycleError);
    const row = toSetup(rows[0]!);
    await setupEventInTx(client, pgExecutor(client), row, AuditActions.commercialSetupRequested, {
      actorType: 'user',
      id: actor.userId,
    });
    return { setupRequestId: row.id, created: true };
  });
}

/** An application on trial only (not in the bundle, no line): it can still be asked for. */
async function onTrialOnly(client: PoolClient, appId: string): Promise<boolean> {
  const line = await client.query(
    `SELECT 1 FROM commercial.subscription_application WHERE application_id = $1 AND ended_at IS NULL`,
    [appId],
  );
  if (line.rows[0]) return false;
  const trial = await client.query(
    `SELECT 1 FROM commercial.trial
      WHERE application_id = $1 AND ended_at IS NULL AND ends_at > now()`,
    [appId],
  );
  return !!trial.rows[0];
}

/** The business's requests (HubSetupRequest), newest first. */
export async function listSetupRequests(organizationId: string): Promise<SetupRequestRow[]> {
  uuid('organizationId', organizationId);
  return withOrganizationRead(organizationId, async (client) => {
    const { rows } = await client.query<SetupDb>(
      `SELECT ${SETUP_COLUMNS} FROM commercial.setup_request ORDER BY created_at DESC LIMIT 50`,
    );
    return rows.map(toSetup);
  });
}

/** The owner accepts the offer (HubSetupRequest „Accept oferta”). */
export async function acceptSetupOffer(actor: RequestActor, setupRequestId: string): Promise<void> {
  const organizationId = uuid('organizationId', actor.organizationId);
  if (actor.actor !== 'user' || actor.role !== 'owner') throw new Forbidden('Only the owner');
  await withOrganizationWrite(organizationId, async (client) => {
    const { rows } = await client
      .query<SetupDb>(
        `UPDATE commercial.setup_request SET status = 'accepted', accepted_by_user_id = $2
          WHERE id = $1 RETURNING ${SETUP_COLUMNS}`,
        [uuid('setupRequestId', setupRequestId), actor.userId],
      )
      .catch(mapLifecycleError);
    if (!rows[0]) throw new ResourceNotFound('Request not found');
    await setupEventInTx(
      client,
      pgExecutor(client),
      toSetup(rows[0]),
      AuditActions.commercialSetupAccepted,
      {
        actorType: 'user',
        id: actor.userId,
      },
    );
  });
}

/** The owner declines the offer or gives up, before paying (HubSetupRequest „Refuz”). */
export async function cancelSetupByOwner(
  actor: RequestActor,
  setupRequestId: string,
  reason?: string,
): Promise<void> {
  const organizationId = uuid('organizationId', actor.organizationId);
  if (actor.actor !== 'user' || actor.role !== 'owner') throw new Forbidden('Only the owner');
  const why = reason?.trim() || null;
  if (why && why.length > SETUP_REASON_MAX) throw new InvalidInput('reason');
  await withOrganizationWrite(organizationId, async (client) => {
    const { rows } = await client
      .query<SetupDb>(
        `UPDATE commercial.setup_request
            SET status = 'cancelled', cancelled_by = 'owner', cancelled_by_id = $2, cancel_reason = $3
          WHERE id = $1 RETURNING ${SETUP_COLUMNS}`,
        [uuid('setupRequestId', setupRequestId), actor.userId, why],
      )
      .catch(mapLifecycleError);
    if (!rows[0]) throw new ResourceNotFound('Request not found');
    await setupEventInTx(
      client,
      pgExecutor(client),
      toSetup(rows[0]),
      AuditActions.commercialSetupCancelled,
      {
        actorType: 'user',
        id: actor.userId,
      },
    );
  });
}

/**
 * Billing records the implementation as paid (the card purchase succeeded, in billing_rw's own
 * call; the transfer is confirmed by Founder with `markSetupPaidByFounder`). Idempotent.
 */
export async function markSetupPaid(input: {
  organizationId: string;
  setupRequestId: string;
  paymentRef: string;
  amountMinor: number;
}): Promise<boolean> {
  const organizationId = uuid('organizationId', input.organizationId);
  return withOrganizationWrite(organizationId, async (client) => {
    const cur = await client.query<{ status: SetupStatus }>(
      `SELECT status FROM commercial.setup_request WHERE id = $1 FOR UPDATE`,
      [uuid('setupRequestId', input.setupRequestId)],
    );
    if (cur.rows[0]?.status !== 'confirmed') return false;
    const { rows } = await client.query<SetupDb>(
      `UPDATE commercial.setup_request
          SET status = 'paid', payment_method = 'card', payment_ref = $2, paid_minor = $3
        WHERE id = $1 RETURNING ${SETUP_COLUMNS}`,
      [input.setupRequestId, uuid('paymentRef', input.paymentRef), input.amountMinor],
    );
    await setupEventInTx(
      client,
      pgExecutor(client),
      toSetup(rows[0]!),
      AuditActions.commercialSetupPaid,
      {
        actorType: 'system',
      },
      { paymentMethod: 'card', amountMinor: input.amountMinor },
    );
    return true;
  });
}

export interface SetupOfferInput {
  setupMinor: number;
  maintenanceMinor: number;
  estimatedStartOn: string;
  note?: string | null;
}

/** The catalog's prices for the offer (N7: precompleted, the team can change them). */
export async function getSetupOfferDefaults(params: {
  founderHeaders: Headers;
  organizationId: string;
  setupRequestId: string;
}): Promise<{ setupMinor: number; maintenanceMinor: number; interval: 'month' | 'year' }> {
  await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  return withFounderModuleRead(organizationId, async (client) => {
    const { rows } = await client.query<{
      application_id: string;
      currency: string;
      interval: 'month' | 'year';
    }>(
      `SELECT r.application_id, r.currency, s.interval
         FROM commercial.setup_request r
         JOIN commercial.subscription s ON s.organization_id = r.organization_id AND s.canceled_at IS NULL
        WHERE r.id = $1 ORDER BY s.started_on DESC LIMIT 1`,
      [uuid('setupRequestId', params.setupRequestId)],
    );
    const r = rows[0];
    if (!r) throw new ResourceNotFound('Request not found');
    const prices = await client.query<{ kind: string; amount_minor: string }>(
      `SELECT kind, amount_minor::text AS amount_minor FROM commercial.application_price
        WHERE application_id = $1 AND currency = $2 AND kind IN ('setup', $3)`,
      [r.application_id, r.currency, r.interval],
    );
    const of = (k: string) => Number(prices.rows.find((p) => p.kind === k)?.amount_minor ?? 0);
    return { setupMinor: of('setup'), maintenanceMinor: of(r.interval), interval: r.interval };
  });
}

type FounderStep = {
  founderHeaders: Headers;
  organizationId: string;
  setupRequestId: string;
};

async function founderStep(
  params: FounderStep,
  sql: string,
  values: (founderId: string) => unknown[],
  action: string,
  metadata: object = {},
): Promise<SetupRequestRow> {
  const founder = await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  const id = uuid('setupRequestId', params.setupRequestId);
  return withFounderWrite(organizationId, async (client, exec) => {
    const { rows } = await client
      .query<SetupDb>(`${sql} RETURNING ${SETUP_COLUMNS}`, [id, ...values(founder.userId)])
      .catch(mapLifecycleError);
    if (!rows[0]) throw new ResourceNotFound('Request not found');
    const row = toSetup(rows[0]);
    await setupEventInTx(
      client,
      exec,
      row,
      action,
      { actorType: 'founder', id: founder.userId },
      metadata,
    );
    return row;
  });
}

function money(field: string, v: number): number {
  if (!Number.isInteger(v) || v < 0 || v > 100_000_000) throw new InvalidInput(field);
  return v;
}

/** „Trimite oferta” (sent again while the client has not accepted). */
export async function sendSetupOffer(
  params: FounderStep & { offer: SetupOfferInput },
): Promise<SetupRequestRow> {
  const o = params.offer;
  const setup = money('setupMinor', o.setupMinor);
  const maintenance = money('maintenanceMinor', o.maintenanceMinor);
  if (!DATE_RE.test(o.estimatedStartOn ?? '')) throw new InvalidInput('estimatedStartOn');
  const note = o.note?.trim() || null;
  if (note && note.length > SETUP_REASON_MAX) throw new InvalidInput('note');
  return founderStep(
    params,
    `UPDATE commercial.setup_request
        SET setup_minor = $2, maintenance_minor = $3, estimated_start_on = $4::date,
            offer_note = $5, offer_sent_by_founder_id = $6, maintenance_interval = 'month'
      WHERE id = $1 AND status = 'requested'`,
    (f) => [setup, maintenance, o.estimatedStartOn, note, f],
    AuditActions.commercialSetupOfferSent,
    { setupMinor: setup, maintenanceMinor: maintenance, estimatedStartOn: o.estimatedStartOn },
  );
}

/** „Confirmă” the start date (after the client accepted). */
export async function confirmSetup(
  params: FounderStep & { startOn: string },
): Promise<SetupRequestRow> {
  if (!DATE_RE.test(params.startOn ?? '')) throw new InvalidInput('startOn');
  return founderStep(
    params,
    `UPDATE commercial.setup_request
        SET status = 'confirmed', start_on = $2::date, confirmed_by_founder_id = $3
      WHERE id = $1`,
    (f) => [params.startOn, f],
    AuditActions.commercialSetupConfirmed,
    { startOn: params.startOn },
  );
}

/** The transfer for the implementation was received (billing, `confirmTransferReceipt`). */
export async function markSetupPaidByFounder(
  params: FounderStep & { invoiceId: string; amountMinor: number },
): Promise<SetupRequestRow> {
  return founderStep(
    params,
    `UPDATE commercial.setup_request
        SET status = 'paid', payment_method = 'transfer', payment_ref = $2, paid_minor = $3
      WHERE id = $1`,
    () => [uuid('invoiceId', params.invoiceId), params.amountMinor],
    AuditActions.commercialSetupPaid,
    { paymentMethod: 'transfer', amountMinor: params.amountMinor },
  );
}

/** „Începe lucrul” (only after the payment). */
export async function startSetupWork(params: FounderStep): Promise<SetupRequestRow> {
  return founderStep(
    params,
    `UPDATE commercial.setup_request
        SET status = 'in_progress', work_started_by_founder_id = $2
      WHERE id = $1`,
    (f) => [f],
    AuditActions.commercialSetupWorkStarted,
  );
}

/**
 * „Pornește aplicația”: the application's recurring line starts today (the subscription of the
 * application starts on this day, S121) and the request goes live, in one transaction. The
 * first payment, prorated to the renewal date, is billing's (`reconcileSubscription` for the
 * card; the next transfer invoice otherwise).
 */
export async function goLiveSetup(
  params: FounderStep,
): Promise<SetupRequestRow & { lineId: string }> {
  const founder = await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  const id = uuid('setupRequestId', params.setupRequestId);
  return withFounderWrite(organizationId, async (client, exec) => {
    const req = await client.query<{
      application_id: string;
      status: SetupStatus;
      maintenance_minor: string | null;
    }>(
      `SELECT application_id, status, maintenance_minor::text AS maintenance_minor
         FROM commercial.setup_request WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const r = req.rows[0];
    if (!r) throw new ResourceNotFound('Request not found');
    if (r.status !== 'in_progress') throw new Conflict('setup_transition');
    const sub = await client.query<{ id: string; currency: string; interval: string }>(
      `SELECT id, currency, interval FROM commercial.subscription WHERE canceled_at IS NULL
        ORDER BY started_on DESC LIMIT 1 FOR UPDATE`,
    );
    const s = sub.rows[0];
    if (!s) throw new InvalidInput('organizationId', 'The business has no subscription');
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM commercial.subscription_application
        WHERE application_id = $1 AND ended_at IS NULL LIMIT 1`,
      [r.application_id],
    );
    let lineId = existing.rows[0]?.id;
    if (!lineId) {
      const line = await client.query<{ id: string }>(
        `INSERT INTO commercial.subscription_application
           (organization_id, subscription_id, application_id, currency, interval, amount_minor,
            source, created_by_founder_id)
         VALUES ($1, $2, $3, $4, $5, $6, 'request', $7) RETURNING id`,
        [
          organizationId,
          s.id,
          r.application_id,
          s.currency,
          s.interval,
          Number(r.maintenance_minor ?? 0),
          founder.userId,
        ],
      );
      lineId = line.rows[0]!.id;
      await appendAuditEventInTx(exec, {
        category: 'commercial',
        action: AuditActions.commercialApplicationLineAdded,
        outcome: 'success',
        actorType: 'founder',
        actorId: founder.userId,
        founderId: founder.userId,
        organizationId,
        targetType: 'subscription_application',
        targetId: lineId,
        metadata: {
          applicationId: r.application_id,
          currency: s.currency,
          interval: s.interval,
          amountMinor: Number(r.maintenance_minor ?? 0),
          setupRequestId: id,
        },
      });
    }
    const { rows } = await client
      .query<SetupDb>(
        `UPDATE commercial.setup_request
            SET status = 'live', live_by_founder_id = $2, subscription_application_id = $3
          WHERE id = $1 RETURNING ${SETUP_COLUMNS}`,
        [id, founder.userId, lineId],
      )
      .catch(mapLifecycleError);
    const row = toSetup(rows[0]!);
    await setupEventInTx(
      client,
      exec,
      row,
      AuditActions.commercialSetupLive,
      {
        actorType: 'founder',
        id: founder.userId,
      },
      { lineId },
    );
    return { ...row, lineId };
  });
}

/** „Anulează cererea…” before the payment; the reason is required (the owner sees it). */
export async function cancelSetupByFounder(
  params: FounderStep & { reason: string },
): Promise<SetupRequestRow> {
  const reason = params.reason?.trim() ?? '';
  if (!reason || reason.length > SETUP_REASON_MAX) throw new InvalidInput('reason');
  return founderStep(
    params,
    `UPDATE commercial.setup_request
        SET status = 'cancelled', cancelled_by = 'founder', cancelled_by_id = $2, cancel_reason = $3
      WHERE id = $1`,
    (f) => [f, reason],
    AuditActions.commercialSetupCancelled,
    { reason },
  );
}

/**
 * „Anulează și rambursează…” after the payment, until live (S121): the money goes back (billing:
 * the Stripe refund → the storno; the transfer: the storno, the money sent back by the team).
 * `refundRef` is the Stripe refund id or the storno invoice id.
 */
export async function refundSetupByFounder(
  params: FounderStep & { reason: string; refundRef: string },
): Promise<SetupRequestRow> {
  const reason = params.reason?.trim() ?? '';
  if (!reason || reason.length > SETUP_REASON_MAX) throw new InvalidInput('reason');
  const ref = String(params.refundRef ?? '').trim();
  if (!ref || ref.length > 255) throw new InvalidInput('refundRef');
  return founderStep(
    params,
    `UPDATE commercial.setup_request
        SET status = 'refunded', cancelled_by = 'founder', cancelled_by_id = $2, cancel_reason = $3,
            refund_ref = $4
      WHERE id = $1`,
    (f) => [f, reason, ref],
    AuditActions.commercialSetupRefunded,
    { reason, refundRef: ref },
  );
}

/** One request, for the Founder detail (Drawer). */
export async function getSetupRequestForFounder(params: FounderStep): Promise<SetupRequestRow> {
  await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  return withFounderModuleRead(organizationId, async (client) => {
    const { rows } = await client.query<SetupDb>(
      `SELECT ${SETUP_COLUMNS} FROM commercial.setup_request WHERE id = $1`,
      [uuid('setupRequestId', params.setupRequestId)],
    );
    if (!rows[0]) throw new ResourceNotFound('Request not found');
    return toSetup(rows[0]);
  });
}

export interface FounderSetupRow {
  id: string;
  organizationId: string;
  applicationId: string;
  currency: 'RON' | 'EUR';
  status: SetupStatus;
  requestedByUserId: string;
  setupMinor: number | null;
  maintenanceMinor: number | null;
  maintenanceInterval: 'month' | 'year' | null;
  estimatedStartOn: string | null;
  startOn: string | null;
  offerSentAt: Date | null;
  paidAt: Date | null;
  liveAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Founder · Cereri: the requests with implementation of every business. */
export async function listSetupRequestsForFounder(params: {
  founderHeaders: Headers;
  openOnly?: boolean;
}): Promise<FounderSetupRow[]> {
  await requireFounderSession(params.founderHeaders);
  return withFounderRead(async (client) => {
    const { rows } = await client.query<Record<string, unknown>>(
      `SELECT id, organization_id, application_id, currency, status, requested_by_user_id,
              setup_minor::text AS setup_minor, maintenance_minor::text AS maintenance_minor,
              maintenance_interval, estimated_start_on::text AS estimated_start_on,
              start_on::text AS start_on, offer_sent_at, paid_at, live_at, cancelled_at,
              created_at, updated_at
         FROM commercial.founder_list_setup_requests($1)`,
      [params.openOnly ?? false],
    );
    return rows.map((r) => ({
      id: r.id as string,
      organizationId: r.organization_id as string,
      applicationId: r.application_id as string,
      currency: r.currency as 'RON' | 'EUR',
      status: r.status as SetupStatus,
      requestedByUserId: r.requested_by_user_id as string,
      setupMinor: num(r.setup_minor),
      maintenanceMinor: num(r.maintenance_minor),
      maintenanceInterval: (r.maintenance_interval as 'month' | 'year' | null) ?? null,
      estimatedStartOn: (r.estimated_start_on as string | null) ?? null,
      startOn: (r.start_on as string | null) ?? null,
      offerSentAt: (r.offer_sent_at as Date | null) ?? null,
      paidAt: (r.paid_at as Date | null) ?? null,
      liveAt: (r.live_at as Date | null) ?? null,
      cancelledAt: (r.cancelled_at as Date | null) ?? null,
      createdAt: r.created_at as Date,
      updatedAt: r.updated_at as Date,
    }));
  });
}

/** Whether the next step is the team's (the peach rows of FounderSetupRequests). */
export function setupNeedsTeam(status: SetupStatus): boolean {
  return status === 'requested' || status === 'accepted' || status === 'paid';
}
