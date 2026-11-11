import type { PoolClient } from 'pg';
import { AuditActions, appendAuditEventInTx } from '@ventora/audit';
import type { TenantContext } from '@ventora/access';
import { uuidv7 } from '@ventora/db-kit';
import { Conflict, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { withBookingTx } from './db';
import { isUuid } from './validation';
import { hubOnly } from './actor';

/*
 * Lot B.7b — the behaviour note (BOOKING.md §3 B.7; design S139 BookingBehaviorNote; the founder's
 * change of 10.11.2026 replaces the score of D-B-15). One label, „Risc ridicat”: N no-shows (2 or 3)
 * in the last M months (3, 6 or 12), default 2 in 6; cancellations in time don't count; everyone else
 * has no label.
 *
 *   - off by default; turning it on counts only the no-shows from then on (behavior_note_since);
 *     turning it off makes every label disappear;
 *   - computed on read: it disappears by itself after M months without no-shows; a removal from the
 *     card (with a reason, booking:admin) counts only the no-shows after it;
 *   - only the owner, the admins and the application manager see it (`seesNote`); never the client,
 *     never outside EasyBook: no event, no ClientDesk, no public route, no e-mail, no SMS;
 *   - the consequence online (a deposit for any service, B.11 / B.22) reads `isHighRisk`.
 * The no-shows of the clients merged into one count for it (S139: the joint history).
 */

export type BehaviorNoteSettings = {
  enabled: boolean;
  /** „2 sau 3 neprezentări”. */
  noShows: 2 | 3;
  /** „3, 6 sau 12 luni”. */
  months: 3 | 6 | 12;
  /** Since when the no-shows count (null when off). */
  since: Date | null;
};

export type BehaviorNote = {
  label: 'high_risk';
  /** The no-shows that count now, and the rule. */
  noShows: number;
  months: number;
  lastNoShowAt: Date;
};

const DEFAULTS: BehaviorNoteSettings = { enabled: false, noShows: 2, months: 6, since: null };

export async function readNoteSettings(client: PoolClient): Promise<BehaviorNoteSettings> {
  const { rows } = await client.query<{
    behavior_note_enabled: boolean;
    behavior_note_no_shows: 2 | 3;
    behavior_note_months: 3 | 6 | 12;
    behavior_note_since: Date | null;
  }>(
    `SELECT behavior_note_enabled, behavior_note_no_shows, behavior_note_months, behavior_note_since
       FROM booking.settings`,
  );
  const r = rows[0];
  if (!r) return { ...DEFAULTS };
  return {
    enabled: r.behavior_note_enabled,
    noShows: r.behavior_note_no_shows,
    months: r.behavior_note_months,
    since: r.behavior_note_since,
  };
}

/** The note of a client now (the clients merged into it included), or null. */
export async function behaviorNoteOf(
  client: PoolClient,
  clientId: string,
  settings?: BehaviorNoteSettings,
): Promise<BehaviorNote | null> {
  const s = settings ?? (await readNoteSettings(client));
  if (!s.enabled || !s.since) return null;
  const { rows } = await client.query<{ n: string; last: Date | null }>(
    `SELECT count(*) AS n, max(a.status_changed_at) AS last
       FROM booking.appointment a
      WHERE a.client_id IN (SELECT id FROM booking.client WHERE id = $1 OR merged_into_client_id = $1)
        AND a.status = 'no_show'
        AND a.starts_at >= now() - make_interval(months => $2)
        AND a.status_changed_at >= GREATEST(
              $3::timestamptz,
              COALESCE((SELECT max(r.removed_at) FROM booking.client_note_removal r
                         WHERE r.client_id = $1), '-infinity'::timestamptz))`,
    [clientId, s.months, s.since],
  );
  const n = Number(rows[0]!.n);
  if (n < s.noShows) return null;
  return { label: 'high_risk', noShows: n, months: s.months, lastNoShowAt: rows[0]!.last! };
}

/** B.11 / B.22: online, a client with „Risc ridicat” is asked for a deposit for any service. */
export async function isHighRisk(client: PoolClient, clientId: string): Promise<boolean> {
  return (await behaviorNoteOf(client, clientId)) !== null;
}

// ── the contracts' server side ──────────────────────────────────────────────────────────────

export async function getBehaviorNoteSettingsInOrg(
  ctx: TenantContext,
): Promise<BehaviorNoteSettings> {
  hubOnly(ctx);
  return withBookingTx(ctx.organizationId, (client) => readNoteSettings(client), true);
}

/**
 * Setări › General · „Nota de comportament” (booking:settings). Turning it on sets `since` to now
 * (only the no-shows from now on count); turning it off clears it (every label disappears).
 */
export async function setBehaviorNoteSettingsInOrg(
  ctx: TenantContext,
  input: { enabled?: unknown; noShows?: unknown; months?: unknown },
): Promise<BehaviorNoteSettings> {
  hubOnly(ctx);
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') {
    throw new InvalidInput('enabled', 'invalid');
  }
  if (input.noShows !== undefined && input.noShows !== 2 && input.noShows !== 3) {
    throw new InvalidInput('noShows', 'invalid');
  }
  if (
    input.months !== undefined &&
    input.months !== 3 &&
    input.months !== 6 &&
    input.months !== 12
  ) {
    throw new InvalidInput('months', 'invalid');
  }
  return withBookingTx(ctx.organizationId, async (client, exec) => {
    const current = await readNoteSettings(client);
    const enabled = input.enabled === undefined ? current.enabled : (input.enabled as boolean);
    const noShows = (input.noShows as 2 | 3 | undefined) ?? current.noShows;
    const months = (input.months as 3 | 6 | 12 | undefined) ?? current.months;
    const since = enabled ? (current.enabled ? current.since : new Date()) : null;
    await client.query(
      `INSERT INTO booking.settings
         (organization_id, updated_by_user_id, behavior_note_enabled, behavior_note_no_shows,
          behavior_note_months, behavior_note_since)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (organization_id) DO UPDATE
         SET behavior_note_enabled = EXCLUDED.behavior_note_enabled,
             behavior_note_no_shows = EXCLUDED.behavior_note_no_shows,
             behavior_note_months = EXCLUDED.behavior_note_months,
             behavior_note_since = EXCLUDED.behavior_note_since,
             updated_by_user_id = EXCLUDED.updated_by_user_id`,
      [ctx.organizationId, ctx.userId, enabled, noShows, months, since],
    );
    await appendAuditEventInTx(exec, {
      category: 'booking',
      action: AuditActions.bookingSettingsUpdated,
      outcome: 'success',
      actorType: 'user',
      actorId: ctx.userId,
      organizationId: ctx.organizationId,
      targetType: 'booking_settings',
      targetId: ctx.organizationId,
      metadata: { behaviorNote: { enabled, noShows, months } },
    });
    return readNoteSettings(client);
  });
}

