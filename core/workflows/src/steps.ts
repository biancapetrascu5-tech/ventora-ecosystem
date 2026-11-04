import { QuotaThresholdV1 } from '@ventora/contracts';
import { quotaPeriod, quotaResourceKey } from '@ventora/commercial';
import { getNotificationContactsInTx } from '@ventora/identity';
import type { SqlClient } from '@ventora/notifications';
import { listManagersInTx, notifyBillingInTx, organizationNameInTx } from '@ventora/organizations';
import type { ReasonCode, StepKind } from './whitelist';

/*
 * Lot 4.10 — what each whitelisted step does (S116-D19: only messages and notifications). A step
 * runs in the execution's transaction, in the business's context; its effect and its row in
 * `execution_step` commit together, so a step sent once is never sent again (the run can be
 * retried with „Rulează din nou”). The messages are sent through core/notifications, with an
 * idempotency key: a step repeated by a crash is still one message.
 */

export interface StepContext {
  tx: SqlClient;
  organizationId: string;
  executionId: string;
  stepIndex: number;
  triggerEventId: string | null;
  triggerPayload: Record<string, unknown>;
}

export type StepOutcome =
  { status: 'sent'; messagesSent: number } | { status: 'skipped'; reason: ReasonCode };

export type StepHandler = (ctx: StepContext) => Promise<StepOutcome>;

const sqlExec = (tx: SqlClient) => ({
  query: async (sql: string, params: unknown[]) =>
    (await tx.query(sql, params)).rows as Record<string, unknown>[],
  exec: async (sql: string) => {
    await tx.query(sql);
  },
});

/**
 * „Limita aproape atinsă” (S116-D21): the S115 notification of the limits — the owner in the app
 * and by e-mail, everyone else in the business in the app — through notifyBillingInTx, not a
 * message of its own. The idempotency key is the quota event's id, the key the standard sending
 * of S115 uses too: the owner never gets it twice for the same threshold and period.
 */
const quotaLimit: StepHandler = async (ctx) => {
  const p = QuotaThresholdV1.parse(ctx.triggerPayload);
  if (!ctx.triggerEventId) throw new Error('[workflows] quota_limit needs the quota event');
  // S115's texts of the limits say until when („până pe {resetDate}”): a stock quota has none
  if (p.periodStart === null) return { status: 'skipped', reason: 'stock_quota_no_period' };

  const owners = (await listManagersInTx(ctx.tx, ctx.organizationId))
    .filter((m) => m.role === 'owner')
    .map((m) => m.userId);
  if (owners.length === 0) return { status: 'skipped', reason: 'no_recipient' };
  const contacts = await getNotificationContactsInTx(sqlExec(ctx.tx), owners);
  const resource = { type: 'key' as const, key: quotaResourceKey(p.quotaKey) };
  // the monthly period from its first day (D3-3: anchored on the subscription's day)
  const resetDate = quotaPeriod(p.periodStart, p.periodStart).end;

  const result = await notifyBillingInTx(ctx.tx, {
    organizationId: ctx.organizationId,
    kind: p.threshold === 80 ? 'limit80' : 'limit100',
    idempotencyKey: ctx.triggerEventId,
    params: {
      business: (await organizationNameInTx(ctx.tx, ctx.organizationId)) ?? '',
      owner: contacts.get(owners[0]!)?.name ?? '',
      resource,
      // the pack of the same resource (the offer personalised per business: see the 4.10 report)
      buyItem: resource,
      used: String(p.used),
      limit: String(p.limit),
      resetDate: { type: 'date', date: resetDate },
    },
  });
  const sent = result.owner.created.length + (result.others?.created.length ?? 0);
  return sent > 0
    ? { status: 'sent', messagesSent: sent }
    : { status: 'skipped', reason: 'already_sent' };
};

/** The handlers of the available templates; the others (Booking) come with Booking core. */
export const STEP_HANDLERS: Readonly<Partial<Record<`${StepKind}:${string}`, StepHandler>>> = {
  'notification.hub:quota_limit': quotaLimit,
};
