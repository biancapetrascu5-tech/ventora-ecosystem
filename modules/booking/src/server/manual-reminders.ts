import type { TenantContext } from '@ventora/access';
import { InvalidInput } from '@ventora/errors';
import { getOrganizationTimeZone } from '@ventora/organizations';
import { hubOnly } from './actor';
import { tx, type AppointmentScope } from './appointments';
import { isUuid } from './validation';

/* Lot B.14c — „Trimite reamintire” by hand (BookingList: the bulk bar; BookingDetail / BookingToday:
   „Retrimite reamintirea”). Decision of the founder (13.11): at most one per appointment and day (in
   the business's zone), even with the automatic reminder off; only appointments still ahead,
   confirmed or unconfirmed, whose client has an e-mail. The e-mail is the reminder of B.13, sent by
   the job booking.client-emails (within its next run) and counted in messaging.email like the
   automatic one. The row of the queue is its record (no personal data, as every row). */

export const MANUAL_REMINDER_LIMITS = { maxPerCall: 100 } as const;

export type ManualReminderSkip =
  /** not in this business */
  | 'not_found'
  /** a member sends only for their own appointments (D-B4-6) */
  | 'forbidden'
  /** not confirmed / unconfirmed, or a later step of a visit (the visit's reminder is its first) */
  | 'not_open'
  | 'past'
  | 'no_email'
  /** one already sent by hand today */
  | 'already_today';

export type ManualReminderResult = {
  queued: string[];
  skipped: Array<{ appointmentId: string; reason: ManualReminderSkip }>;
};

/** reminder:<appointment>:<start, epoch seconds>:manual:<local day> — B.13 reads the first three. */
export function isManualReminder(dedupeKey: string): boolean {
  return dedupeKey.split(':')[3] === 'manual';
}

function requireIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new InvalidInput('appointmentIds', 'required');
  }
  if (value.length > MANUAL_REMINDER_LIMITS.maxPerCall) {
    throw new InvalidInput('appointmentIds', 'too_many');
  }
  if (!value.every((id) => typeof id === 'string' && isUuid(id))) {
    throw new InvalidInput('appointmentIds', 'invalid');
  }
  return [...new Set(value as string[])];
}

export async function sendRemindersInOrg(
  ctx: TenantContext,
  scope: AppointmentScope,
  appointmentIds: unknown,
): Promise<ManualReminderResult> {
  hubOnly(ctx);
  const ids = requireIds(appointmentIds);
  const timeZone = await getOrganizationTimeZone(ctx);
  return tx(ctx, async (client) => {
    const { rows } = await client.query<{
      id: string;
      status: string;
      ahead: boolean;
      first_step: boolean;
      staff_user_id: string;
      has_email: boolean;
    }>(
      `SELECT a.id, a.status, a.starts_at > now() AS ahead,
              COALESCE(a.visit_step, 1) = 1 AS first_step, m.user_id AS staff_user_id,
              (c.email IS NOT NULL AND c.erased_at IS NULL) AS has_email
         FROM booking.appointment a
         JOIN booking.staff_member m ON m.id = a.staff_member_id
         LEFT JOIN booking.client c ON c.id = a.client_id
        WHERE a.id = ANY($1::uuid[])`,
      [ids],
    );
    const found = new Map(rows.map((r) => [r.id, r]));
    const result: ManualReminderResult = { queued: [], skipped: [] };
    const send: string[] = [];
    for (const id of ids) {
      const r = found.get(id);
      const reason: ManualReminderSkip | null = !r
        ? 'not_found'
        : scope === 'own' && r.staff_user_id !== ctx.userId
          ? 'forbidden'
          : !['confirmed', 'unconfirmed'].includes(r.status) || !r.first_step
            ? 'not_open'
            : !r.ahead
              ? 'past'
              : !r.has_email
                ? 'no_email'
                : null;
      if (reason) result.skipped.push({ appointmentId: id, reason });
      else send.push(id);
    }
    if (send.length === 0) return result;
    const inserted = await client.query<{ appointment_id: string }>(
      `INSERT INTO booking.client_message
              (id, organization_id, appointment_id, kind, dedupe_key, send_after, valid_until)
       SELECT gen_random_uuid(), a.organization_id, a.id, 'reminder',
              'reminder:' || a.id::text || ':' || extract(epoch FROM a.starts_at)::bigint::text
                || ':manual:' || to_char(now() AT TIME ZONE $2, 'YYYY-MM-DD'),
              now(), a.starts_at
         FROM booking.appointment a
        WHERE a.id = ANY($1::uuid[])
       ON CONFLICT (organization_id, dedupe_key) DO NOTHING
       RETURNING appointment_id::text`,
      [send, timeZone],
    );
    const queued = new Set(inserted.rows.map((r) => r.appointment_id));
    for (const id of send) {
      if (queued.has(id)) result.queued.push(id);
      else result.skipped.push({ appointmentId: id, reason: 'already_today' });
    }
    return result;
  });
}
