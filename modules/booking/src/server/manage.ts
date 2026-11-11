import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { Conflict, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { listLocations } from '@ventora/organizations';
import {
  cancelAppointmentByClient,
  getBookingSettingsInOrg,
  moveAppointmentByClient,
} from './appointments';
import { getFreeSlotsInOrg, type FreeSlots } from './availability';
import { withBookingTx } from './db';
import { locationFilter } from './locations';
import { manageTokenHash, parseManageToken } from './manage-token';
import {
  localDate,
  nextDate,
  place,
  PUBLIC_LIMITS,
  requireStart,
  settleExpired,
  sha256,
  type PublicPlace,
} from './public';
import { isUuid } from './validation';

/*
 * Lot B.11b — the client's page for moving or cancelling a booking, without an account (BOOKING.md
 * §3 B.11; design BookingClientManage, S125). The page lives at /r/<slug>/m/<token> (the route and
 * the screen are the UI lot); these are the server steps it calls:
 *
 *   getManagedBooking      the booking, the policy (free until, online until) and what is allowed
 *   getManagedFreeSlots    other times for the same service and member, online mode; the booking's
 *                          own time and its own move hold do not count as taken
 *   startManagedMove       the new time held 10 minutes; the old one stays theirs until they confirm
 *   confirmManagedMove     the move (the same checks as from the Hub; history 'client', audit
 *                          'anonymous'); after 10 minutes: hold_expired, the booking unchanged
 *   cancelManagedBooking   cancelled by the client; late when inside the free cancellation
 *
 * T1: the business comes only from the slug; the token is looked up in that business's context, so
 * a token of business A is not found through business B's slug. A revoked token (GDPR erasure), an
 * unknown or malformed one: not found.
 *
 * The rules of S125 (DE DECIS; the recommendations of the design, PROPUS until the founder decides):
 *   - changes online until 2 hours before; after that only by phone ('too_late');
 *   - cancelling between the free cancellation and those 2 hours is allowed, marked late;
 *   - moving is free until the online cut-off, at most once online per booking ('moved_once');
 *   - a business with manual confirmation: no move online for now ('manual_confirmation'; the move
 *     as a request, with the old time kept until the salon confirms, is a later lot).
 */

export const MANAGE_LIMITS = {
  /** S125: online changes until this many hours before the start. */
  onlineCutoffHours: 2,
  /** S125: moves online per booking; the next one by phone. */
  onlineMoves: 1,
  /** move holds per booking per day (a page left open cannot keep the calendar busy). */
  moveHoldsPerDay: 5,
} as const;

export type ManageState = 'open' | 'too_late' | 'cancelled' | 'over' | 'online_closed';
export type MoveRefusal = 'moved_once' | 'manual_confirmation';

export type ManagedBooking = {
  business: { name: string; timeZone: string };
  appointment: {
    number: number;
    status:
      | 'awaiting_payment'
      | 'unconfirmed'
      | 'confirmed'
      | 'in_progress'
      | 'completed'
      | 'cancelled'
      | 'no_show';
    serviceName: string;
    staffDisplayName: string;
    startsAt: Date;
    endsAt: Date;
    durationMinutes: number;
    priceKind: 'fixed' | 'from' | 'range';
    priceMinor: number;
    priceMaxMinor: number | null;
    currency: string;
    location: { name: string; address: string | null } | null;
    /** What was paid (payments minus refunds, B.21); the deposit of B.22 is part of it. */
    paidMinor: number;
    /** Fixed price: what is left to pay at the salon; „de la” / interval: null. */
    leftToPayMinor: number | null;
  };
  policy: {
    freeCancelHours: number;
    /** „Puteți muta sau anula gratuit până {date}”. */
    freeUntil: Date;
    onlineCutoffHours: number;
    /** „Online puteți face schimbări până cu 2 ore înainte.” */
    onlineUntil: Date;
  };
  state: ManageState;
  canCancel: boolean;
  /** Cancelling now is late (inside the free cancellation): the salon may keep the deposit. */
  cancelLate: boolean;
  canMove: boolean;
  moveRefusal: MoveRefusal | null;
};

type Managed = { p: PublicPlace; appointmentId: string };

/** The business of the slug and the booking of the token; else not found (T1). */
async function resolve(slug: unknown, token: unknown): Promise<Managed> {
  const p = await place(slug);
  const t = parseManageToken(token);
  if (!t) throw new ResourceNotFound();
  const row = await withBookingTx(
    p.ctx.organizationId,
    async (client) =>
      (
        await client.query<{ appointment_id: string }>(
          `SELECT appointment_id FROM booking.manage_token
            WHERE token_hash = $1 AND revoked_at IS NULL`,
          [manageTokenHash(t)],
        )
      ).rows[0],
    true,
  );
  if (!row) throw new ResourceNotFound();
  return { p, appointmentId: row.appointment_id };
}

type BookingRow = {
  number: number;
  status: ManagedBooking['appointment']['status'];
  service_id: string;
  staff_member_id: string;
  location_id: string | null;
  service_name: string;
  staff_display_name: string;
  starts_at: Date;
  ends_at: Date;
  duration_minutes: number;
  price_kind: 'fixed' | 'from' | 'range';
  price_minor: number;
  price_max_minor: number | null;
  currency: string;
  paid: string;
  refunded: string;
  online: boolean;
  client_moves: number;
  now: Date;
};

async function readBooking(client: PoolClient, id: string, lock = false): Promise<BookingRow> {
  const { rows } = await client.query<BookingRow>(
    `SELECT a.number, a.status, a.service_id, a.staff_member_id, a.location_id, a.service_name,
            a.staff_display_name, a.starts_at, a.ends_at, a.duration_minutes, a.price_kind,
            a.price_minor, a.price_max_minor, a.currency,
            (SELECT COALESCE(sum(p.amount_minor) FILTER (WHERE p.kind = 'payment'), 0)
               FROM booking.appointment_payment p WHERE p.appointment_id = a.id) AS paid,
            (SELECT COALESCE(sum(p.amount_minor) FILTER (WHERE p.kind = 'refund'), 0)
               FROM booking.appointment_payment p WHERE p.appointment_id = a.id) AS refunded,
            (s.archived_at IS NULL AND s.bookable_online
              AND m.archived_at IS NULL AND m.bookable_online) AS online,
            (SELECT count(*)::int FROM booking.appointment_history h
              WHERE h.appointment_id = a.id AND h.kind = 'moved' AND h.actor_type = 'client')
              AS client_moves,
            now() AS now
       FROM booking.appointment a
       JOIN booking.service s ON s.id = a.service_id
       JOIN booking.staff_member m ON m.id = a.staff_member_id
      WHERE a.id = $1${lock ? ' FOR UPDATE OF a' : ''}`,
    [id],
  );
  if (!rows[0]) throw new ResourceNotFound();
  return rows[0];
}

const HOUR = 3_600_000;

function judge(
  b: BookingRow,
  settings: { freeCancelHours: number; confirmationMode: 'auto' | 'manual' },
) {
  const now = b.now.getTime();
  const start = b.starts_at.getTime();
  let state: ManageState;
  if (b.status === 'cancelled') state = 'cancelled';
  else if (!['awaiting_payment', 'unconfirmed', 'confirmed'].includes(b.status)) state = 'over';
  else if (b.ends_at.getTime() <= now) state = 'over';
  else if (start - now < MANAGE_LIMITS.onlineCutoffHours * HOUR) state = 'too_late';
  else if (!b.online) state = 'online_closed';
  else state = 'open';
  const moveRefusal: MoveRefusal | null =
    state !== 'open'
      ? null
      : settings.confirmationMode === 'manual'
        ? 'manual_confirmation'
        : b.client_moves >= MANAGE_LIMITS.onlineMoves
          ? 'moved_once'
          : null;
  return {
    state,
    canCancel: state === 'open',
    cancelLate: start - now < settings.freeCancelHours * HOUR,
    canMove: state === 'open' && moveRefusal === null,
    moveRefusal,
  };
}

/** The refusal of a change, as the contract's error (the state or the reason of the move). */
function refuse(j: ReturnType<typeof judge>, move: boolean): void {
  if (j.state !== 'open') throw new Conflict(j.state);
  if (move && j.moveRefusal) throw new Conflict(j.moveRefusal);
}

export async function getManagedBooking(slug: unknown, token: unknown): Promise<ManagedBooking> {
  const { p, appointmentId } = await resolve(slug, token);
  const settings = await getBookingSettingsInOrg(p.ctx);
  const b = await withBookingTx(p.ctx.organizationId, (c) => readBooking(c, appointmentId), true);
  const location = b.location_id
    ? ((await listLocations({ organizationId: p.ctx.organizationId })).find(
        (l) => l.id === b.location_id,
      ) ?? null)
    : null;
  const paid = Number(b.paid) - Number(b.refunded);
  const start = b.starts_at.getTime();
  return {
    business: { name: p.name, timeZone: p.timeZone },
    appointment: {
      number: b.number,
      status: b.status,
      serviceName: b.service_name,
      staffDisplayName: b.staff_display_name,
      startsAt: b.starts_at,
      endsAt: b.ends_at,
      durationMinutes: b.duration_minutes,
      priceKind: b.price_kind,
      priceMinor: b.price_minor,
      priceMaxMinor: b.price_max_minor,
      currency: b.currency.trim(),
      location: location ? { name: location.name, address: location.address } : null,
      paidMinor: paid,
      leftToPayMinor: b.price_kind === 'fixed' ? Math.max(0, b.price_minor - paid) : null,
    },
    policy: {
      freeCancelHours: settings.freeCancelHours,
      freeUntil: new Date(start - settings.freeCancelHours * HOUR),
      onlineCutoffHours: MANAGE_LIMITS.onlineCutoffHours,
      onlineUntil: new Date(start - MANAGE_LIMITS.onlineCutoffHours * HOUR),
    },
    ...judge(b, settings),
  };
}

/** The booking, checked for a move: the state, the member's location, the rules. */
async function movable(m: Managed) {
  const settings = await getBookingSettingsInOrg(m.p.ctx);
  const b = await withBookingTx(
    m.p.ctx.organizationId,
    (c) => readBooking(c, m.appointmentId),
    true,
  );
  refuse(judge(b, settings), true);
  let locationId: string | undefined;
  try {
    locationId = await locationFilter(m.p.ctx, b.location_id);
  } catch {
    throw new Conflict('online_closed'); // the location was closed since
  }
  return { b, locationId };
}

export async function getManagedFreeSlots(
  slug: unknown,
  q: { token: unknown; from: unknown; to: unknown },
): Promise<FreeSlots> {
  const m = await resolve(slug, q.token);
  const { b, locationId } = await movable(m);
  return getFreeSlotsInOrg(m.p.ctx, {
    serviceId: b.service_id,
    staffMemberId: b.staff_member_id,
    from: q.from,
    to: q.to,
    mode: 'online',
    locationId,
    ignoreAppointmentId: m.appointmentId,
  });
}

export type ManagedMoveHold = { holdId: string; startsAt: Date; expiresAt: Date };

export async function startManagedMove(
  slug: unknown,
  input: { token: unknown; startsAt: unknown; ip: string | null },
): Promise<ManagedMoveHold> {
  const m = await resolve(slug, input.token);
  const { ctx } = m.p;
  const startsAt = requireStart(input.startsAt);
  const { b, locationId } = await movable(m);
  if (startsAt.getTime() === b.starts_at.getTime()) throw new InvalidInput('startsAt', 'same');

  const moveHash = sha256(`move:${m.appointmentId}`);
  const limited = await withBookingTx(ctx.organizationId, async (client) => {
    await settleExpired(client);
    const { rows } = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM booking.public_hold
        WHERE email_hash = $1 AND created_at > now() - interval '1 day'`,
      [moveHash],
    );
    return rows[0]!.n >= MANAGE_LIMITS.moveHoldsPerDay;
  });
  if (limited) throw new Conflict('rate_limited');

  // the time must be one of the free online times (the booking's own time does not count)
  const date = localDate(startsAt, m.p.timeZone);
  const slots = await getFreeSlotsInOrg(ctx, {
    serviceId: b.service_id,
    staffMemberId: b.staff_member_id,
    from: date,
    to: nextDate(date),
    mode: 'online',
    locationId,
    ignoreAppointmentId: m.appointmentId,
  });
  const slot = slots.days
    .flatMap((d) => d.slots)
    .find((s) => s.available && s.startsAt.getTime() === startsAt.getTime());
  if (!slot) throw new Conflict('slot_taken');
  // the booking keeps its duration (a shortened one stays shortened)
  const endsAt = new Date(startsAt.getTime() + b.duration_minutes * 60_000);

  const holdId = crypto.randomUUID();
  const hold = await withBookingTx(ctx.organizationId, async (client) => {
    await client.query(`SELECT 1 FROM booking.staff_member WHERE id = $1 FOR UPDATE`, [
      b.staff_member_id,
    ]);
    const taken = await client.query(
      `SELECT 1 FROM booking.public_hold
        WHERE staff_member_id = $1 AND state = 'pending' AND expires_at > now()
          AND move_appointment_id IS DISTINCT FROM $4
          AND starts_at < $3 AND ends_at > $2
       UNION ALL
       SELECT 1 FROM booking.appointment
        WHERE staff_member_id = $1 AND id <> $4
          AND status IN ('awaiting_payment', 'unconfirmed', 'confirmed', 'in_progress')
          AND starts_at < $3 AND ends_at > $2
       LIMIT 1`,
      [b.staff_member_id, startsAt, endsAt, m.appointmentId],
    );
    if (taken.rows.length > 0) return null;
    // a new choice replaces the pending one of the same booking
    await client.query(
      `UPDATE booking.public_hold SET state = 'expired', settled_at = now()
        WHERE move_appointment_id = $1 AND state = 'pending'`,
      [m.appointmentId],
    );
    const { rows } = await client.query<{ expires_at: Date }>(
      `INSERT INTO booking.public_hold
         (id, organization_id, staff_member_id, service_id, location_id, starts_at, ends_at,
          duration_minutes, email_hash, ip_hash, code_hash, move_appointment_id, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, $11,
               now() + make_interval(mins => $12))
       RETURNING expires_at`,
      [
        holdId,
        ctx.organizationId,
        b.staff_member_id,
        b.service_id,
        b.location_id,
        startsAt,
        endsAt,
        b.duration_minutes,
        moveHash,
        sha256(`${ctx.organizationId}:${input.ip ?? 'unknown'}`),
        m.appointmentId,
        PUBLIC_LIMITS.holdMinutes,
      ],
    );
    return rows[0]!;
  });
  if (!hold) throw new Conflict('slot_taken');
  return { holdId, startsAt, expiresAt: hold.expires_at };
}

export type ManagedChange = {
  status: ManagedBooking['appointment']['status'];
  startsAt: Date;
  endsAt: Date;
};

export async function confirmManagedMove(
  slug: unknown,
  input: { token: unknown; holdId: unknown },
): Promise<ManagedChange> {
  const m = await resolve(slug, input.token);
  if (!isUuid(input.holdId)) throw new ResourceNotFound();
  const holdId = input.holdId;
  await movable(m);

  // the hold is claimed first, so a second confirmation cannot move the booking twice
  const claimed = await withBookingTx(m.p.ctx.organizationId, async (client) => {
    const hold = (
      await client.query<{ starts_at: Date; state: string; expires_at: Date; now: Date }>(
        `SELECT starts_at, state, expires_at, now() AS now FROM booking.public_hold
          WHERE id = $1 AND move_appointment_id = $2 FOR UPDATE`,
        [holdId, m.appointmentId],
      )
    ).rows[0];
    if (!hold) return null;
    if (hold.state !== 'pending' || hold.expires_at.getTime() <= hold.now.getTime()) {
      await client.query(
        `UPDATE booking.public_hold SET state = 'expired', settled_at = now()
          WHERE id = $1 AND state = 'pending'`,
        [holdId],
      );
      return 'expired' as const;
    }
    await client.query(
      `UPDATE booking.public_hold
          SET state = 'confirmed', appointment_id = $2, settled_at = now()
        WHERE id = $1`,
      [holdId, m.appointmentId],
    );
    return hold.starts_at;
  });
  if (claimed === null) throw new ResourceNotFound();
  if (claimed === 'expired') throw new Conflict('hold_expired');

  try {
    const moved = await moveAppointmentByClient(m.p.ctx, m.appointmentId, claimed.toISOString());
    return { status: moved.status, startsAt: moved.startsAt, endsAt: moved.endsAt };
  } catch (err) {
    // the move did not happen: the hold is given up, the booking stays as it was
    await withBookingTx(m.p.ctx.organizationId, (client) =>
      client.query(
        `UPDATE booking.public_hold SET state = 'expired', appointment_id = NULL
          WHERE id = $1 AND state = 'confirmed'`,
        [holdId],
      ),
    );
    if (
      err instanceof Conflict &&
      ['appointment_overlap', 'staff_unavailable', 'resource_unavailable'].includes(err.message)
    ) {
      throw new Conflict('slot_taken');
    }
    throw err;
  }
}

export type ManagedCancel = { status: 'cancelled'; late: boolean };

export async function cancelManagedBooking(
  slug: unknown,
  input: { token: unknown },
): Promise<ManagedCancel> {
  const m = await resolve(slug, input.token);
  const settings = await getBookingSettingsInOrg(m.p.ctx);
  const b = await withBookingTx(
    m.p.ctx.organizationId,
    (c) => readBooking(c, m.appointmentId),
    true,
  );
  refuse(judge(b, settings), false);
  const cancelled = await cancelAppointmentByClient(m.p.ctx, m.appointmentId);
  // a move hold left pending is given up with the booking
  await withBookingTx(m.p.ctx.organizationId, (client) =>
    client.query(
      `UPDATE booking.public_hold SET state = 'expired', settled_at = now()
        WHERE move_appointment_id = $1 AND state = 'pending'`,
      [m.appointmentId],
    ),
  );
  return { status: 'cancelled', late: cancelled.cancellation?.late === true };
}