/**
 * „Șterge nota” from the card (booking:admin, S139): with a reason (10–500), logged; only the
 * no-shows after it count. A client without the label → Conflict('no_behavior_note').
 */
export async function removeBehaviorNoteInOrg(
  ctx: TenantContext,
  params: { clientId: unknown; reason: unknown },
): Promise<void> {
  hubOnly(ctx);
  if (!isUuid(params.clientId)) throw new ResourceNotFound();
  const clientId = params.clientId;
  if (typeof params.reason !== 'string') throw new InvalidInput('reason', 'invalid');
  const reason = params.reason.trim();
  if (reason.length < 10) throw new InvalidInput('reason', 'too_short');
  if (reason.length > 500) throw new InvalidInput('reason', 'too_long');
  await withBookingTx(ctx.organizationId, async (client, exec) => {
    const found = (
      await client.query(`SELECT 1 FROM booking.client WHERE id = $1 FOR UPDATE`, [clientId])
    ).rows[0];
    if (!found) throw new ResourceNotFound();
    if (!(await behaviorNoteOf(client, clientId))) throw new Conflict('no_behavior_note');
    await client.query(
      `INSERT INTO booking.client_note_removal (id, organization_id, client_id, reason, removed_by_user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [uuidv7(), ctx.organizationId, clientId, reason, ctx.userId],
    );
    // the reason is personal: only its length in the log, the text stays in client_note_removal
    await appendAuditEventInTx(exec, {
      category: 'booking',
      action: AuditActions.bookingClientUpdated,
      outcome: 'success',
      actorType: 'user',
      actorId: ctx.userId,
      organizationId: ctx.organizationId,
      targetType: 'booking_client',
      targetId: clientId,
      metadata: { behaviorNoteRemoved: true, reasonLength: reason.length },
    });
  });
}
