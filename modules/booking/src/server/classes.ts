import type { PoolClient } from 'pg';
import { AuditActions, appendAuditEventInTx, type AuditSqlExecutor } from '@ventora/audit';
import type { TenantContext } from '@ventora/access';
import { BookingAppointmentCreatedV1 } from '@ventora/contracts';
import { uuidv7, writeOutboxEvent } from '@ventora/db-kit';
import { Conflict, Forbidden, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { getOrganizationTimeZone } from '@ventora/organizations';
import { reserveQuota } from '@ventora/quota';
import { actorUserId, hubOnly, isPublicContext } from './actor';
import {
  AlreadyCreated,
  APPOINTMENT_COLUMNS,
  APPOINTMENTS_QUOTA_KEY,
  CLIENT_COLUMNS,
  MOVABLE,
  audit,
  cancelRow,
  changeAppointmentStatusInOrg,
  findAppointment,
  history,
  insertAppointmentRow,
  insertClient,
  readSettings,
  readStaffForBooking,
  requireBookableStaff,
  requireInstant,
  requireScope,
  requireWithinSchedule,
  settleQuota,
  toAppointment,
  tx,
  type Appointment,
  type AppointmentRow,
  type AppointmentScope,
  type AppointmentStatus,
  type ClientInput,
  type ClientRow,
  type PgError,
  type ServiceForBooking,
} from './appointments';
import { locationFilter } from './locations';
import { doesService } from './staff-services';
import { durationWithin, effectiveTermsFor } from './terms';
import { isUuid } from './validation';
import { sessionWaitlist, type WaitlistEntry } from './waitlist';

/*
 * Lot B.9d1 — classes and groups (design BookingClasses, S126; plan
 * reports/2026-11-12_plan-booking-b9.md). D-9d-1 (PROPUS): a class is a service with „Clienți în
 * același timp” > 1. A session sits in the calendar (the member, the room, the seats — from the
 * catalogue, changeable for the session); its participants are ordinary appointments tied to it
 * (class_session_id), one per client, each with its state, history and quota unit („Ocupate ·
 * 8/10”, „Plin”). The rules are in the database (migration booking_classes): the session holds its
 * member and one unit of its room; the participants are at most the seats.
 *
 *   createClassSessions   „Sesiune nouă”: class, member, room, seats, date and time, „Se repetă
 *                         săptămânal” (the sessions created together, all or none);
 *   listClassSessions     the calendar: „Pilates de grup · 8/10”, „2 locuri libere”, „Plin”;
 *   getClassSession       the Drawer: the session, the participants and their states;
 *   addClassParticipant   „Adaugă participant” (Conflict class_full when full);
 *   markClassAttendance   „Marchează: a venit / nu a venit”;
 *   cancelClassSession    „Anulează sesiunea…”: every open participant cancelled (the quota unit
 *                         back before the start), the session cancelled.
 * „Anulează participarea” is cancelAppointment. B.9d2 (server/class-waitlist.ts): the waiting list
 * of a session (D-9d-2, automatic offers) and the online booking of a seat (D-9d-3). A pending offer
 * and a pending online hold keep their seat: „Plin” counts them (seatsHeld).
 *
 * Audit (PROPUS, no new code): a session created or cancelled is booking.staff_schedule_updated on
 * the member (metadata kind class_session_created / class_session_cancelled, the ids); the
 * participants are the usual booking.appointment_* rows (with classSessionId).
 */

export const CLASS_LIMITS = {
  seatsMin: 2,
  seatsMax: 100,
  /** „Se repetă săptămânal”: at most this many sessions at once (D-9b-1: 52 or 12 months). */
  repeatMax: 52,
  listDays: 62,
} as const;

export type ClassSessionStatus = 'scheduled' | 'cancelled';

export type ClassSession = {
  id: string;
  serviceId: string;
  serviceName: string;
  staffMemberId: string;
  staffDisplayName: string;
  resourceId: string | null;
  resourceName: string | null;
  locationId: string | null;
  seats: number;
  /** The participants that hold a seat (not cancelled, not „Nu a venit”). */
  seatsTaken: number;
  /** B.9d2: the seats kept by a pending offer of the waiting list or a pending online booking. */
  seatsHeld: number;
  /** seats − taken − held (at least 0); „Plin” at 0. */
  seatsLeft: number;
  full: boolean;
  startsAt: Date;
  endsAt: Date;
  status: ClassSessionStatus;
  repeatGroupId: string | null;
  createdAt: Date;
};

export type ClassSessionDetail = {
  session: ClassSession;
  /** In the order they were added; the cancelled ones too (marked by their state). */
  participants: Appointment[];
  /** B.9d2: „Lista de așteptare”, in order (waiting or offered). */
  waitlist: WaitlistEntry[];
};

export type SessionRow = {
  id: string;
  service_id: string;
  service_name: string;
  staff_member_id: string;
  staff_display_name: string;
  staff_user_id: string;
  resource_id: string | null;
  resource_name: string | null;
  location_id: string | null;
  seats: number;
  seats_taken: number;
  seats_held: number;
  starts_at: Date;
  ends_at: Date;
  status: ClassSessionStatus;
  repeat_group_id: string | null;
  created_at: Date;
};

export const SESSION_SELECT = `
  SELECT s.id, s.service_id, sv.name AS service_name, s.staff_member_id,
         m.display_name AS staff_display_name, m.user_id AS staff_user_id, s.resource_id,
         r.name AS resource_name, s.location_id, s.seats,
         (SELECT count(*)::int FROM booking.appointment a
           WHERE a.class_session_id = s.id
             AND a.status IN ('awaiting_payment', 'unconfirmed', 'confirmed', 'in_progress',
                              'completed')) AS seats_taken,
         ((SELECT count(*)::int FROM booking.waitlist_offer o
            WHERE o.class_session_id = s.id AND o.state = 'pending' AND o.expires_at > now())
          + (SELECT count(*)::int FROM booking.public_hold h
              WHERE h.class_session_id = s.id AND h.state = 'pending'
                AND h.expires_at > now())) AS seats_held,
         s.starts_at, s.ends_at, s.status, s.repeat_group_id, s.created_at
    FROM booking.class_session s
    JOIN booking.service sv ON sv.id = s.service_id
    JOIN booking.staff_member m ON m.id = s.staff_member_id
    LEFT JOIN booking.resource r ON r.id = s.resource_id`;

export function toSession(r: SessionRow): ClassSession {
  return {
    id: r.id,
    serviceId: r.service_id,
    serviceName: r.service_name,
    staffMemberId: r.staff_member_id,
    staffDisplayName: r.staff_display_name,
    resourceId: r.resource_id,
    resourceName: r.resource_name,
    locationId: r.location_id,
    seats: r.seats,
    seatsTaken: r.seats_taken,
    seatsHeld: r.seats_held,
    seatsLeft: Math.max(0, r.seats - r.seats_taken - r.seats_held),
    full: r.seats_taken + r.seats_held >= r.seats,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    status: r.status,
    repeatGroupId: r.repeat_group_id,
    createdAt: r.created_at,
  };
}

export async function readSession(
  client: PoolClient,
  id: string,
  lock = false,
): Promise<SessionRow> {
  const { rows } = await client.query<SessionRow>(
    `${SESSION_SELECT} WHERE s.id = $1${lock ? ' FOR UPDATE OF s' : ''}`,
    [id],
  );
  if (!rows[0]) throw new ResourceNotFound();
  return rows[0];
}

function requireUuid(field: string, value: unknown): string {
  if (!isUuid(value)) throw new InvalidInput(field, 'invalid');
  return value;
}

function sessionAudit(
  exec: AuditSqlExecutor,
  ctx: TenantContext,
  staffMemberId: string,
  metadata: Record<string, unknown>,
) {
  return appendAuditEventInTx(exec, {
    category: 'booking',
    action: AuditActions.bookingStaffScheduleUpdated,
    outcome: 'success',
    actorType: 'user',
    actorId: actorUserId(ctx),
    organizationId: ctx.organizationId,
    targetType: 'booking_staff_member',
    targetId: staffMemberId,
    metadata,
  });
}

// ── sessions ─────────────────────────────────────────────────────────────────────────────

export type CreateClassSessionsInput = {
  /** A UUID chosen by the caller: the first session's id; a retry returns the same sessions. */
  id: unknown;
  serviceId: unknown;
  staffMemberId: unknown;
  /** The room (a resource), or absent. */
  resourceId?: unknown;
  /** From the catalogue by default (service.capacity). */
  seats?: unknown;
  startsAt: unknown;
  /** „Se repetă săptămânal”: how many sessions in all, every week at the same time (1–52). */
  repeatWeeks?: unknown;
  locationId?: unknown;
};

/**
 * „Sesiune nouă”: one session, or one each week („Se repetă săptămânal”), all in one transaction.
 * A session that does not fit (the member's schedule, another appointment or session, a blocked
 * time, no free unit of the room): Conflict('class_session_unavailable:<n>'), nothing written.
 */
export async function createClassSessionsInOrg(
  ctx: TenantContext,
  scope: AppointmentScope,
  input: CreateClassSessionsInput,
): Promise<ClassSession[]> {
  hubOnly(ctx);
  const firstId = requireUuid('id', input.id);
  const serviceId = requireUuid('serviceId', input.serviceId);
  const staffMemberId = requireUuid('staffMemberId', input.staffMemberId);
  const resourceId =
    input.resourceId === undefined || input.resourceId === null
      ? null
      : requireUuid('resourceId', input.resourceId);
  const startsAt = requireInstant('startsAt', input.startsAt);
  const weeks = input.repeatWeeks ?? 1;
  if (
    typeof weeks !== 'number' ||
    !Number.isInteger(weeks) ||
    weeks < 1 ||
    weeks > CLASS_LIMITS.repeatMax
  ) {
    throw new InvalidInput('repeatWeeks', 'invalid');
  }
  if (
    input.seats !== undefined &&
    (typeof input.seats !== 'number' ||
      !Number.isInteger(input.seats) ||
      input.seats < CLASS_LIMITS.seatsMin ||
      input.seats > CLASS_LIMITS.seatsMax)
  ) {
    throw new InvalidInput('seats', 'invalid');
  }
  const requestedLocation = await locationFilter(ctx, input.locationId);

  // a retry of the same operation: the same sessions
  const existing = await tx(
    ctx,
    async (client) => {
      const first = (
        await client.query<{ id: string; repeat_group_id: string | null }>(
          `SELECT id, repeat_group_id FROM booking.class_session WHERE id = $1`,
          [firstId],
        )
      ).rows[0];
      if (!first) return null;
      const { rows } = await client.query<SessionRow>(
        `${SESSION_SELECT} WHERE s.id = $1 OR (s.repeat_group_id = $2) ORDER BY s.starts_at`,
        [firstId, first.repeat_group_id],
      );
      return rows;
    },
    true,
  );
  if (existing) {
    if (existing[0]!.service_id !== serviceId || existing[0]!.staff_member_id !== staffMemberId) {
      throw new Conflict('operation_reused');
    }
    return existing.map(toSession);
  }

  const staff = await tx(ctx, (client) => readStaffForBooking(client, staffMemberId), true);
  requireScope(ctx, scope, staff);
  await requireBookableStaff(ctx, staff);
  if (requestedLocation && staff.location_id && staff.location_id !== requestedLocation) {
    throw new Conflict('staff_other_location');
  }
  const timeZone = await getOrganizationTimeZone(ctx);

  const ids = await tx(ctx, async (client, exec) => {
    const service = (
      await client.query<ServiceForBooking>(
        `SELECT id, name, duration_minutes, duration_max_minutes, price_kind, price_minor,
                price_max_minor, currency, capacity, archived_at
           FROM booking.service WHERE id = $1`,
        [serviceId],
      )
    ).rows[0];
    if (!service) throw new ResourceNotFound();
    if (service.archived_at) throw new Conflict('service_archived');
    // D-9d-1: a class is a service with more than one client at the same time
    if (service.capacity < 2) throw new Conflict('service_not_class');
    if (!(await doesService(client, staffMemberId, serviceId))) {
      throw new Conflict('staff_not_for_service');
    }
    const terms = (await effectiveTermsFor(client, serviceId, service, [staffMemberId])).get(
      staffMemberId,
    )!;
    const duration = durationWithin(terms, undefined)!;
    let locationId = staff.location_id ?? requestedLocation ?? null;
    if (resourceId) {
      const room = (
        await client.query<{ location_id: string | null; archived_at: Date | null }>(
          `SELECT location_id, archived_at FROM booking.resource WHERE id = $1`,
          [resourceId],
        )
      ).rows[0];
      if (!room) throw new ResourceNotFound();
      if (room.archived_at) throw new Conflict('resource_archived');
      if (room.location_id && locationId && room.location_id !== locationId) {
        throw new Conflict('resource_other_location');
      }
      locationId = locationId ?? room.location_id;
    }
    const seats = (input.seats as number | undefined) ?? service.capacity;
    const groupId = weeks > 1 ? firstId : null;
    const created: string[] = [];
    for (let n = 1; n <= weeks; n += 1) {
      const id = n === 1 ? firstId : uuidv7();
      // the same local time every week (the change of hour keeps the local time)
      const start =
        n === 1
          ? startsAt
          : (
              await client.query<{ at: Date }>(
                `SELECT (($1::timestamptz AT TIME ZONE $2) + make_interval(weeks => $3))
                          AT TIME ZONE $2 AS at`,
                [startsAt, timeZone, n - 1],
              )
            ).rows[0]!.at;
      const end = new Date(start.getTime() + duration * 60_000);
      try {
        await requireWithinSchedule(client, timeZone, staffMemberId, start, end);
        await client.query(
          `INSERT INTO booking.class_session
             (id, organization_id, service_id, staff_member_id, resource_id, location_id, seats,
              starts_at, ends_at, repeat_group_id, created_by_user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            id,
            ctx.organizationId,
            serviceId,
            staffMemberId,
            resourceId,
            locationId,
            seats,
            start,
            end,
            groupId,
            ctx.userId,
          ],
        );
      } catch (err) {
        const pg = err as PgError;
        if (
          pg?.code === '23P01' ||
          (err instanceof Conflict && err.message === 'staff_unavailable')
        ) {
          throw new Conflict(`class_session_unavailable:${n}`);
        }
        throw err;
      }
      created.push(id);
    }
    await sessionAudit(exec, ctx, staffMemberId, {
      kind: 'class_session_created',
      sessionIds: created,
      serviceId,
      ...(resourceId ? { resourceId } : {}),
    });
    return created;
  });
  return tx(
    ctx,
    async (client) =>
      (
        await client.query<SessionRow>(
          `${SESSION_SELECT} WHERE s.id = ANY($1::uuid[]) ORDER BY s.starts_at`,
          [ids],
        )
      ).rows.map(toSession),
    true,
  );
}

/** The calendar: the sessions in [from, to) (at most 62 days), by start. */
export async function listClassSessionsInOrg(
  ctx: TenantContext,
  input: { from: unknown; to: unknown; staffMemberId?: unknown; includeCancelled?: unknown },
): Promise<ClassSession[]> {
  hubOnly(ctx);
  const from = requireInstant('from', input.from);
  const to = requireInstant('to', input.to);
  if (to <= from) throw new InvalidInput('to', 'order');
  if (to.getTime() - from.getTime() > CLASS_LIMITS.listDays * 86_400_000) {
    throw new InvalidInput('to', 'too_long');
  }
  const staff =
    input.staffMemberId === undefined ? null : requireUuid('staffMemberId', input.staffMemberId);
  return tx(
    ctx,
    async (client) =>
      (
        await client.query<SessionRow>(
          `${SESSION_SELECT}
            WHERE s.starts_at < $2 AND s.ends_at > $1
              AND ($3::uuid IS NULL OR s.staff_member_id = $3)
              AND ($4 OR s.status = 'scheduled')
            ORDER BY s.starts_at, s.id`,
          [from, to, staff, input.includeCancelled === true],
        )
      ).rows.map(toSession),
    true,
  );
}

/** The Drawer „Clasă”: the session and its participants. */
export async function getClassSessionInOrg(
  ctx: TenantContext,
  sessionId: unknown,
): Promise<ClassSessionDetail> {
  hubOnly(ctx);
  if (!isUuid(sessionId)) throw new ResourceNotFound();
  return tx(
    ctx,
    async (client) => {
      const session = await readSession(client, sessionId);
      const participants = (
        await client.query<AppointmentRow>(
          `SELECT ${APPOINTMENT_COLUMNS} FROM booking.appointment
            WHERE class_session_id = $1 ORDER BY created_at, id`,
          [sessionId],
        )
      ).rows.map(toAppointment);
      return {
        session: toSession(session),
        participants,
        waitlist: await sessionWaitlist(client, sessionId),
      };
    },
    true,
  );
}

// ── participants ─────────────────────────────────────────────────────────────────────────

export type AddClassParticipantInput = {
  /** A UUID chosen by the caller: the participant's appointment id (and the quota operation). */
  id: unknown;
  clientId?: unknown;
  client?: ClientInput;
  confirmed?: unknown;
};

/**
 * „Adaugă participant”: an appointment tied to the session (its member, service, time, location;
 * capacity = the seats; no resource of its own). Full: Conflict('class_full'); the client already
 * holds a seat: Conflict('already_participant'). One quota unit, as any appointment.
 */
export async function addClassParticipantInOrg(
  ctx: TenantContext,
  scope: AppointmentScope,
  sessionId: unknown,
  input: AddClassParticipantInput,
): Promise<Appointment> {
  hubOnly(ctx);
  if (!isUuid(sessionId)) throw new ResourceNotFound();
  const id = requireUuid('id', input.id);
  if (input.confirmed !== undefined && typeof input.confirmed !== 'boolean') {
    throw new InvalidInput('confirmed', 'invalid');
  }
  const status: AppointmentStatus = input.confirmed === false ? 'unconfirmed' : 'confirmed';
  if (input.clientId === undefined && input.client === undefined) {
    throw new InvalidInput('clientId', 'required');
  }
  if (input.clientId !== undefined && !isUuid(input.clientId)) throw new ResourceNotFound();
  const clientId = (input.clientId as string | undefined) ?? null;

  const session = await tx(ctx, (client) => readSession(client, sessionId), true);
  requireScope(ctx, scope, { user_id: session.staff_user_id });
  return joinClassSession(ctx, sessionId, {
    id,
    clientId,
    client: input.client,
    status,
    teamNote: null,
  });
}

export type JoinClassSessionInput = {
  id: string;
  clientId: string | null;
  client?: ClientInput;
  status: AppointmentStatus;
  teamNote: string | null;
  /**
   * B.9d2: the seat the caller already keeps — its own pending offer (accepted from the waiting
   * list) or its own online hold (the code checked) — is not counted against it.
   */
  own?: { offerId?: string; holdId?: string };
  /** B.9d2: in the audit (waitlistOfferId). */
  auditExtra?: Record<string, string>;
};

/** The seats kept by pending offers and online holds, except the caller's own. */
async function seatsHeldExcept(
  client: PoolClient,
  sessionId: string,
  own: JoinClassSessionInput['own'],
): Promise<number> {
  return (
    await client.query<{ n: number }>(
      `SELECT ((SELECT count(*) FROM booking.waitlist_offer o
                 WHERE o.class_session_id = $1 AND o.state = 'pending' AND o.expires_at > now()
                   AND o.id IS DISTINCT FROM $2::uuid)
             + (SELECT count(*) FROM booking.public_hold h
                 WHERE h.class_session_id = $1 AND h.state = 'pending' AND h.expires_at > now()
                   AND h.id IS DISTINCT FROM $3::uuid))::int AS n`,
      [sessionId, own?.offerId ?? null, own?.holdId ?? null],
    )
  ).rows[0]!.n;
}

/**
 * A participant of a session (the Hub's „Adaugă participant”; B.9d2: an offer accepted or an online
 * booking): an appointment tied to the session (its member, service, time, location; capacity =
 * the seats; no resource of its own), one quota unit. Full (the seats kept by others count):
 * Conflict('class_full'); already holding a seat: Conflict('already_participant'). The caller checks
 * who may do it (scope, public context).
 */
export async function joinClassSession(
  ctx: TenantContext,
  sessionId: string,
  input: JoinClassSessionInput,
): Promise<Appointment> {
  const { id, clientId, status } = input;
  const existing = await findAppointment(ctx, id);
  if (existing) {
    if (existing.class_session_id !== sessionId) throw new Conflict('operation_reused');
    await settleQuota(ctx, id, 'commit');
    return toAppointment(existing);
  }
  const session = await tx(ctx, (client) => readSession(client, sessionId), true);
  if (session.status !== 'scheduled') throw new Conflict('class_session_cancelled');

  await reserveQuota(ctx, APPOINTMENTS_QUOTA_KEY, 1, id);
  let created: Appointment;
  try {
    created = await tx(ctx, async (client, exec) => {
      const s = await readSession(client, sessionId, true);
      if (s.status !== 'scheduled') throw new Conflict('class_session_cancelled');
      if (s.seats_taken + (await seatsHeldExcept(client, sessionId, input.own)) >= s.seats) {
        throw new Conflict('class_full');
      }
      let clientRow: ClientRow;
      if (clientId) {
        const found = (
          await client.query<ClientRow>(
            `SELECT ${CLIENT_COLUMNS} FROM booking.client WHERE id = $1`,
            [clientId],
          )
        ).rows[0];
        if (!found) throw new ResourceNotFound();
        if (found.archived_at) throw new Conflict('client_archived');
        clientRow = found;
      } else {
        clientRow = await insertClient(client, exec, ctx, input.client ?? {});
      }
      const already = await client.query(
        `SELECT 1 FROM booking.appointment
          WHERE class_session_id = $1 AND client_id = $2
            AND status IN ('awaiting_payment', 'unconfirmed', 'confirmed', 'in_progress',
                           'completed')`,
        [sessionId, clientRow.id],
      );
      if (already.rowCount! > 0) throw new Conflict('already_participant');
      const service = (
        await client.query<ServiceForBooking>(
          `SELECT id, name, duration_minutes, duration_max_minutes, price_kind, price_minor,
                  price_max_minor, currency, capacity, archived_at
             FROM booking.service WHERE id = $1`,
          [s.service_id],
        )
      ).rows[0]!;
      const terms = (
        await effectiveTermsFor(client, s.service_id, service, [s.staff_member_id])
      ).get(s.staff_member_id)!;
      const duration = Math.round((s.ends_at.getTime() - s.starts_at.getTime()) / 60_000);
      let inserted: Awaited<ReturnType<typeof insertAppointmentRow>>;
      try {
        inserted = await insertAppointmentRow(client, ctx, {
          id,
          staffMemberId: s.staff_member_id,
          staffDisplayName: s.staff_display_name,
          service,
          client: clientRow,
          startsAt: s.starts_at,
          endsAt: s.ends_at,
          duration,
          status,
          price: terms,
          teamNote: input.teamNote,
          locationId: s.location_id,
          visit: null,
          classSession: { id: sessionId, seats: s.seats },
        });
      } catch (err) {
        // the seats taken in the meantime (the trigger counts the participants)
        if ((err as PgError)?.code === '23P01') throw new Conflict('class_full');
        throw err;
      }
      if (!inserted.row) throw new AlreadyCreated();
      await history(client, ctx, id, {
        kind: 'created',
        to: status,
        startsAt: s.starts_at,
        endsAt: s.ends_at,
        staffMemberId: s.staff_member_id,
      });
      await audit(exec, ctx, AuditActions.bookingAppointmentCreated, 'booking_appointment', id, {
        number: inserted.number,
        staffMemberId: s.staff_member_id,
        serviceId: s.service_id,
        clientId: clientRow.id,
        startsAt: s.starts_at.toISOString(),
        durationMinutes: duration,
        status,
        classSessionId: sessionId,
        ...(s.location_id ? { locationId: s.location_id } : {}),
        ...input.auditExtra,
      });
      await writeOutboxEvent(client, 'booking', BookingAppointmentCreatedV1, {
        organizationId: ctx.organizationId,
        sourceApp: 'platform',
        resourceId: id,
        payload: {
          appointmentId: id,
          number: inserted.number,
          staffMemberId: s.staff_member_id,
          serviceId: s.service_id,
          clientId: clientRow.id,
          startsAt: s.starts_at.toISOString(),
          endsAt: s.ends_at.toISOString(),
          status,
          source: isPublicContext(ctx) ? 'public' : 'hub',
        },
      });
      return toAppointment(inserted.row);
    });
  } catch (err) {
    if (!(err instanceof AlreadyCreated)) {
      await settleQuota(ctx, id, 'release');
      throw err;
    }
    const again = await findAppointment(ctx, id);
    if (!again || again.class_session_id !== sessionId) throw new Conflict('operation_reused');
    return toAppointment(again);
  }
  await settleQuota(ctx, id, 'commit');
  return created;
}

/**
 * „Marchează: a venit / nu a venit”. A venit: the participant goes through the states of
 * BookingStatuses up to „Încheiată” (confirm, start, complete; each with its history and audit);
 * Nu a venit: only after the start (as for any appointment).
 */
export async function markClassAttendanceInOrg(
  ctx: TenantContext,
  scope: AppointmentScope,
  appointmentId: unknown,
  attended: unknown,
): Promise<Appointment> {
  hubOnly(ctx);
  if (typeof attended !== 'boolean') throw new InvalidInput('attended', 'invalid');
  if (!isUuid(appointmentId)) throw new ResourceNotFound();
  const row = await findAppointment(ctx, appointmentId);
  if (!row) throw new ResourceNotFound();
  if (!row.class_session_id) throw new Conflict('not_in_class');
  if (!attended) return changeAppointmentStatusInOrg(ctx, scope, appointmentId, 'no_show');
  const steps: Array<'confirmed' | 'in_progress' | 'completed'> =
    row.status === 'unconfirmed'
      ? ['confirmed', 'in_progress', 'completed']
      : row.status === 'confirmed'
        ? ['in_progress', 'completed']
        : row.status === 'in_progress'
          ? ['completed']
          : [];
  if (steps.length === 0) throw new Conflict('transition_not_allowed');
  let last: Appointment | null = null;
  for (const to of steps) last = await changeAppointmentStatusInOrg(ctx, scope, appointmentId, to);
  return last!;
}

/**
 * „Anulează sesiunea…”: every open participant cancelled by the business (each with its history,
 * its event — the quota unit back before the start — and its audit), then the session. A
 * participant in progress: Conflict('transition_not_allowed'), nothing cancelled.
 */
export async function cancelClassSessionInOrg(
  ctx: TenantContext,
  scope: AppointmentScope,
  sessionId: unknown,
): Promise<ClassSessionDetail> {
  hubOnly(ctx);
  if (!isUuid(sessionId)) throw new ResourceNotFound();
  await tx(ctx, async (client, exec) => {
    const s = await readSession(client, sessionId, true);
    if (scope === 'own' && s.staff_user_id !== ctx.userId) throw new Forbidden();
    if (s.status === 'cancelled') throw new Conflict('class_session_cancelled');
    const participants = (
      await client.query<AppointmentRow>(
        `SELECT ${APPOINTMENT_COLUMNS} FROM booking.appointment
          WHERE class_session_id = $1 ORDER BY created_at, id FOR UPDATE`,
        [sessionId],
      )
    ).rows;
    if (participants.some((p) => p.status === 'in_progress')) {
      throw new Conflict('transition_not_allowed');
    }
    const settings = await readSettings(client);
    const open = participants.filter((p) => MOVABLE.includes(p.status));
    for (const p of open) {
      await cancelRow(client, exec, ctx, p, 'business', settings, { classSessionId: sessionId });
    }
    await client.query(
      `UPDATE booking.class_session
          SET status = 'cancelled', cancelled_at = now(), cancelled_by_user_id = $2
        WHERE id = $1`,
      [sessionId, ctx.userId],
    );
    // B.9d2: the waiting list of the session closes (the open offers withdrawn, their links stop)
    await client.query(
      `UPDATE booking.waitlist_offer SET state = 'withdrawn', closed_at = now()
        WHERE class_session_id = $1 AND state = 'pending'`,
      [sessionId],
    );
    const waitlistClosed = await client.query(
      `UPDATE booking.waitlist_entry
          SET status = 'removed', removed_at = now(), removed_by_user_id = $2, updated_at = now()
        WHERE class_session_id = $1 AND status IN ('waiting', 'offered')`,
      [sessionId, ctx.userId],
    );
    await sessionAudit(exec, ctx, s.staff_member_id, {
      kind: 'class_session_cancelled',
      sessionId,
      participantsCancelled: open.length,
      waitlistClosed: waitlistClosed.rowCount ?? 0,
    });
  });
  return getClassSessionInOrg(ctx, sessionId);
}
