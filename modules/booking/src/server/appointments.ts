import type { PoolClient } from 'pg';
import { AuditActions, appendAuditEventInTx, type AuditSqlExecutor } from '@ventora/audit';
import type { TenantContext } from '@ventora/access';
import {
  BookingAppointmentCancelledV1,
  BookingAppointmentChangedV1,
  BookingAppointmentCompletedV1,
  BookingAppointmentCreatedV1,
  BookingAppointmentNoShowV1,
  BookingClientCreatedV1,
  BookingClientUpdatedV1,
} from '@ventora/contracts';
import { uuidv7, writeOutboxEvent } from '@ventora/db-kit';
import { Conflict, Forbidden, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { getOrganizationTimeZone } from '@ventora/organizations';
import { commitQuota, releaseQuota, reserveQuota } from '@ventora/quota';
import { withBookingTx } from './db';
import { staffFreeAtInOrg } from './availability';
import { requiredResources } from './resources';
import { locationFilter } from './locations';
import { actorUserId, clientOnly, isPublicContext, hubOnly } from './actor';
import { doesService, staffForService } from './staff-services';
import { durationWithin, effectiveTermsFor, type EffectiveTerms } from './terms';
import { staffDayIntervals, staffEligibility } from './staff';
import { isUuid, LIMITS } from './validation';

/*
 * Lot B.4a — the appointments and their 7 states (BOOKING.md §3 B.4; plan
 * reports/2026-11-09_2150_plan-booking-b4.md, approved 09.11.2026; design BookingStatuses, S116).
 * Every write runs in one transaction as booking_rw with the organization of the authorized
 * context, with its history row (D-B4-7) and its audit row (category booking, codes C.0d) in the
 * same transaction. No physical delete.
 *
 * The rules that must hold whoever writes are in the database (booking_appointments): the allowed
 * transitions, „Nu a venit” only after the start, the correction only between „Încheiată” and „Nu a
 * venit” (D-B4-11 = a), no overlap for the same member (D-B4-2 = a: the member's row is locked and
 * the overlaps counted; D-B4-3 = a: service.capacity clients at once for the same service). The
 * contract checks the same first, so the screen gets a precise reason; a race that slips past it
 * still meets the trigger (Conflict appointment_overlap / transition_not_allowed).
 *
 * B.4b: the quota booking.appointments (plan §5, ARCHITECTURE §6.4 g–h, §8.3) — reserve with the
 * appointment's id as operationId, the transaction, commit; release when the transaction fails;
 * the reconciliation resolver (appointmentExists) settles a process stopped between the steps.
 * The outbox events booking.appointment.* are written in the same transaction (T6); the refund of
 * a cancellation before the start is done by the consumer of booking.appointment.cancelled.
 */

export const APPOINTMENTS_QUOTA_KEY = 'booking.appointments';

export const APPOINTMENT_STATUSES = [
  'awaiting_payment',
  'unconfirmed',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/** The states that hold the member's time (the others are final). */
export const OCCUPYING: readonly AppointmentStatus[] = [
  'awaiting_payment',
  'unconfirmed',
  'confirmed',
  'in_progress',
];
export const FINAL: readonly AppointmentStatus[] = ['completed', 'cancelled', 'no_show'];
export const MOVABLE: readonly AppointmentStatus[] = [
  'awaiting_payment',
  'unconfirmed',
  'confirmed',
];

/** BookingStatuses: what the drawer offers from each state (the trigger holds the same map). */
export const TRANSITIONS: Readonly<Record<AppointmentStatus, readonly AppointmentStatus[]>> = {
  awaiting_payment: ['confirmed', 'cancelled'],
  unconfirmed: ['confirmed', 'cancelled', 'no_show'],
  confirmed: ['in_progress', 'cancelled', 'no_show'],
  in_progress: ['completed'],
  completed: [],
  cancelled: [],
  no_show: [],
};

/** S116-D9: a final state can be corrected within 24 hours, by the owner or an admin. */
const CORRECTION_WINDOW_MS = 24 * 60 * 60 * 1000;
const CORRECTORS = new Set(['owner', 'admin']);

export const APPOINTMENT_LIMITS = {
  teamNote: 1000,
  correctionReason: 500,
  blockReason: 200,
  clientName: 120,
  /** listAppointments / listTimeBlocks: at most this many days at once. */
  listDays: 62,
  listMax: 500,
  clientSearchMax: 20,
  historyPreview: 3,
} as const;

export const CLIENT_LOCALES = ['ro', 'en', 'fr', 'es', 'de', 'it'] as const;
export type ClientLocale = (typeof CLIENT_LOCALES)[number];

/** Who may change which appointments (D-B4-6 = a). */
export type AppointmentScope = 'all' | 'own';

// ── types ──────────────────────────────────────────────────────────────────────────────────

export type BookingSettings = {
  freeCancelHours: number;
  confirmationMode: 'auto' | 'manual';
  noticeMin: number;
  bufferMin: number;
  updatedAt: Date | null;
};

export type Client = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  locale: ClientLocale;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Appointment = {
  id: string;
  number: number;
  /** B.10: where it takes place; null in a business with one site / a member everywhere. */
  locationId: string | null;
  staffMemberId: string;
  serviceId: string;
  clientId: string;
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number;
  capacity: number;
  status: AppointmentStatus;
  statusChangedAt: Date;
  serviceName: string;
  staffDisplayName: string;
  clientName: string;
  price: {
    kind: 'fixed' | 'from' | 'range';
    minor: number;
    maxMinor: number | null;
    currency: 'RON' | 'EUR';
  };
  teamNote: string | null;
  source: 'hub' | 'public';
  cancellation: {
    at: Date;
    by: 'client' | 'business';
    byUserId: string | null;
    minutesBefore: number;
    late: boolean;
  } | null;
  deposit: { minor: number; currency: 'RON' | 'EUR'; dueAt: Date } | null;
  correction: { at: Date; byUserId: string; reason: string } | null;
  /** B.9a: a step of a visit with several services („1/3 · Vopsit rădăcină”); null otherwise. */
  visit: VisitRef | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** B.9a: the place of an appointment in its visit; the pause after it is 0 on the last step. */
export type VisitRef = { id: string; step: number; steps: number; breakAfterMinutes: number };

export type AppointmentHistoryItem = {
  id: string;
  kind: 'created' | 'status' | 'moved' | 'corrected' | 'updated';
  fromStatus: AppointmentStatus | null;
  toStatus: AppointmentStatus | null;
  startsAt: Date | null;
  endsAt: Date | null;
  staffMemberId: string | null;
  actorType: 'user' | 'client' | 'system';
  actorUserId: string | null;
  at: Date;
};

export type AppointmentDetail = {
  appointment: Appointment;
  /** BookingDetail: the last 3, then „Vezi tot istoricul”. */
  history: AppointmentHistoryItem[];
  historyCount: number;
  /** B.3b: the resources the appointment uses (one unit each). */
  resourceIds: string[];
};

export type TimeBlock = {
  id: string;
  staffMemberId: string;
  startsAt: Date;
  endsAt: Date;
  reason: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// ── rows ───────────────────────────────────────────────────────────────────────────────────

export type AppointmentRow = {
  id: string;
  number: number;
  staff_member_id: string;
  service_id: string;
  client_id: string;
  location_id: string | null;
  starts_at: Date;
  ends_at: Date;
  duration_minutes: number;
  capacity: number;
  status: AppointmentStatus;
  status_changed_at: Date;
  service_name: string;
  staff_display_name: string;
  client_name: string;
  price_kind: 'fixed' | 'from' | 'range';
  price_minor: number;
  price_max_minor: number | null;
  currency: 'RON' | 'EUR';
  team_note: string | null;
  source: 'hub' | 'public';
  cancelled_at: Date | null;
  cancelled_by: 'client' | 'business' | null;
  cancelled_by_user_id: string | null;
  cancel_minutes_before: number | null;
  cancel_late: boolean | null;
  deposit_minor: number | null;
  deposit_currency: 'RON' | 'EUR' | null;
  payment_due_at: Date | null;
  corrected_at: Date | null;
  corrected_by_user_id: string | null;
  correction_reason: string | null;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
  visit_id: string | null;
  visit_step: number | null;
  visit_steps: number | null;
  break_after_minutes: number | null;
};

export const APPOINTMENT_COLUMNS = `id, number, staff_member_id, service_id, client_id, starts_at, ends_at,
  duration_minutes, capacity, status, status_changed_at, service_name, staff_display_name,
  client_name, price_kind, price_minor, price_max_minor, currency, team_note, source, cancelled_at,
  cancelled_by, cancelled_by_user_id, cancel_minutes_before, cancel_late, deposit_minor,
  deposit_currency, payment_due_at, corrected_at, corrected_by_user_id, correction_reason,
  created_by_user_id, created_at, updated_at, location_id, visit_id, visit_step, visit_steps,
  break_after_minutes`;

export function toAppointment(r: AppointmentRow): Appointment {
  return {
    id: r.id,
    number: r.number,
    staffMemberId: r.staff_member_id,
    serviceId: r.service_id,
    clientId: r.client_id,
    locationId: r.location_id,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    durationMinutes: r.duration_minutes,
    capacity: r.capacity,
    status: r.status,
    statusChangedAt: r.status_changed_at,
    serviceName: r.service_name,
    staffDisplayName: r.staff_display_name,
    clientName: r.client_name,
    price: {
      kind: r.price_kind,
      minor: r.price_minor,
      maxMinor: r.price_max_minor,
      currency: r.currency,
    },
    teamNote: r.team_note,
    source: r.source,
    cancellation:
      r.cancelled_at && r.cancelled_by && r.cancel_minutes_before !== null && r.cancel_late !== null
        ? {
            at: r.cancelled_at,
            by: r.cancelled_by,
            byUserId: r.cancelled_by_user_id,
            minutesBefore: r.cancel_minutes_before,
            late: r.cancel_late,
          }
        : null,
    deposit:
      r.deposit_minor !== null && r.deposit_currency && r.payment_due_at
        ? { minor: r.deposit_minor, currency: r.deposit_currency, dueAt: r.payment_due_at }
        : null,
    correction:
      r.corrected_at && r.corrected_by_user_id && r.correction_reason
        ? { at: r.corrected_at, byUserId: r.corrected_by_user_id, reason: r.correction_reason }
        : null,
    visit:
      r.visit_id && r.visit_step !== null && r.visit_steps !== null
        ? {
            id: r.visit_id,
            step: r.visit_step,
            steps: r.visit_steps,
            breakAfterMinutes: r.break_after_minutes ?? 0,
          }
        : null,
    createdByUserId: r.created_by_user_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

type HistoryRow = {
  id: string;
  kind: AppointmentHistoryItem['kind'];
  from_status: AppointmentStatus | null;
  to_status: AppointmentStatus | null;
  starts_at: Date | null;
  ends_at: Date | null;
  staff_member_id: string | null;
  actor_type: AppointmentHistoryItem['actorType'];
  actor_user_id: string | null;
  created_at: Date;
};

function toHistory(r: HistoryRow): AppointmentHistoryItem {
  return {
    id: r.id,
    kind: r.kind,
    fromStatus: r.from_status,
    toStatus: r.to_status,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    staffMemberId: r.staff_member_id,
    actorType: r.actor_type,
    actorUserId: r.actor_user_id,
    at: r.created_at,
  };
}

export type ClientRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  locale: ClientLocale;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export const CLIENT_COLUMNS = `id, name, phone, email, locale, archived_at, created_at, updated_at`;

function toClient(r: ClientRow): Client {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    locale: r.locale,
    archivedAt: r.archived_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

type BlockRow = {
  id: string;
  staff_member_id: string;
  starts_at: Date;
  ends_at: Date;
  reason: string | null;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

const BLOCK_COLUMNS = `id, staff_member_id, starts_at, ends_at, reason, archived_at, created_at,
  updated_at`;

function toBlock(r: BlockRow): TimeBlock {
  return {
    id: r.id,
    staffMemberId: r.staff_member_id,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    reason: r.reason,
    archivedAt: r.archived_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ── helpers ────────────────────────────────────────────────────────────────────────────────

function requireId(id: unknown): string {
  // an id that is not a UUID cannot exist: the same answer as another business's id (T1)
  if (!isUuid(id)) throw new ResourceNotFound();
  return id;
}

type AuditTarget =
  'booking_appointment' | 'booking_time_block' | 'booking_client' | 'booking_settings';

export function audit(
  exec: AuditSqlExecutor,
  ctx: TenantContext,
  action: string,
  targetType: AuditTarget,
  targetId: string,
  metadata: Record<string, unknown>,
) {
  return appendAuditEventInTx(exec, {
    category: 'booking',
    action,
    outcome: 'success',
    // B.11a: the client on the public page has no account
    actorType: isPublicContext(ctx) ? 'anonymous' : 'user',
    actorId: actorUserId(ctx),
    organizationId: ctx.organizationId,
    targetType,
    targetId,
    metadata,
  });
}

export function history(
  client: PoolClient,
  ctx: TenantContext,
  appointmentId: string,
  entry: {
    kind: AppointmentHistoryItem['kind'];
    from?: AppointmentStatus | null;
    to?: AppointmentStatus | null;
    startsAt?: Date | null;
    endsAt?: Date | null;
    staffMemberId?: string | null;
  },
) {
  return client.query(
    `INSERT INTO booking.appointment_history
       (id, organization_id, appointment_id, kind, from_status, to_status, starts_at, ends_at,
        staff_member_id, actor_type, actor_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      uuidv7(),
      ctx.organizationId,
      appointmentId,
      entry.kind,
      entry.from ?? null,
      entry.to ?? null,
      entry.startsAt ?? null,
      entry.endsAt ?? null,
      entry.staffMemberId ?? null,
      isPublicContext(ctx) ? 'client' : 'user',
      actorUserId(ctx),
    ],
  );
}

export type PgError = { code?: string; constraint?: string; hint?: string };

/** The database's answer to a race the contract could not see, as the contract's own errors. */
export function translate(err: unknown): never {
  const e = err as PgError;
  // B.3b: no free unit of a resource the service needs (check_resource_free, hint 'resource')
  if (e?.code === '23P01' && e.hint === 'resource') throw new Conflict('resource_unavailable');
  if (e?.code === '23P01') throw new Conflict('appointment_overlap');
  if (e?.code === '23514' && typeof (err as Error).message === 'string') {
    const m = (err as Error).message;
    if (m.includes('not an active member')) throw new Conflict('staff_member_removed');
    if (m.includes('not allowed') || m.includes('not moved') || m.includes('no_show')) {
      throw new Conflict('transition_not_allowed');
    }
  }
  if (e?.code === '23505' && e.constraint === 'client_active_phone_key') {
    throw new Conflict('client_phone_taken');
  }
  if (e?.code === '23505' && e.constraint === 'client_active_email_key') {
    throw new Conflict('client_email_taken');
  }
  throw err;
}

export async function tx<T>(
  ctx: TenantContext,
  fn: (client: PoolClient, exec: AuditSqlExecutor) => Promise<T>,
  readOnly = false,
): Promise<T> {
  try {
    return await withBookingTx(ctx.organizationId, fn, readOnly);
  } catch (err) {
    translate(err);
  }
}

/** An instant from the caller: an ISO 8601 date-time with its offset (Z or ±hh:mm). */
export function requireInstant(field: string, value: unknown): Date {
  if (value === undefined || value === null || value === '')
    throw new InvalidInput(field, 'required');
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value)
  ) {
    throw new InvalidInput(field, 'invalid');
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new InvalidInput(field, 'invalid');
  return d;
}

export function normalizeOptionalText(field: string, value: unknown, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new InvalidInput(field, 'invalid');
  const text = value.trim();
  if (text.length > max) throw new InvalidInput(field, 'too_long');
  return text.length > 0 ? text : null;
}

export function requireDuration(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < LIMITS.durationMin ||
    value > LIMITS.durationMax ||
    value % LIMITS.durationStep !== 0
  ) {
    throw new InvalidInput('durationMinutes', 'invalid');
  }
  return value;
}

/** The local date and minutes of an interval in the business time zone (one query, DST-safe). */
async function localSpan(
  client: PoolClient,
  timeZone: string,
  startsAt: Date,
  endsAt: Date,
): Promise<{ date: string; endDate: string; startMin: number; endMin: number; aligned: boolean }> {
  const { rows } = await client.query<{
    d: string;
    ed: string;
    sm: number;
    em: number;
    aligned: boolean;
  }>(
    `SELECT to_char(s, 'YYYY-MM-DD') AS d, to_char(e, 'YYYY-MM-DD') AS ed,
            (extract(hour FROM s) * 60 + extract(minute FROM s))::int AS sm,
            (extract(hour FROM e) * 60 + extract(minute FROM e))::int AS em,
            (extract(second FROM s) = 0 AND extract(minute FROM s)::int % 5 = 0) AS aligned
       FROM (SELECT ($1::timestamptz AT TIME ZONE $3) AS s,
                    ($2::timestamptz AT TIME ZONE $3) AS e) t`,
    [startsAt, endsAt, timeZone],
  );
  const r = rows[0]!;
  // an end at local midnight closes the day before
  const endMin = r.ed !== r.d && r.em === 0 ? 1440 : r.em;
  const endDate = r.ed !== r.d && r.em === 0 ? r.d : r.ed;
  return { date: r.d, endDate, startMin: r.sm, endMin, aligned: r.aligned };
}

/** D-B4-4 = a: the whole appointment inside one of the member's working intervals that day. */
export async function requireWithinSchedule(
  client: PoolClient,
  timeZone: string,
  staffMemberId: string,
  startsAt: Date,
  endsAt: Date,
) {
  const span = await localSpan(client, timeZone, startsAt, endsAt);
  if (!span.aligned) throw new InvalidInput('startsAt', 'invalid');
  if (span.endDate !== span.date) throw new Conflict('staff_unavailable');
  const intervals = await staffDayIntervals(client, staffMemberId, span.date);
  const inside = intervals.some((i) => i.startMin <= span.startMin && span.endMin <= i.endMin);
  if (!inside) throw new Conflict('staff_unavailable');
}

export type StaffForBooking = {
  id: string;
  user_id: string;
  display_name: string;
  /** B.10: null = every location. */
  location_id: string | null;
  archived_at: Date | null;
};

export async function readStaffForBooking(
  client: PoolClient,
  id: string,
): Promise<StaffForBooking> {
  const { rows } = await client.query<StaffForBooking>(
    `SELECT id, user_id, display_name, location_id, archived_at
       FROM booking.staff_member WHERE id = $1`,
    [id],
  );
  if (!rows[0]) throw new ResourceNotFound();
  return rows[0];
}

/** D-B2-6 = a: the member is in the calendar and still eligible (core/access), on every booking. */
export async function requireBookableStaff(ctx: TenantContext, staff: StaffForBooking) {
  if (staff.archived_at) throw new Conflict('staff_member_removed');
  const eligibility = await staffEligibility(ctx, staff.user_id);
  if (eligibility !== 'eligible') throw new Conflict('staff_member_removed');
}

/** D-B4-6 = a: a member changes only the appointments where they are the member. */
export function requireScope(
  ctx: TenantContext,
  scope: AppointmentScope,
  staff: { user_id: string },
) {
  if (scope === 'own' && staff.user_id !== ctx.userId) throw new Forbidden();
}

export async function readAppointment(
  client: PoolClient,
  id: string,
  lock = false,
): Promise<AppointmentRow & { staff_user_id: string }> {
  const { rows } = await client.query<AppointmentRow & { staff_user_id: string }>(
    `SELECT ${APPOINTMENT_COLUMNS.split(',')
      .map((c) => `a.${c.trim()}`)
      .join(', ')}, m.user_id AS staff_user_id
       FROM booking.appointment a
       JOIN booking.staff_member m ON m.id = a.staff_member_id
      WHERE a.id = $1${lock ? ' FOR UPDATE OF a' : ''}`,
    [id],
  );
  if (!rows[0]) throw new ResourceNotFound();
  return rows[0];
}

// ── settings (D-B4-5) ──────────────────────────────────────────────────────────────────────

export const DEFAULT_BOOKING_SETTINGS: Omit<BookingSettings, 'updatedAt'> = {
  freeCancelHours: 24,
  confirmationMode: 'auto',
  noticeMin: 0,
  bufferMin: 0,
};

export async function readSettings(client: PoolClient): Promise<BookingSettings> {
  const { rows } = await client.query<{
    free_cancel_hours: number;
    confirmation_mode: 'auto' | 'manual';
    notice_min: number;
    buffer_min: number;
    updated_at: Date;
  }>(`SELECT free_cancel_hours, confirmation_mode, notice_min, buffer_min, updated_at
        FROM booking.settings`);
  const r = rows[0];
  if (!r) return { ...DEFAULT_BOOKING_SETTINGS, updatedAt: null };
  return {
    freeCancelHours: r.free_cancel_hours,
    confirmationMode: r.confirmation_mode,
    noticeMin: r.notice_min,
    bufferMin: r.buffer_min,
    updatedAt: r.updated_at,
  };
}

export async function getBookingSettingsInOrg(ctx: TenantContext): Promise<BookingSettings> {
  return tx(ctx, (client) => readSettings(client), true);
}

function intIn(field: string, value: unknown, min: number, max: number, step = 1): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > max ||
    value % step !== 0
  ) {
    throw new InvalidInput(field, 'invalid');
  }
  return value;
}

/** BookingSettings · the rules (screen in B.6d); a field left out keeps its value. */
export async function setBookingSettingsInOrg(
  ctx: TenantContext,
  input: {
    freeCancelHours?: unknown;
    confirmationMode?: unknown;
    noticeMin?: unknown;
    bufferMin?: unknown;
  },
): Promise<BookingSettings> {
  hubOnly(ctx);
  return tx(ctx, async (client, exec) => {
    const current = await readSettings(client);
    const next = {
      freeCancelHours:
        input.freeCancelHours === undefined
          ? current.freeCancelHours
          : intIn('freeCancelHours', input.freeCancelHours, 0, 720),
      confirmationMode:
        input.confirmationMode === undefined
          ? current.confirmationMode
          : input.confirmationMode === 'auto' || input.confirmationMode === 'manual'
            ? input.confirmationMode
            : (() => {
                throw new InvalidInput('confirmationMode', 'invalid');
              })(),
      noticeMin:
        input.noticeMin === undefined
          ? current.noticeMin
          : intIn('noticeMin', input.noticeMin, 0, 10080, 5),
      bufferMin:
        input.bufferMin === undefined
          ? current.bufferMin
          : intIn('bufferMin', input.bufferMin, 0, 120, 5),
    };
    await client.query(
      `INSERT INTO booking.settings
         (organization_id, free_cancel_hours, confirmation_mode, notice_min, buffer_min,
          updated_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (organization_id) DO UPDATE
         SET free_cancel_hours = EXCLUDED.free_cancel_hours,
             confirmation_mode = EXCLUDED.confirmation_mode,
             notice_min = EXCLUDED.notice_min,
             buffer_min = EXCLUDED.buffer_min,
             updated_by_user_id = EXCLUDED.updated_by_user_id`,
      [
        ctx.organizationId,
        next.freeCancelHours,
        next.confirmationMode,
        next.noticeMin,
        next.bufferMin,
        ctx.userId,
      ],
    );
    await audit(
      exec,
      ctx,
      AuditActions.bookingSettingsUpdated,
      'booking_settings',
      ctx.organizationId,
      {
        ...next,
      },
    );
    return readSettings(client);
  });
}

// ── clients (D-B4-1 = a) ───────────────────────────────────────────────────────────────────

export type ClientInput = {
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  locale?: unknown;
};

function normalizePhone(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new InvalidInput('phone', 'invalid');
  const phone = value.replace(/[\s().-]/g, '');
  if (!/^\+[1-9][0-9]{6,14}$/.test(phone)) throw new InvalidInput('phone', 'invalid');
  return phone;
}

function normalizeEmail(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new InvalidInput('email', 'invalid');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new InvalidInput('email', 'invalid');
  }
  return email;
}

function normalizeClient(input: ClientInput, current?: ClientRow) {
  const name =
    input.name === undefined && current
      ? current.name
      : (() => {
          if (typeof input.name !== 'string') throw new InvalidInput('name', 'required');
          const n = input.name.trim();
          if (n.length < 1) throw new InvalidInput('name', 'required');
          if (n.length > APPOINTMENT_LIMITS.clientName) throw new InvalidInput('name', 'too_long');
          return n;
        })();
  const phone = input.phone === undefined && current ? current.phone : normalizePhone(input.phone);
  const email = input.email === undefined && current ? current.email : normalizeEmail(input.email);
  if (phone === null && email === null) throw new InvalidInput('phone', 'contact_required');
  const locale =
    input.locale === undefined
      ? (current?.locale ?? 'ro')
      : (CLIENT_LOCALES as readonly unknown[]).includes(input.locale)
        ? (input.locale as ClientLocale)
        : (() => {
            throw new InvalidInput('locale', 'invalid');
          })();
  return { name, phone, email, locale };
}

/** B.11a: the contact the public page checks before anything (name, phone and e-mail required). */
export function normalizePublicContact(input: ClientInput) {
  const c = normalizeClient(input);
  if (c.email === null) throw new InvalidInput('email', 'required');
  if (c.phone === null) throw new InvalidInput('phone', 'required');
  return c as { name: string; phone: string; email: string; locale: ClientLocale };
}

/**
 * B.11a: the active client of the public page — the one with this e-mail, otherwise with this
 * phone (their card is not changed from the public page); a new one when `create` and none exists.
 * `blocked`: an open block (B.7a) on that client, which the page never tells the client about.
 */
export async function publicClientInOrg(
  ctx: TenantContext,
  input: ClientInput,
  create: boolean,
): Promise<{ id: string | null; blocked: boolean }> {
  const c = normalizePublicContact(input);
  return tx(
    ctx,
    async (client, exec) => {
      const found = (
        await client.query<{ id: string }>(
          `SELECT id FROM booking.client
          WHERE archived_at IS NULL AND (lower(email) = $1 OR lower(phone) = lower($2))
          ORDER BY (lower(email) = $1) DESC, created_at
          LIMIT 1`,
          [c.email, c.phone],
        )
      ).rows[0];
      if (found) {
        const blocked =
          (
            await client.query(
              `SELECT 1 FROM booking.client_block WHERE client_id = $1 AND unblocked_at IS NULL`,
              [found.id],
            )
          ).rows.length > 0;
        return { id: found.id, blocked };
      }
      if (!create) return { id: null, blocked: false };
      const row = await insertClient(client, exec, ctx, c);
      return { id: row.id, blocked: false };
    },
    !create,
  );
}

export async function insertClient(
  client: PoolClient,
  exec: AuditSqlExecutor,
  ctx: TenantContext,
  input: ClientInput,
): Promise<ClientRow> {
  const c = normalizeClient(input);
  const { rows } = await client.query<ClientRow>(
    `INSERT INTO booking.client (id, organization_id, name, phone, email, locale, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${CLIENT_COLUMNS}`,
    [uuidv7(), ctx.organizationId, c.name, c.phone, c.email, c.locale, actorUserId(ctx)],
  );
  const row = rows[0]!;
  // no client data in the audit (name, phone, e-mail)
  await audit(exec, ctx, AuditActions.bookingClientCreated, 'booking_client', row.id, {});
  // B.7a (D-CRM-9): for ClientDesk, only the id
  await writeOutboxEvent(client, 'booking', BookingClientCreatedV1, {
    organizationId: ctx.organizationId,
    sourceApp: 'platform',
    resourceId: row.id,
    payload: { clientId: row.id, createdAt: row.created_at.toISOString() },
  });
  return row;
}

export async function createClientInOrg(ctx: TenantContext, input: ClientInput): Promise<Client> {
  hubOnly(ctx);
  return tx(ctx, async (client, exec) => toClient(await insertClient(client, exec, ctx, input)));
}

export async function updateClientInOrg(
  ctx: TenantContext,
  clientId: unknown,
  input: ClientInput,
): Promise<Client> {
  hubOnly(ctx);
  const id = requireId(clientId);
  return tx(ctx, async (client, exec) => {
    const current = (
      await client.query<ClientRow>(
        `SELECT ${CLIENT_COLUMNS} FROM booking.client WHERE id = $1 FOR UPDATE`,
        [id],
      )
    ).rows[0];
    if (!current) throw new ResourceNotFound();
    if (current.archived_at) throw new Conflict('client_archived');
    const c = normalizeClient(input, current);
    const { rows } = await client.query<ClientRow>(
      `UPDATE booking.client SET name = $2, phone = $3, email = $4, locale = $5
        WHERE id = $1 RETURNING ${CLIENT_COLUMNS}`,
      [id, c.name, c.phone, c.email, c.locale],
    );
    await audit(exec, ctx, AuditActions.bookingClientUpdated, 'booking_client', id, {
      fields: Object.keys(input).filter((k) => (input as Record<string, unknown>)[k] !== undefined),
    });
    // B.7a (D-CRM-9): for ClientDesk, only the id
    await writeOutboxEvent(client, 'booking', BookingClientUpdatedV1, {
      organizationId: ctx.organizationId,
      sourceApp: 'platform',
      resourceId: id,
      payload: { clientId: id, updatedAt: rows[0]!.updated_at.toISOString() },
    });
    return toClient(rows[0]!);
  });
}

/**
 * The client field of BookingNew: with a query, the active clients whose name, phone or e-mail
 * match; without one, „Clienți recenți” (the latest appointments first).
 */
export async function searchClientsInOrg(
  ctx: TenantContext,
  params: { query?: unknown; limit?: unknown },
): Promise<Client[]> {
  hubOnly(ctx);
  const limit =
    params.limit === undefined
      ? APPOINTMENT_LIMITS.clientSearchMax
      : intIn('limit', params.limit, 1, APPOINTMENT_LIMITS.clientSearchMax);
  const query = normalizeOptionalText('query', params.query, 120);
  return tx(
    ctx,
    async (client) => {
      if (!query) {
        const { rows } = await client.query<ClientRow>(
          `SELECT ${CLIENT_COLUMNS.split(',')
            .map((c) => `c.${c.trim()}`)
            .join(', ')}
             FROM booking.client c
             LEFT JOIN LATERAL (SELECT max(a.created_at) AS last FROM booking.appointment a
                                 WHERE a.client_id = c.id) l ON true
            WHERE c.archived_at IS NULL
            ORDER BY l.last DESC NULLS LAST, c.created_at DESC, c.id
            LIMIT $1`,
          [limit],
        );
        return rows.map(toClient);
      }
      const like = '%' + query.replace(/[\\%_]/g, (m) => '\\' + m) + '%';
      const digits = query.replace(/[^0-9]/g, '');
      const { rows } = await client.query<ClientRow>(
        `SELECT ${CLIENT_COLUMNS} FROM booking.client
          WHERE archived_at IS NULL
            AND (name ILIKE $1 OR email ILIKE $1 OR ($2 <> '' AND phone LIKE '%' || $2 || '%'))
          ORDER BY name, id
          LIMIT $3`,
        [like, digits.length >= 3 ? digits : '', limit],
      );
      return rows.map(toClient);
    },
    true,
  );
}

// ── appointments ───────────────────────────────────────────────────────────────────────────

export type CreateAppointmentInput = {
  /** Given by the caller (a UUID): a retry with the same id returns the same appointment. */
  id: unknown;
  /** A member's id, or 'any' („Oricine e liber”, B.5: the system chooses, D-B5-4). */
  staffMemberId: unknown;
  serviceId: unknown;
  clientId?: unknown;
  /** A new client, created in the same transaction (when clientId is absent). */
  client?: ClientInput;
  startsAt: unknown;
  /** S123-3: between the service's minimum and maximum; by default the maximum. */
  durationMinutes?: unknown;
  /** BookingNew: confirmed (default) or unconfirmed. */
  confirmed?: unknown;
  teamNote?: unknown;
  /**
   * B.10: the location, for a member who works everywhere (or „any” at one location). A member
   * with a location gives it to the appointment; another location for them is
   * Conflict('staff_other_location').
   */
  locationId?: unknown;
};

export type ServiceForBooking = {
  id: string;
  name: string;
  duration_minutes: number;
  duration_max_minutes: number | null;
  price_kind: 'fixed' | 'from' | 'range';
  price_minor: number;
  price_max_minor: number | null;
  currency: 'RON' | 'EUR';
  capacity: number;
  archived_at: Date | null;
};

export class AlreadyCreated extends Error {}

function sameRequest(
  row: AppointmentRow,
  req: { staffMemberId: string | 'any'; serviceId: string; startsAt: Date },
) {
  return (
    (req.staffMemberId === 'any' || row.staff_member_id === req.staffMemberId) &&
    row.service_id === req.serviceId &&
    row.starts_at.getTime() === req.startsAt.getTime()
  );
}

export type AppointmentInsert = {
  id: string;
  staffMemberId: string;
  staffDisplayName: string;
  service: ServiceForBooking;
  client: ClientRow;
  startsAt: Date;
  endsAt: Date;
  duration: number;
  status: AppointmentStatus;
  price: EffectiveTerms;
  teamNote: string | null;
  locationId: string | null;
  /** B.9a: the step of a visit, or null. */
  visit: VisitRef | null;
};

/**
 * One appointment row, its number and one unit of every resource the service needs (B.3b), in the
 * caller's transaction. row undefined: the id exists already (a concurrent retry got there first).
 */
export async function insertAppointmentRow(
  db: PoolClient,
  ctx: TenantContext,
  v: AppointmentInsert,
): Promise<{
  number: number;
  row: AppointmentRow | undefined;
  resources: Array<{ id: string; units: number }>;
}> {
  // B.3b: the active resources the service needs (an archived one is not required, S124);
  // B.10: at the appointment's location, the ones standing there or everywhere
  const resources = await requiredResources(db, v.service.id, v.locationId);
  const number = (
    await db.query<{ last_number: number }>(
      `INSERT INTO booking.appointment_counter (organization_id, last_number) VALUES ($1, 1)
       ON CONFLICT (organization_id)
         DO UPDATE SET last_number = booking.appointment_counter.last_number + 1
       RETURNING last_number`,
      [ctx.organizationId],
    )
  ).rows[0]!.last_number;

  const { rows } = await db.query<AppointmentRow>(
    `INSERT INTO booking.appointment
       (id, organization_id, number, staff_member_id, service_id, client_id, starts_at, ends_at,
        duration_minutes, capacity, status, service_name, staff_display_name, client_name,
        price_kind, price_minor, price_max_minor, currency, team_note, source,
        created_by_user_id, location_id, visit_id, visit_step, visit_steps, break_after_minutes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
             $19, $22, $20, $21, $23, $24, $25, $26)
     ON CONFLICT (id) DO NOTHING
     RETURNING ${APPOINTMENT_COLUMNS}`,
    [
      v.id,
      ctx.organizationId,
      number,
      v.staffMemberId,
      v.service.id,
      v.client.id,
      v.startsAt,
      v.endsAt,
      v.duration,
      v.service.capacity,
      v.status,
      v.service.name,
      v.staffDisplayName,
      v.client.name,
      v.price.priceKind,
      v.price.priceMinor,
      v.price.priceMaxMinor,
      v.service.currency,
      v.teamNote,
      actorUserId(ctx),
      v.locationId,
      isPublicContext(ctx) ? 'public' : 'hub',
      v.visit?.id ?? null,
      v.visit?.step ?? null,
      v.visit?.steps ?? null,
      v.visit ? v.visit.breakAfterMinutes : null,
    ],
  );
  // B.3b: one unit of every resource, in the same transaction (the trigger checks it)
  if (rows[0]) {
    for (const r of resources) {
      await db.query(
        `INSERT INTO booking.appointment_resource (id, organization_id, appointment_id, resource_id)
         VALUES ($1, $2, $3, $4)`,
        [uuidv7(), ctx.organizationId, v.id, r.id],
      );
    }
  }
  return { number, row: rows[0], resources };
}

/**
 * „Programare nouă” (BookingNew): member, service, client (existing or new), start, duration,
 * confirmed or not, note. Refused when the member is out of the calendar or no longer eligible
 * (D-B2-6), the service is archived, the time is outside the member's schedule (D-B4-4) or
 * overlaps (D-B4-2, D-B4-3). The quota is B.4b.
 *
 * B.5 („Oricine e liber”, D-B5-4 = a): staffMemberId 'any' → the members free at that time for the
 * service (the free-slot rules of the team), fewest appointments that day first, then the team's
 * order. Each is tried under a savepoint in the same transaction and with the same quota
 * reservation; a parallel request that took the time (23P01) moves on to the next one. Nobody left
 * → Conflict('appointment_overlap'). A member (scope own) chooses themselves, not 'any'.
 */
export async function createAppointmentInOrg(
  ctx: TenantContext,
  scope: AppointmentScope,
  input: CreateAppointmentInput,
): Promise<Appointment> {
  if (!isUuid(input.id)) throw new InvalidInput('id', 'invalid');
  const id = input.id;
  const choice: string | 'any' =
    input.staffMemberId === 'any' ? 'any' : requireId(input.staffMemberId);
  const serviceId = requireId(input.serviceId);
  const startsAt = requireInstant('startsAt', input.startsAt);
  const teamNote = normalizeOptionalText('teamNote', input.teamNote, APPOINTMENT_LIMITS.teamNote);
  if (input.confirmed !== undefined && typeof input.confirmed !== 'boolean') {
    throw new InvalidInput('confirmed', 'invalid');
  }
  const status: AppointmentStatus = input.confirmed === false ? 'unconfirmed' : 'confirmed';
  if (input.clientId === undefined && input.client === undefined) {
    throw new InvalidInput('clientId', 'required');
  }
  const clientId = input.clientId === undefined ? null : requireId(input.clientId);
  const requestedLocation = await locationFilter(ctx, input.locationId);

  // a retry of the same operation: the same appointment, nothing written twice
  const existing = await findAppointment(ctx, id);
  if (existing) {
    if (!sameRequest(existing, { staffMemberId: choice, serviceId, startsAt })) {
      throw new Conflict('operation_reused');
    }
    // a process stopped after the transaction: finish the quota step (idempotent)
    await settleQuota(ctx, id, 'commit');
    return toAppointment(existing);
  }

  let candidates: StaffForBooking[];
  if (choice === 'any') {
    if (scope === 'own') throw new Forbidden();
    const free = await staffFreeAtInOrg(ctx, {
      serviceId,
      startsAt,
      durationMinutes: input.durationMinutes,
      locationId: requestedLocation,
    });
    if (free.length === 0) {
      // the precise reason for an archived service; otherwise nobody is free at that time
      const archived = await tx(
        ctx,
        async (client) =>
          (
            await client.query<{ archived_at: Date | null }>(
              `SELECT archived_at FROM booking.service WHERE id = $1`,
              [serviceId],
            )
          ).rows[0]?.archived_at,
        true,
      );
      if (archived) throw new Conflict('service_archived');
      // B.2b (S129): a service nobody does can't be booked
      const doing = await tx(ctx, (client) => staffForService(client, serviceId), true);
      if (doing.length === 0) throw new Conflict('service_unassigned');
      throw new Conflict('appointment_overlap');
    }
    candidates = await tx(
      ctx,
      async (client) => {
        const rows: StaffForBooking[] = [];
        for (const staffId of free) rows.push(await readStaffForBooking(client, staffId));
        return rows;
      },
      true,
    );
  } else {
    const staff = await tx(ctx, (client) => readStaffForBooking(client, choice), true);
    requireScope(ctx, scope, staff);
    await requireBookableStaff(ctx, staff);
    if (requestedLocation && staff.location_id && staff.location_id !== requestedLocation) {
      throw new Conflict('staff_other_location');
    }
    candidates = [staff];
  }
  const timeZone = await getOrganizationTimeZone(ctx);

  // the quota first: at the limit nothing is written (QuotaExceeded; BookingLimit keeps the form)
  await reserveQuota(ctx, APPOINTMENTS_QUOTA_KEY, 1, id);

  let created: Appointment;
  try {
    created = await tx(ctx, async (client, exec) => {
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
      if (input.durationMinutes !== undefined) requireDuration(input.durationMinutes);
      // B.2c: each member's own duration and price for the service (the service's by default)
      const terms = await effectiveTermsFor(
        client,
        serviceId,
        service,
        candidates.map((c) => c.id),
      );
      if (choice !== 'any') {
        // B.2b (S129): the member must do the service
        if (!(await doesService(client, choice, serviceId))) {
          throw new Conflict('staff_not_for_service');
        }
        const own = durationWithin(terms.get(choice)!, input.durationMinutes);
        if (own === null) throw new InvalidInput('durationMinutes', 'invalid');
        await requireWithinSchedule(
          client,
          timeZone,
          choice,
          startsAt,
          new Date(startsAt.getTime() + own * 60_000),
        );
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

      const insertRow = (
        db: PoolClient,
        staffMemberId: string,
        displayName: string,
        duration: number,
        endsAt: Date,
        price: EffectiveTerms,
        locationId: string | null,
      ) =>
        insertAppointmentRow(db, ctx, {
          id,
          staffMemberId,
          staffDisplayName: displayName,
          service,
          client: clientRow,
          startsAt,
          endsAt,
          duration,
          status,
          price,
          teamNote,
          locationId,
          visit: null,
        });

      // „Oricine e liber”: the next member when the time was taken in the meantime (D-B5-4)
      for (const staff of candidates) {
        const staffMemberId = staff.id;
        const own = terms.get(staffMemberId)!;
        const chosen = durationWithin(own, input.durationMinutes);
        // „Oricine e liber”: a member whose bounds don't allow the duration asked is skipped
        if (chosen === null) continue;
        // B.10: the member's location, otherwise the one asked for (a member who works everywhere)
        if (requestedLocation && staff.location_id && staff.location_id !== requestedLocation) {
          continue;
        }
        const locationId = staff.location_id ?? requestedLocation ?? null;
        const duration = chosen;
        const endsAt = new Date(startsAt.getTime() + duration * 60_000);
        if (choice === 'any') await client.query('SAVEPOINT pick_staff');
        let inserted: {
          number: number;
          row: AppointmentRow | undefined;
          resources: Array<{ id: string; units: number }>;
        };
        try {
          if (choice === 'any') {
            await requireWithinSchedule(client, timeZone, staffMemberId, startsAt, endsAt);
          }
          inserted = await insertRow(
            client,
            staffMemberId,
            staff.display_name,
            duration,
            endsAt,
            own,
            locationId,
          );
        } catch (err) {
          const pg = err as PgError;
          // the member's time was taken; a resource with no free unit is the same for everyone
          const taken =
            (pg?.code === '23P01' && pg.hint !== 'resource') ||
            (err instanceof Conflict && err.message === 'staff_unavailable');
          if (choice === 'any' && taken) {
            await client.query('ROLLBACK TO SAVEPOINT pick_staff');
            continue;
          }
          throw err;
        }
        const { number, resources } = inserted;
        // a concurrent retry got there first: roll this one back (no gap in the numbers)
        if (!inserted.row) throw new AlreadyCreated();
        const row = inserted.row;
        await history(client, ctx, id, {
          kind: 'created',
          to: status,
          startsAt,
          endsAt,
          staffMemberId,
        });
        await audit(exec, ctx, AuditActions.bookingAppointmentCreated, 'booking_appointment', id, {
          number,
          staffMemberId,
          serviceId,
          clientId: clientRow.id,
          startsAt: startsAt.toISOString(),
          durationMinutes: duration,
          status,
          ...(resources.length ? { resourceIds: resources.map((r) => r.id) } : {}),
          ...(locationId ? { locationId } : {}),
        });
        await writeOutboxEvent(client, 'booking', BookingAppointmentCreatedV1, {
          organizationId: ctx.organizationId,
          sourceApp: 'platform',
          resourceId: id,
          payload: {
            appointmentId: id,
            number,
            staffMemberId,
            serviceId,
            clientId: clientRow.id,
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            status,
            source: 'hub',
          },
        });
        return toAppointment(row);
      }
      // nobody was free any more
      throw new Conflict('appointment_overlap');
    });
  } catch (err) {
    if (!(err instanceof AlreadyCreated)) {
      // nothing was written: the reserved unit goes back
      await settleQuota(ctx, id, 'release');
      throw err;
    }
    // a concurrent retry of the same operation wrote it; it commits the shared reservation
    const again = await findAppointment(ctx, id);
    if (!again || !sameRequest(again, { staffMemberId: choice, serviceId, startsAt })) {
      throw new Conflict('operation_reused');
    }
    return toAppointment(again);
  }
  await settleQuota(ctx, id, 'commit');
  return created;
}

/**
 * The second step of the quota saga. A failure is logged, not thrown: the appointment (or its
 * absence) is the truth, and the reconciliation job settles the reservation from it.
 */
export async function settleQuota(ctx: TenantContext, id: string, step: 'commit' | 'release') {
  try {
    if (step === 'commit') await commitQuota(ctx, id);
    else await releaseQuota(ctx, id);
  } catch (err) {
    // ResourceNotFound: no reservation (an appointment from before B.4b); Conflict: already settled
    if (err instanceof ResourceNotFound || err instanceof Conflict) return;
    console.error(`[booking] ${step} of the quota failed; the reconciliation settles it`, {
      operationId: id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function findAppointment(
  ctx: TenantContext,
  id: string,
): Promise<AppointmentRow | null> {
  return tx(
    ctx,
    async (client) =>
      (
        await client.query<AppointmentRow>(
          `SELECT ${APPOINTMENT_COLUMNS} FROM booking.appointment WHERE id = $1`,
          [id],
        )
      ).rows[0] ?? null,
    true,
  );
}

/** For the reconciliation of the quota (B.4b): does the appointment of this operation exist? */
export async function appointmentExists(organizationId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  return withBookingTx(
    organizationId,
    async (client) =>
      (await client.query(`SELECT 1 FROM booking.appointment WHERE id = $1`, [id])).rowCount! > 0,
    true,
  );
}

export type MoveAppointmentInput = {
  startsAt?: unknown;
  staffMemberId?: unknown;
  durationMinutes?: unknown;
};

/**
 * „Mută programarea”: another start, member or duration (S123-3: shortened by the team), with
 * the same checks as a new one. Not from „În desfășurare” or a final state.
 */
export async function moveAppointmentInOrg(
  ctx: TenantContext,
  scope: AppointmentScope,
  appointmentId: unknown,
  input: MoveAppointmentInput,
): Promise<Appointment> {
  hubOnly(ctx);
  return moveAppointment(ctx, scope, appointmentId, input);
}

/**
 * B.11b: the client moves their own booking from their page (server/manage.ts, after the token, the
 * online rules and the held time were checked). Only a public context; only the time.
 */
export async function moveAppointmentByClient(
  ctx: TenantContext,
  appointmentId: string,
  startsAt: string,
): Promise<Appointment> {
  clientOnly(ctx);
  return moveAppointment(ctx, 'all', appointmentId, { startsAt });
}

async function moveAppointment(
  ctx: TenantContext,
  scope: AppointmentScope,
  appointmentId: unknown,
  input: MoveAppointmentInput,
): Promise<Appointment> {
  const id = requireId(appointmentId);
  if (
    input.startsAt === undefined &&
    input.staffMemberId === undefined &&
    input.durationMinutes === undefined
  ) {
    throw new InvalidInput('startsAt', 'required');
  }
  const current = await tx(ctx, (client) => readAppointment(client, id), true);
  requireScope(ctx, scope, { user_id: current.staff_user_id });
  if (!MOVABLE.includes(current.status)) throw new Conflict('appointment_final');
  // B.9a (D-9a-1): a step of a visit is moved only by the team (moveVisit, or this step alone)
  if (isPublicContext(ctx) && current.visit_id) throw new Conflict('visit_managed_by_team');

  const startsAt =
    input.startsAt === undefined ? current.starts_at : requireInstant('startsAt', input.startsAt);
  const staffMemberId =
    input.staffMemberId === undefined ? current.staff_member_id : requireId(input.staffMemberId);
  const duration =
    input.durationMinutes === undefined
      ? current.duration_minutes
      : requireDuration(input.durationMinutes);

  let staff: StaffForBooking | null = null;
  if (staffMemberId !== current.staff_member_id) {
    staff = await tx(ctx, (client) => readStaffForBooking(client, staffMemberId), true);
    requireScope(ctx, scope, staff);
    await requireBookableStaff(ctx, staff);
    // B.10: the appointment keeps its location; a member of another location can't take it
    if (current.location_id && staff.location_id && staff.location_id !== current.location_id) {
      throw new Conflict('staff_other_location');
    }
  }
  const timeZone = await getOrganizationTimeZone(ctx);

  return tx(ctx, async (client, exec) => {
    const row = await readAppointment(client, id, true);
    if (!MOVABLE.includes(row.status)) throw new Conflict('appointment_final');
    const service = (
      await client.query<{ duration_minutes: number; duration_max_minutes: number | null }>(
        `SELECT duration_minutes, duration_max_minutes FROM booking.service WHERE id = $1`,
        [row.service_id],
      )
    ).rows[0]!;
    if (input.durationMinutes !== undefined) {
      const max = service.duration_max_minutes ?? service.duration_minutes;
      if (duration < service.duration_minutes || duration > max) {
        throw new InvalidInput('durationMinutes', 'invalid');
      }
    }
    const endsAt = new Date(startsAt.getTime() + duration * 60_000);
    // B.2b (S129): moved to another member, that member must do the service (the same member keeps
    // the appointments of a service they stopped doing, and can move them in time)
    if (
      staffMemberId !== row.staff_member_id &&
      !(await doesService(client, staffMemberId, row.service_id))
    ) {
      throw new Conflict('staff_not_for_service');
    }
    await requireWithinSchedule(client, timeZone, staffMemberId, startsAt, endsAt);
    const { rows } = await client.query<AppointmentRow>(
      `UPDATE booking.appointment
          SET starts_at = $2, ends_at = $3, duration_minutes = $4, staff_member_id = $5,
              staff_display_name = $6
        WHERE id = $1
        RETURNING ${APPOINTMENT_COLUMNS}`,
      [
        id,
        startsAt,
        endsAt,
        duration,
        staffMemberId,
        staff ? staff.display_name : row.staff_display_name,
      ],
    );
    await history(client, ctx, id, { kind: 'moved', startsAt, endsAt, staffMemberId });
    await writeOutboxEvent(client, 'booking', BookingAppointmentChangedV1, {
      organizationId: ctx.organizationId,
      sourceApp: 'platform',
      resourceId: id,
      payload: {
        appointmentId: id,
        staffMemberId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        previousStaffMemberId: row.staff_member_id,
        previousStartsAt: row.starts_at.toISOString(),
      },
    });
    await audit(exec, ctx, AuditActions.bookingAppointmentMoved, 'booking_appointment', id, {
      from: {
        startsAt: row.starts_at.toISOString(),
        staffMemberId: row.staff_member_id,
        durationMinutes: row.duration_minutes,
      },
      to: { startsAt: startsAt.toISOString(), staffMemberId, durationMinutes: duration },
    });
    return toAppointment(rows[0]!);
  });
}

/** The team's note on the appointment (never shown to the client); the audit has no text. */
export async function updateAppointmentNoteInOrg(
  ctx: TenantContext,
  scope: AppointmentScope,
  appointmentId: unknown,
  teamNote: unknown,
): Promise<Appointment> {
  hubOnly(ctx);
  const id = requireId(appointmentId);
  const note = normalizeOptionalText('teamNote', teamNote, APPOINTMENT_LIMITS.teamNote);
  return tx(ctx, async (client, exec) => {
    const row = await readAppointment(client, id, true);
    requireScope(ctx, scope, { user_id: row.staff_user_id });
    const { rows } = await client.query<AppointmentRow>(
      `UPDATE booking.appointment SET team_note = $2 WHERE id = $1 RETURNING ${APPOINTMENT_COLUMNS}`,
      [id, note],
    );
    await history(client, ctx, id, { kind: 'updated' });
    await audit(exec, ctx, AuditActions.bookingAppointmentUpdated, 'booking_appointment', id, {
      fields: ['teamNote'],
    });
    return toAppointment(rows[0]!);
  });
}

/** booking.appointment.completed / no_show, in the transaction of the change (T6). */
async function finalEvent(
  client: PoolClient,
  ctx: TenantContext,
  row: AppointmentRow,
  corrected: boolean,
) {
  const payload = {
    appointmentId: row.id,
    staffMemberId: row.staff_member_id,
    clientId: row.client_id,
    startsAt: row.starts_at.toISOString(),
    corrected,
  };
  const base = { organizationId: ctx.organizationId, sourceApp: 'platform', resourceId: row.id };
  if (row.status === 'completed') {
    await writeOutboxEvent(client, 'booking', BookingAppointmentCompletedV1, { ...base, payload });
  } else if (row.status === 'no_show') {
    await writeOutboxEvent(client, 'booking', BookingAppointmentNoShowV1, { ...base, payload });
  }
}

/** One of the transitions of BookingStatuses (confirm, start, complete, no-show). */
export async function changeAppointmentStatusInOrg(
  ctx: TenantContext,
  scope: AppointmentScope,
  appointmentId: unknown,
  to: Exclude<AppointmentStatus, 'cancelled' | 'awaiting_payment' | 'unconfirmed'>,
): Promise<Appointment> {
  hubOnly(ctx);
  const id = requireId(appointmentId);
  return tx(ctx, async (client, exec) => {
    const row = await readAppointment(client, id, true);
    requireScope(ctx, scope, { user_id: row.staff_user_id });
    if (FINAL.includes(row.status)) throw new Conflict('appointment_final');
    if (!TRANSITIONS[row.status].includes(to)) throw new Conflict('transition_not_allowed');
    if (to === 'no_show') {
      const started = (
        await client.query<{ started: boolean }>(`SELECT now() >= $1::timestamptz AS started`, [
          row.starts_at,
        ])
      ).rows[0]!.started;
      if (!started) throw new Conflict('no_show_too_early');
    }
    const { rows } = await client.query<AppointmentRow>(
      `UPDATE booking.appointment SET status = $2 WHERE id = $1 RETURNING ${APPOINTMENT_COLUMNS}`,
      [id, to],
    );
    await history(client, ctx, id, { kind: 'status', from: row.status, to });
    await finalEvent(client, ctx, rows[0]!, false);
    await audit(
      exec,
      ctx,
      AuditActions.bookingAppointmentStatusChanged,
      'booking_appointment',
      id,
      {
        from: row.status,
        to,
      },
    );
    return toAppointment(rows[0]!);
  });
}

/**
 * „Anulează programarea”: by the business (from Hub) or by the client (the team records it; from
 * B.11 the client's own page). The time is freed at once; how late is measured against the free
 * cancellation of the business (D-B4-5). B.4b gives the quota unit back before the start.
 */
export async function cancelAppointmentInOrg(
  ctx: TenantContext,
  scope: AppointmentScope,
  appointmentId: unknown,
  by: unknown,
): Promise<Appointment> {
  hubOnly(ctx);
  return cancelAppointment(ctx, scope, appointmentId, by);
}

/** B.11b: the client cancels their own booking from their page (server/manage.ts). */
export async function cancelAppointmentByClient(
  ctx: TenantContext,
  appointmentId: string,
): Promise<Appointment> {
  clientOnly(ctx);
  return cancelAppointment(ctx, 'all', appointmentId, 'client');
}

async function cancelAppointment(
  ctx: TenantContext,
  scope: AppointmentScope,
  appointmentId: unknown,
  by: unknown,
): Promise<Appointment> {
  const id = requireId(appointmentId);
  if (by !== 'client' && by !== 'business') throw new InvalidInput('by', 'invalid');
  return tx(ctx, async (client, exec) => {
    const row = await readAppointment(client, id, true);
    requireScope(ctx, scope, { user_id: row.staff_user_id });
    // B.9a (D-9a-1): a step of a visit is changed only by the team
    if (isPublicContext(ctx) && row.visit_id) throw new Conflict('visit_managed_by_team');
    const settings = await readSettings(client);
    return toAppointment(await cancelRow(client, exec, ctx, row, by, settings, null));
  });
}

/**
 * The cancellation of one appointment already read and locked, in the caller's transaction: the
 * row, its history, the event booking.appointment.cancelled (the quota refund before the start)
 * and its audit. B.9a: cancelVisit calls it for every step (visitId in the audit).
 */
export async function cancelRow(
  client: PoolClient,
  exec: AuditSqlExecutor,
  ctx: TenantContext,
  row: AppointmentRow,
  by: 'client' | 'business',
  settings: BookingSettings,
  visitId: string | null,
): Promise<AppointmentRow> {
  const id = row.id;
  if (FINAL.includes(row.status)) throw new Conflict('appointment_final');
  if (!TRANSITIONS[row.status].includes('cancelled')) throw new Conflict('transition_not_allowed');
  const { rows } = await client.query<AppointmentRow>(
    `UPDATE booking.appointment
        SET status = 'cancelled', cancelled_at = now(), cancelled_by = $2,
            cancelled_by_user_id = $3,
            cancel_minutes_before = floor(extract(epoch FROM (starts_at - now())) / 60)::int,
            cancel_late = (starts_at - now()) < make_interval(hours => $4)
      WHERE id = $1
      RETURNING ${APPOINTMENT_COLUMNS}`,
    // B.11b: the client on their own page has no user id
    [id, by, actorUserId(ctx), settings.freeCancelHours],
  );
  const updated = rows[0]!;
  await history(client, ctx, id, { kind: 'status', from: row.status, to: 'cancelled' });
  await writeOutboxEvent(client, 'booking', BookingAppointmentCancelledV1, {
    organizationId: ctx.organizationId,
    sourceApp: 'platform',
    resourceId: id,
    payload: {
      appointmentId: id,
      staffMemberId: updated.staff_member_id,
      clientId: updated.client_id,
      startsAt: updated.starts_at.toISOString(),
      cancelledAt: updated.cancelled_at!.toISOString(),
      by,
      late: updated.cancel_late!,
      minutesBefore: updated.cancel_minutes_before!,
      // before the start the unit of booking.appointments goes back (refundable)
      quotaRefund: updated.cancelled_at!.getTime() < updated.starts_at.getTime(),
    },
  });
  await audit(exec, ctx, AuditActions.bookingAppointmentCancelled, 'booking_appointment', id, {
    from: row.status,
    by,
    minutesBefore: updated.cancel_minutes_before,
    late: updated.cancel_late,
    ...(visitId ? { visitId } : {}),
  });
  return updated;
}

/**
 * „Corectează starea…” (S116-D9, D-B4-11 = a): only the owner or an admin, within 24 hours of the
 * final state, only between „Încheiată” and „Nu a venit”, with a reason kept in the history.
 */
export async function correctAppointmentStatusInOrg(
  ctx: TenantContext,
  appointmentId: unknown,
  input: { status: unknown; reason: unknown },
): Promise<Appointment> {
  hubOnly(ctx);
  const id = requireId(appointmentId);
  if (!CORRECTORS.has(ctx.role)) throw new Forbidden();
  if (input.status !== 'completed' && input.status !== 'no_show') {
    throw new InvalidInput('status', 'invalid');
  }
  const to = input.status;
  const reason = normalizeOptionalText('reason', input.reason, APPOINTMENT_LIMITS.correctionReason);
  if (!reason) throw new InvalidInput('reason', 'required');
  return tx(ctx, async (client, exec) => {
    const row = await readAppointment(client, id, true);
    if (row.status === to || !(row.status === 'completed' || row.status === 'no_show')) {
      throw new Conflict('transition_not_allowed');
    }
    const within = (
      await client.query<{ within: boolean }>(
        `SELECT now() - $1::timestamptz <= make_interval(secs => $2) AS within`,
        [row.status_changed_at, CORRECTION_WINDOW_MS / 1000],
      )
    ).rows[0]!.within;
    if (!within) throw new Conflict('correction_window_passed');
    const { rows } = await client.query<AppointmentRow>(
      `UPDATE booking.appointment
          SET status = $2, corrected_at = now(), corrected_by_user_id = $3, correction_reason = $4
        WHERE id = $1
        RETURNING ${APPOINTMENT_COLUMNS}`,
      [id, to, ctx.userId, reason],
    );
    await history(client, ctx, id, { kind: 'corrected', from: row.status, to });
    await finalEvent(client, ctx, rows[0]!, true);
    // the reason stays on the appointment (the team's text), not in the audit metadata
    await audit(
      exec,
      ctx,
      AuditActions.bookingAppointmentStatusCorrected,
      'booking_appointment',
      id,
      {
        from: row.status,
        to,
      },
    );
    return toAppointment(rows[0]!);
  });
}

/** BookingDetail: the appointment, the last 3 history rows and how many there are. */
export async function getAppointmentInOrg(
  ctx: TenantContext,
  appointmentId: unknown,
): Promise<AppointmentDetail> {
  hubOnly(ctx);
  const id = requireId(appointmentId);
  return tx(
    ctx,
    async (client) => {
      const row = await readAppointment(client, id);
      const items = (
        await client.query<HistoryRow & { total: string }>(
          `SELECT id, kind, from_status, to_status, starts_at, ends_at, staff_member_id, actor_type,
                  actor_user_id, created_at, count(*) OVER () AS total
             FROM booking.appointment_history WHERE appointment_id = $1
            ORDER BY created_at DESC, id DESC
            LIMIT $2`,
          [id, APPOINTMENT_LIMITS.historyPreview],
        )
      ).rows;
      const resourceIds = (
        await client.query<{ resource_id: string }>(
          `SELECT resource_id FROM booking.appointment_resource
            WHERE appointment_id = $1 ORDER BY resource_id`,
          [id],
        )
      ).rows.map((r) => r.resource_id);
      return {
        appointment: toAppointment(row),
        history: items.map(toHistory),
        historyCount: items[0] ? Number(items[0].total) : 0,
        resourceIds,
      };
    },
    true,
  );
}

/** „Vezi tot istoricul”. */
export async function listAppointmentHistoryInOrg(
  ctx: TenantContext,
  appointmentId: unknown,
): Promise<AppointmentHistoryItem[]> {
  hubOnly(ctx);
  const id = requireId(appointmentId);
  return tx(
    ctx,
    async (client) => {
      await readAppointment(client, id);
      const { rows } = await client.query<HistoryRow>(
        `SELECT id, kind, from_status, to_status, starts_at, ends_at, staff_member_id, actor_type,
                actor_user_id, created_at
           FROM booking.appointment_history WHERE appointment_id = $1
          ORDER BY created_at DESC, id DESC`,
        [id],
      );
      return rows.map(toHistory);
    },
    true,
  );
}

export type ListAppointmentsInput = {
  from: unknown;
  to: unknown;
  staffMemberId?: unknown;
  status?: unknown;
  /** The number („1042” or „#1042”) or part of the client's name. */
  query?: unknown;
  limit?: unknown;
  offset?: unknown;
  /** B.10: one location (an active one), with the appointments that have none. */
  locationId?: unknown;
};

function requireRange(fromRaw: unknown, toRaw: unknown): { from: Date; to: Date } {
  const from = requireInstant('from', fromRaw);
  const to = requireInstant('to', toRaw);
  if (to.getTime() <= from.getTime()) throw new InvalidInput('to', 'order');
  if (to.getTime() - from.getTime() > APPOINTMENT_LIMITS.listDays * 86_400_000) {
    throw new InvalidInput('to', 'too_long');
  }
  return { from, to };
}

/**
 * The appointments that touch [from, to) (at most 62 days), for BookingCalendar, BookingList and
 * BookingToday: by member, state and search, by start then number, with paging. D-B4-6 = a: the
 * whole team reads the business's calendar.
 */
export async function listAppointmentsInOrg(
  ctx: TenantContext,
  input: ListAppointmentsInput,
): Promise<{ items: Appointment[]; total: number }> {
  hubOnly(ctx);
  const { from, to } = requireRange(input.from, input.to);
  const staffMemberId = input.staffMemberId === undefined ? null : requireId(input.staffMemberId);
  // B.10: the calendar of one location (with the appointments that have none, so none is hidden)
  const locationId = (await locationFilter(ctx, input.locationId)) ?? null;
  let statuses: AppointmentStatus[] | null = null;
  if (input.status !== undefined) {
    if (
      !Array.isArray(input.status) ||
      input.status.length === 0 ||
      !input.status.every((s) => (APPOINTMENT_STATUSES as readonly unknown[]).includes(s))
    ) {
      throw new InvalidInput('status', 'invalid');
    }
    statuses = input.status as AppointmentStatus[];
  }
  const query = normalizeOptionalText('query', input.query, 120);
  const limit =
    input.limit === undefined ? 100 : intIn('limit', input.limit, 1, APPOINTMENT_LIMITS.listMax);
  const offset = input.offset === undefined ? 0 : intIn('offset', input.offset, 0, 1_000_000);
  const numberQuery = query && /^#?\d{1,9}$/.test(query) ? Number(query.replace('#', '')) : null;
  const like = query ? '%' + query.replace(/[\\%_]/g, (m) => '\\' + m) + '%' : null;

  return tx(
    ctx,
    async (client) => {
      const { rows } = await client.query<AppointmentRow & { total: string }>(
        `SELECT ${APPOINTMENT_COLUMNS}, count(*) OVER () AS total
           FROM booking.appointment
          WHERE starts_at < $2 AND ends_at > $1
            AND ($3::uuid IS NULL OR staff_member_id = $3)
            AND ($4::text[] IS NULL OR status = ANY ($4))
            AND ($5::text IS NULL OR client_name ILIKE $5 OR number = $6)
            AND ($9::uuid IS NULL OR location_id IS NULL OR location_id = $9)
          ORDER BY starts_at, number
          LIMIT $7 OFFSET $8`,
        [from, to, staffMemberId, statuses, like, numberQuery, limit, offset, locationId],
      );
      return { items: rows.map(toAppointment), total: rows[0] ? Number(rows[0].total) : 0 };
    },
    true,
  );
}

// ── blocked times ──────────────────────────────────────────────────────────────────────────

export type TimeBlockInput = { startsAt: unknown; endsAt: unknown; reason?: unknown };

function validateBlock(input: TimeBlockInput) {
  const startsAt = requireInstant('startsAt', input.startsAt);
  const endsAt = requireInstant('endsAt', input.endsAt);
  if (endsAt.getTime() <= startsAt.getTime()) throw new InvalidInput('endsAt', 'order');
  if (endsAt.getTime() - startsAt.getTime() > 7 * 86_400_000)
    throw new InvalidInput('endsAt', 'too_long');
  if (startsAt.getTime() % 300_000 !== 0 || endsAt.getTime() % 300_000 !== 0) {
    throw new InvalidInput('startsAt', 'invalid');
  }
  const reason = normalizeOptionalText('reason', input.reason, APPOINTMENT_LIMITS.blockReason);
  return { startsAt, endsAt, reason };
}

/** A blocked time of a member (unavailable); refused over an appointment that still occupies. */
export async function addTimeBlockInOrg(
  ctx: TenantContext,
  scope: AppointmentScope,
  staffMemberId: unknown,
  input: TimeBlockInput,
): Promise<TimeBlock> {
  hubOnly(ctx);
  const staffId = requireId(staffMemberId);
  const b = validateBlock(input);
  return tx(ctx, async (client, exec) => {
    const staff = await readStaffForBooking(client, staffId);
    requireScope(ctx, scope, staff);
    if (staff.archived_at) throw new Conflict('staff_member_removed');
    const id = uuidv7();
    const { rows } = await client.query<BlockRow>(
      `INSERT INTO booking.time_block
         (id, organization_id, staff_member_id, starts_at, ends_at, reason, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${BLOCK_COLUMNS}`,
      [id, ctx.organizationId, staffId, b.startsAt, b.endsAt, b.reason, ctx.userId],
    );
    await audit(exec, ctx, AuditActions.bookingTimeBlockAdded, 'booking_time_block', id, {
      staffMemberId: staffId,
      startsAt: b.startsAt.toISOString(),
      endsAt: b.endsAt.toISOString(),
    });
    return toBlock(rows[0]!);
  });
}

async function readBlock(
  client: PoolClient,
  id: string,
): Promise<BlockRow & { staff_user_id: string }> {
  const { rows } = await client.query<BlockRow & { staff_user_id: string }>(
    `SELECT b.id, b.staff_member_id, b.starts_at, b.ends_at, b.reason, b.archived_at, b.created_at,
            b.updated_at, m.user_id AS staff_user_id
       FROM booking.time_block b JOIN booking.staff_member m ON m.id = b.staff_member_id
      WHERE b.id = $1 FOR UPDATE OF b`,
    [id],
  );
  if (!rows[0]) throw new ResourceNotFound();
  return rows[0];
}

export async function updateTimeBlockInOrg(
  ctx: TenantContext,
  scope: AppointmentScope,
  timeBlockId: unknown,
  input: TimeBlockInput,
): Promise<TimeBlock> {
  hubOnly(ctx);
  const id = requireId(timeBlockId);
  const b = validateBlock(input);
  return tx(ctx, async (client, exec) => {
    const row = await readBlock(client, id);
    requireScope(ctx, scope, { user_id: row.staff_user_id });
    if (row.archived_at) throw new Conflict('time_block_archived');
    const { rows } = await client.query<BlockRow>(
      `UPDATE booking.time_block SET starts_at = $2, ends_at = $3, reason = $4
        WHERE id = $1 RETURNING ${BLOCK_COLUMNS}`,
      [id, b.startsAt, b.endsAt, b.reason],
    );
    await audit(exec, ctx, AuditActions.bookingTimeBlockUpdated, 'booking_time_block', id, {
      startsAt: b.startsAt.toISOString(),
      endsAt: b.endsAt.toISOString(),
    });
    return toBlock(rows[0]!);
  });
}

/** Removes a blocked time (archived, §6.4 c); twice changes nothing. */
export async function archiveTimeBlockInOrg(
  ctx: TenantContext,
  scope: AppointmentScope,
  timeBlockId: unknown,
): Promise<TimeBlock> {
  hubOnly(ctx);
  const id = requireId(timeBlockId);
  return tx(ctx, async (client, exec) => {
    const row = await readBlock(client, id);
    requireScope(ctx, scope, { user_id: row.staff_user_id });
    if (row.archived_at) return toBlock(row);
    const { rows } = await client.query<BlockRow>(
      `UPDATE booking.time_block SET archived_at = now(), archived_by_user_id = $2
        WHERE id = $1 RETURNING ${BLOCK_COLUMNS}`,
      [id, ctx.userId],
    );
    await audit(exec, ctx, AuditActions.bookingTimeBlockArchived, 'booking_time_block', id, {});
    return toBlock(rows[0]!);
  });
}

/** The active blocked times that touch [from, to) (at most 62 days), for the calendar. */
export async function listTimeBlocksInOrg(
  ctx: TenantContext,
  input: { from: unknown; to: unknown; staffMemberId?: unknown },
): Promise<TimeBlock[]> {
  hubOnly(ctx);
  const { from, to } = requireRange(input.from, input.to);
  const staffMemberId = input.staffMemberId === undefined ? null : requireId(input.staffMemberId);
  return tx(
    ctx,
    async (client) => {
      const { rows } = await client.query<BlockRow>(
        `SELECT ${BLOCK_COLUMNS} FROM booking.time_block
          WHERE archived_at IS NULL AND starts_at < $2 AND ends_at > $1
            AND ($3::uuid IS NULL OR staff_member_id = $3)
          ORDER BY starts_at, id`,
        [from, to, staffMemberId],
      );
      return rows.map(toBlock);
    },
    true,
  );
}

// ── B.4b: the upcoming appointments, for S124 and for the catalog ────────────────────────────

export type UpcomingAppointments = {
  /** The appointments that still occupy (not final) and start from now on. */
  count: number;
  /** Their local dates in the business time zone, without repeats, in order. */
  dates: string[];
};

/**
 * How many upcoming appointments (not final, from now on) a service, a member, or a member on
 * some local dates has: „Are {n} programări viitoare” in BookingServices; „{name} are {n}
 * programări pe {date}. Nu le anulăm…” for an exception or a leave and „… nu mai e în echipă, dar
 * are {n} programări viitoare” in BookingTeamSchedule (S124). Nothing is cancelled.
 */
export async function countUpcomingAppointmentsInOrg(
  ctx: TenantContext,
  params: { serviceId?: unknown; staffMemberId?: unknown; fromDate?: unknown; toDate?: unknown },
): Promise<UpcomingAppointments> {
  hubOnly(ctx);
  const serviceId = params.serviceId === undefined ? null : requireId(params.serviceId);
  const staffMemberId = params.staffMemberId === undefined ? null : requireId(params.staffMemberId);
  if (!serviceId && !staffMemberId) throw new InvalidInput('staffMemberId', 'required');
  const date = (field: string, v: unknown) => {
    if (v === undefined) return null;
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      throw new InvalidInput(field, 'invalid');
    }
    return v;
  };
  const fromDate = date('fromDate', params.fromDate);
  const toDate = date('toDate', params.toDate) ?? fromDate;
  const timeZone = await getOrganizationTimeZone(ctx);
  return tx(
    ctx,
    async (client) => {
      const { rows } = await client.query<{ d: string; n: string }>(
        `SELECT to_char((starts_at AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS d, count(*) AS n
           FROM booking.appointment
          WHERE status = ANY ($2::text[]) AND starts_at >= now()
            AND ($3::uuid IS NULL OR service_id = $3)
            AND ($4::uuid IS NULL OR staff_member_id = $4)
            AND ($5::date IS NULL OR (starts_at AT TIME ZONE $1)::date >= $5::date)
            AND ($6::date IS NULL OR (starts_at AT TIME ZONE $1)::date <= $6::date)
          GROUP BY 1 ORDER BY 1`,
        [timeZone, OCCUPYING, serviceId, staffMemberId, fromDate, toDate],
      );
      return {
        count: rows.reduce((sum, r) => sum + Number(r.n), 0),
        dates: rows.map((r) => r.d),
      };
    },
    true,
  );
}

/** The upcoming appointments of several members at once (the removed ones of listStaff). */
export async function countUpcomingByStaffInOrg(
  ctx: TenantContext,
  staffMemberIds: string[],
): Promise<Map<string, number>> {
  hubOnly(ctx);
  if (staffMemberIds.length === 0) return new Map();
  return tx(
    ctx,
    async (client) => {
      const { rows } = await client.query<{ staff_member_id: string; n: string }>(
        `SELECT staff_member_id, count(*) AS n FROM booking.appointment
          WHERE staff_member_id = ANY ($1::uuid[]) AND status = ANY ($2::text[])
            AND starts_at >= now()
          GROUP BY 1`,
        [staffMemberIds, OCCUPYING],
      );
      return new Map(rows.map((r) => [r.staff_member_id, Number(r.n)]));
    },
    true,
  );
}
