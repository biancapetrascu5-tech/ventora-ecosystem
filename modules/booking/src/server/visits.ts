import type { PoolClient } from 'pg';
import { AuditActions } from '@ventora/audit';
import type { TenantContext } from '@ventora/access';
import { BookingAppointmentChangedV1, BookingAppointmentCreatedV1 } from '@ventora/contracts';
import { writeOutboxEvent } from '@ventora/db-kit';
import { Conflict, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { getOrganizationTimeZone } from '@ventora/organizations';
import { reserveQuota } from '@ventora/quota';
import {
  AlreadyCreated,
  APPOINTMENT_COLUMNS,
  APPOINTMENT_LIMITS,
  APPOINTMENTS_QUOTA_KEY,
  CLIENT_COLUMNS,
  MOVABLE,
  audit,
  cancelRow,
  history,
  insertAppointmentRow,
  insertClient,
  normalizeOptionalText,
  readSettings,
  readStaffForBooking,
  requireBookableStaff,
  requireDuration,
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
  type StaffForBooking,
} from './appointments';
import { visitStartOn, type VisitStart } from './availability';
import { locationFilter } from './locations';
import { hubOnly } from './actor';
import { requireLocalDate } from './schedule';
import { doesService } from './staff-services';
import { durationWithin, effectiveTermsFor } from './terms';
import { isUuid } from './validation';

/*
 * Lot B.9a — several services in one visit (design BookingMultiService, S126; plan
 * reports/2026-11-12_plan-booking-b9.md). Every step is an ordinary appointment (its member, its
 * column in the calendar, its states, its history), with four columns that hold the visit
 * together: visit_id, visit_step (1..n), visit_steps (n), break_after_minutes (0/5/10/15/30, 0 on
 * the last step). No new table, no new GRANT (the columns are written only at creation).
 *
 * The decisions (PROPUS until the founder confirms):
 *   T-9a-1  the quota booking.appointments: one unit per step (the step's id is the operationId,
 *           so the reservation, the commit, the reconciliation and the refund of a cancellation
 *           before the start work as for any appointment);
 *   T-9a-2  no „Oricine e liber” on a step: each step has its member;
 *   T-9a-3  2–5 steps;
 *   D-9a-1  the visit is moved or cancelled whole (moveVisit, cancelVisit); one step alone only from
 *           its detail, by the team (moveAppointment / cancelAppointment); the client's page does
 *           not change a step (B.11b: 'online_closed');
 *   D-9a-2  not on the public page in the pilot.
 *
 * The steps are written in one transaction with the checks of a new appointment (the member's
 * schedule, the overlaps, the resources, the location). A step that does not fit:
 * Conflict('visit_step_unavailable:<n>'), and findVisitStart gives the first start that day at
 * which every step fits („Folosește 11:15”).
 */

export const VISIT_LIMITS = {
  stepsMin: 2,
  stepsMax: 5,
  breaks: [0, 5, 10, 15, 30],
} as const;

export type VisitStepInput = {
  /** A UUID chosen by the caller: the step's appointment id (and the quota's operationId). */
  id: unknown;
  staffMemberId: unknown;
  serviceId: unknown;
  durationMinutes?: unknown;
  /** The pause after the step: 0, 5, 10, 15 or 30 minutes (0 or absent on the last step). */
  breakAfterMinutes?: unknown;
};

export type CreateVisitInput = {
  /** A UUID chosen by the caller: a retry with the same id returns the same visit. */
  id: unknown;
  clientId?: unknown;
  client?: ClientInput;
  /** The start of the first step. */
  startsAt: unknown;
  steps: unknown;
  confirmed?: unknown;
  teamNote?: unknown;
  locationId?: unknown;
};

export type Visit = {
  id: string;
  clientId: string;
  clientName: string;
  startsAt: Date;
  endsAt: Date;
  /** From the start of the first step to the end of the last one, the pauses included. */
  totalMinutes: number;
  /** The sum of the steps' prices; null when the steps are in different currencies. */
  price: {
    kind: 'fixed' | 'from' | 'range';
    minor: number;
    maxMinor: number | null;
    currency: 'RON' | 'EUR';
  } | null;
  steps: Appointment[];
};

type Step = {
  n: number;
  id: string;
  staffMemberId: string;
  serviceId: string;
  durationMinutes: unknown;
  breakAfterMinutes: number;
};

function requireVisitId(id: unknown): string {
  if (!isUuid(id)) throw new ResourceNotFound();
  return id;
}

function requireSteps(raw: unknown, visitId: string | null): Step[] {
  if (!Array.isArray(raw)) throw new InvalidInput('steps', 'required');
  if (raw.length < VISIT_LIMITS.stepsMin) throw new InvalidInput('steps', 'too_few');
  if (raw.length > VISIT_LIMITS.stepsMax) throw new InvalidInput('steps', 'too_many');
  const seen = new Set<string>(visitId ? [visitId] : []);
  return raw.map((value, i) => {
    const s = (value ?? {}) as VisitStepInput;
    const n = i + 1;
    const field = (name: string) => `steps.${n}.${name}`;
    if (visitId !== null) {
      if (!isUuid(s.id) || seen.has(s.id)) throw new InvalidInput(field('id'), 'invalid');
      seen.add(s.id);
    }
    // T-9a-2: no „Oricine e liber” on a step
    if (!isUuid(s.staffMemberId)) throw new InvalidInput(field('staffMemberId'), 'invalid');
    if (!isUuid(s.serviceId)) throw new InvalidInput(field('serviceId'), 'invalid');
    if (s.durationMinutes !== undefined) {
      try {
        requireDuration(s.durationMinutes);
      } catch {
        throw new InvalidInput(field('durationMinutes'), 'invalid');
      }
    }
    const last = n === raw.length;
    const brk = s.breakAfterMinutes ?? 0;
    if (
      typeof brk !== 'number' ||
      !(VISIT_LIMITS.breaks as readonly number[]).includes(brk) ||
      (last && brk !== 0)
    ) {
      throw new InvalidInput(field('breakAfterMinutes'), 'invalid');
    }
    return {
      n,
      id: visitId === null ? '' : (s.id as string),
      staffMemberId: s.staffMemberId,
      serviceId: s.serviceId,
      durationMinutes: s.durationMinutes,
      breakAfterMinutes: brk,
    };
  });
}

/** A step that does not fit, with its number (the screen marks it). */
function stepConflict(n: number, err: unknown): never {
  const pg = err as PgError;
  if (
    pg?.code === '23P01' ||
    (err instanceof Conflict &&
      (err.message === 'staff_unavailable' || err.message === 'resource_unavailable'))
  ) {
    throw new Conflict(`visit_step_unavailable:${n}`);
  }
  throw err;
}

async function readVisitRows(
  client: PoolClient,
  visitId: string,
  lock = false,
): Promise<Array<AppointmentRow & { staff_user_id: string }>> {
  const { rows } = await client.query<AppointmentRow & { staff_user_id: string }>(
    `SELECT ${APPOINTMENT_COLUMNS.split(',')
      .map((c) => `a.${c.trim()}`)
      .join(', ')}, m.user_id AS staff_user_id
       FROM booking.appointment a
       JOIN booking.staff_member m ON m.id = a.staff_member_id
      WHERE a.visit_id = $1
      ORDER BY a.visit_step${lock ? ' FOR UPDATE OF a' : ''}`,
    [visitId],
  );
  return rows;
}

function toVisit(rows: AppointmentRow[]): Visit {
  const steps = rows.map(toAppointment);
  const first = steps[0]!;
  const last = steps[steps.length - 1]!;
  const currencies = new Set(steps.map((s) => s.price.currency));
  let price: Visit['price'] = null;
  if (currencies.size === 1) {
    const kinds = new Set(steps.map((s) => s.price.kind));
    const kind =
      kinds.size === 1 && kinds.has('fixed') ? 'fixed' : kinds.has('from') ? 'from' : 'range';
    price = {
      kind,
      minor: steps.reduce((sum, s) => sum + s.price.minor, 0),
      maxMinor:
        kind === 'range'
          ? steps.reduce((sum, s) => sum + (s.price.maxMinor ?? s.price.minor), 0)
          : null,
      currency: first.price.currency,
    };
  }
  return {
    id: first.visit!.id,
    clientId: first.clientId,
    clientName: first.clientName,
    startsAt: first.startsAt,
    endsAt: last.endsAt,
    totalMinutes: Math.round((last.endsAt.getTime() - first.startsAt.getTime()) / 60_000),
    price,
    steps,
  };
}

/** The same visit asked again: the same steps (ids, members, services) and the same start. */
function sameVisit(rows: AppointmentRow[], steps: Step[], startsAt: Date): boolean {
  return (
    rows.length === steps.length &&
    rows[0]!.starts_at.getTime() === startsAt.getTime() &&
    rows.every(
      (r, i) =>
        r.id === steps[i]!.id &&
        r.staff_member_id === steps[i]!.staffMemberId &&
        r.service_id === steps[i]!.serviceId,
    )
  );
}

// ── create ───────────────────────────────────────────────────────────────────────────────

/**
 * „Programare nouă” with „+ Adaugă încă un serviciu” (BookingMultiService): the client, the start
 * and 2–5 steps (service + member, the duration, the pause after). Each step starts when the one
 * before ends plus its pause. All the steps in one transaction, with the checks of a new
 * appointment; the quota first, one unit per step (T-9a-1): at the limit nothing is written.
 */
export async function createVisitInOrg(
  ctx: TenantContext,
  scope: AppointmentScope,
  input: CreateVisitInput,
): Promise<Visit> {
  hubOnly(ctx);
  if (!isUuid(input.id)) throw new InvalidInput('id', 'invalid');
  const visitId = input.id;
  const steps = requireSteps(input.steps, visitId);
  const startsAt = requireInstant('startsAt', input.startsAt);
  const teamNote = normalizeOptionalText('teamNote', input.teamNote, APPOINTMENT_LIMITS.teamNote);
  if (input.confirmed !== undefined && typeof input.confirmed !== 'boolean') {
    throw new InvalidInput('confirmed', 'invalid');
  }
  const status: AppointmentStatus = input.confirmed === false ? 'unconfirmed' : 'confirmed';
  if (input.clientId === undefined && input.client === undefined) {
    throw new InvalidInput('clientId', 'required');
  }
  const clientId = input.clientId === undefined ? null : requireVisitId(input.clientId);
  const requestedLocation = await locationFilter(ctx, input.locationId);

  // a retry of the same operation: the same visit, nothing written twice
  const existing = await tx(ctx, (client) => readVisitRows(client, visitId), true);
  if (existing.length > 0) {
    if (!sameVisit(existing, steps, startsAt)) throw new Conflict('operation_reused');
    for (const s of steps) await settleQuota(ctx, s.id, 'commit');
    return toVisit(existing);
  }
  // a step id used by another appointment
  const used = await tx(
    ctx,
    async (client) =>
      (
        await client.query(`SELECT 1 FROM booking.appointment WHERE id = ANY($1::uuid[])`, [
          steps.map((s) => s.id),
        ])
      ).rowCount! > 0,
    true,
  );
  if (used) throw new Conflict('operation_reused');

  // the members: in the calendar, eligible, in scope, at one location for the whole visit
  const staffById = new Map<string, StaffForBooking>();
  for (const s of steps) {
    if (staffById.has(s.staffMemberId)) continue;
    const staff = await tx(ctx, (client) => readStaffForBooking(client, s.staffMemberId), true);
    requireScope(ctx, scope, staff);
    await requireBookableStaff(ctx, staff);
    staffById.set(s.staffMemberId, staff);
  }
  const placed = [...staffById.values()].map((s) => s.location_id).filter((l) => l !== null);
  const locationId = requestedLocation ?? placed[0] ?? null;
  if (placed.some((l) => l !== locationId)) throw new Conflict('staff_other_location');
  const timeZone = await getOrganizationTimeZone(ctx);

  // T-9a-1: one unit per step, reserved first; a refusal gives the reserved ones back
  const reserved: string[] = [];
  try {
    for (const s of steps) {
      await reserveQuota(ctx, APPOINTMENTS_QUOTA_KEY, 1, s.id);
      reserved.push(s.id);
    }
  } catch (err) {
    for (const id of reserved) await settleQuota(ctx, id, 'release');
    throw err;
  }

  let rows: AppointmentRow[];
  try {
    rows = await tx(ctx, async (client, exec) => {
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

      const out: AppointmentRow[] = [];
      let at = startsAt;
      for (const s of steps) {
        const staff = staffById.get(s.staffMemberId)!;
        const service = (
          await client.query<ServiceForBooking>(
            `SELECT id, name, duration_minutes, duration_max_minutes, price_kind, price_minor,
                    price_max_minor, currency, capacity, archived_at
               FROM booking.service WHERE id = $1`,
            [s.serviceId],
          )
        ).rows[0];
        if (!service) throw new ResourceNotFound();
        if (service.archived_at) throw new Conflict('service_archived');
        // B.2b (S129): the member must do the service
        if (!(await doesService(client, s.staffMemberId, s.serviceId))) {
          throw new Conflict('staff_not_for_service');
        }
        // B.2c: the member's own duration and price for the service
        const terms = (
          await effectiveTermsFor(client, s.serviceId, service, [s.staffMemberId])
        ).get(s.staffMemberId)!;
        const duration = durationWithin(terms, s.durationMinutes);
        if (duration === null) throw new InvalidInput(`steps.${s.n}.durationMinutes`, 'invalid');
        const endsAt = new Date(at.getTime() + duration * 60_000);
        let inserted: Awaited<ReturnType<typeof insertAppointmentRow>>;
        try {
          await requireWithinSchedule(client, timeZone, s.staffMemberId, at, endsAt);
          inserted = await insertAppointmentRow(client, ctx, {
            id: s.id,
            staffMemberId: s.staffMemberId,
            staffDisplayName: staff.display_name,
            service,
            client: clientRow,
            startsAt: at,
            endsAt,
            duration,
            status,
            price: terms,
            teamNote,
            locationId,
            visit: {
              id: visitId,
              step: s.n,
              steps: steps.length,
              breakAfterMinutes: s.breakAfterMinutes,
            },
          });
        } catch (err) {
          stepConflict(s.n, err);
        }
        // a concurrent retry of the same visit got there first
        if (!inserted.row) throw new AlreadyCreated();
        const row = inserted.row;
        await history(client, ctx, s.id, {
          kind: 'created',
          to: status,
          startsAt: at,
          endsAt,
          staffMemberId: s.staffMemberId,
        });
        await audit(
          exec,
          ctx,
          AuditActions.bookingAppointmentCreated,
          'booking_appointment',
          s.id,
          {
            number: inserted.number,
            staffMemberId: s.staffMemberId,
            serviceId: s.serviceId,
            clientId: clientRow.id,
            startsAt: at.toISOString(),
            durationMinutes: duration,
            status,
            visitId,
            visitStep: s.n,
            ...(inserted.resources.length
              ? { resourceIds: inserted.resources.map((r) => r.id) }
              : {}),
            ...(locationId ? { locationId } : {}),
          },
        );
        await writeOutboxEvent(client, 'booking', BookingAppointmentCreatedV1, {
          organizationId: ctx.organizationId,
          sourceApp: 'platform',
          resourceId: s.id,
          payload: {
            appointmentId: s.id,
            number: inserted.number,
            staffMemberId: s.staffMemberId,
            serviceId: s.serviceId,
            clientId: clientRow.id,
            startsAt: at.toISOString(),
            endsAt: endsAt.toISOString(),
            status,
            source: 'hub',
          },
        });
        out.push(row);
        at = new Date(endsAt.getTime() + s.breakAfterMinutes * 60_000);
      }
      return out;
    });
  } catch (err) {
    if (!(err instanceof AlreadyCreated)) {
      // nothing was written: every reserved unit goes back
      for (const s of steps) await settleQuota(ctx, s.id, 'release');
      throw err;
    }
    const again = await tx(ctx, (client) => readVisitRows(client, visitId), true);
    if (again.length === 0 || !sameVisit(again, steps, startsAt)) {
      throw new Conflict('operation_reused');
    }
    return toVisit(again);
  }
  for (const s of steps) await settleQuota(ctx, s.id, 'commit');
  return toVisit(rows);
}

// ── read ─────────────────────────────────────────────────────────────────────────────────

/** BookingDetail of a visit: the steps in order, the total time with the pauses, the total price. */
export async function getVisitInOrg(ctx: TenantContext, visitId: unknown): Promise<Visit> {
  hubOnly(ctx);
  const id = requireVisitId(visitId);
  const rows = await tx(ctx, (client) => readVisitRows(client, id), true);
  if (rows.length === 0) throw new ResourceNotFound();
  return toVisit(rows);
}

export type FindVisitStartInput = {
  /** The local date (YYYY-MM-DD) in the business time zone. */
  date: unknown;
  /** The steps as for createVisit, without ids. */
  steps: unknown;
  locationId?: unknown;
};

/** „Folosește 11:15”: the first start that day at which every step fits; null: none. */
export async function findVisitStartInOrg(
  ctx: TenantContext,
  input: FindVisitStartInput,
): Promise<VisitStart | null> {
  hubOnly(ctx);
  const date = requireLocalDate('date', input.date);
  const steps = requireSteps(input.steps, null);
  const locationId = await locationFilter(ctx, input.locationId);
  return visitStartOn(ctx, {
    date,
    steps: steps.map((s) => ({
      staffMemberId: s.staffMemberId,
      serviceId: s.serviceId,
      durationMinutes: s.durationMinutes,
      breakAfterMinutes: s.breakAfterMinutes,
    })),
    locationId,
  });
}

// ── move / cancel the whole visit (D-9a-1) ───────────────────────────────────────────────

/**
 * „Mută vizita”: every step that still holds its time moves by the same amount (the members, the
 * durations and the pauses stay). A step in progress or finished: Conflict('appointment_final');
 * the cancelled steps stay where they were. A step that no longer fits:
 * Conflict('visit_step_unavailable:<n>'), nothing moved.
 */
export async function moveVisitInOrg(
  ctx: TenantContext,
  scope: AppointmentScope,
  visitId: unknown,
  input: { startsAt: unknown },
): Promise<Visit> {
  hubOnly(ctx);
  const id = requireVisitId(visitId);
  const startsAt = requireInstant('startsAt', input.startsAt);
  const timeZone = await getOrganizationTimeZone(ctx);
  return tx(ctx, async (client, exec) => {
    const rows = await readVisitRows(client, id, true);
    if (rows.length === 0) throw new ResourceNotFound();
    const active = rows.filter((r) => r.status !== 'cancelled');
    for (const r of rows) requireScope(ctx, scope, { user_id: r.staff_user_id });
    if (active.length === 0 || active.some((r) => !MOVABLE.includes(r.status))) {
      throw new Conflict('appointment_final');
    }
    const delta = startsAt.getTime() - active[0]!.starts_at.getTime();
    if (delta === 0) return toVisit(rows);
    // later steps first when moving later (and the reverse): a step never meets its own visit
    const order = delta > 0 ? [...active].reverse() : active;
    for (const r of order) {
      const s = new Date(r.starts_at.getTime() + delta);
      const e = new Date(r.ends_at.getTime() + delta);
      try {
        await requireWithinSchedule(client, timeZone, r.staff_member_id, s, e);
        await client.query(
          `UPDATE booking.appointment SET starts_at = $2, ends_at = $3 WHERE id = $1`,
          [r.id, s, e],
        );
      } catch (err) {
        stepConflict(r.visit_step!, err);
      }
      await history(client, ctx, r.id, {
        kind: 'moved',
        startsAt: s,
        endsAt: e,
        staffMemberId: r.staff_member_id,
      });
      await writeOutboxEvent(client, 'booking', BookingAppointmentChangedV1, {
        organizationId: ctx.organizationId,
        sourceApp: 'platform',
        resourceId: r.id,
        payload: {
          appointmentId: r.id,
          staffMemberId: r.staff_member_id,
          startsAt: s.toISOString(),
          endsAt: e.toISOString(),
          previousStaffMemberId: r.staff_member_id,
          previousStartsAt: r.starts_at.toISOString(),
        },
      });
      await audit(exec, ctx, AuditActions.bookingAppointmentMoved, 'booking_appointment', r.id, {
        from: {
          startsAt: r.starts_at.toISOString(),
          staffMemberId: r.staff_member_id,
          durationMinutes: r.duration_minutes,
        },
        to: {
          startsAt: s.toISOString(),
          staffMemberId: r.staff_member_id,
          durationMinutes: r.duration_minutes,
        },
        visitId: id,
      });
    }
    return toVisit(await readVisitRows(client, id));
  });
}

/**
 * „Anulează vizita”: every step that can still be cancelled, in one transaction (each with its
 * history, its event — the quota unit back before the start — and its audit). A step in progress:
 * Conflict('transition_not_allowed'), nothing cancelled; the finished steps stay as they are.
 */
export async function cancelVisitInOrg(
  ctx: TenantContext,
  scope: AppointmentScope,
  visitId: unknown,
  by: unknown,
): Promise<Visit> {
  hubOnly(ctx);
  const id = requireVisitId(visitId);
  if (by !== 'client' && by !== 'business') throw new InvalidInput('by', 'invalid');
  return tx(ctx, async (client, exec) => {
    const rows = await readVisitRows(client, id, true);
    if (rows.length === 0) throw new ResourceNotFound();
    for (const r of rows) requireScope(ctx, scope, { user_id: r.staff_user_id });
    if (rows.some((r) => r.status === 'in_progress')) throw new Conflict('transition_not_allowed');
    const open = rows.filter((r) => MOVABLE.includes(r.status));
    if (open.length === 0) throw new Conflict('appointment_final');
    const settings = await readSettings(client);
    for (const r of open) await cancelRow(client, exec, ctx, r, by, settings, id);
    return toVisit(await readVisitRows(client, id));
  });
}
