import type { PoolClient } from 'pg';
import { AuditActions } from '@ventora/audit';
import type { TenantContext } from '@ventora/access';
import { BookingAppointmentChangedV1, BookingAppointmentCreatedV1 } from '@ventora/contracts';
import { uuidv7, writeOutboxEvent } from '@ventora/db-kit';
import { Conflict, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { getOrganizationTimeZone } from '@ventora/organizations';
import { reserveQuota } from '@ventora/quota';
import {
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
  localSpan,
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
import { checkSeriesPoints, localInstants } from './availability';
import { locationFilter } from './locations';
import { hubOnly } from './actor';
import { requireLocalDate } from './schedule';
import { hhmm } from './slots';
import { doesService } from './staff-services';
import { durationWithin, effectiveTermsFor } from './terms';
import { isUuid } from './validation';

/*
 * Lot B.9b — recurring appointments (design BookingRecurring, S126; plan
 * reports/2026-11-12_plan-booking-b9.md). The series is its rule (booking.appointment_series,
 * written once); its appointments are ordinary appointments, created all at once with series_id
 * and series_index, each with its own state, history, payment and quota unit.
 *
 *   previewSeries  the dates of the rule, each checked before saving („2 din 8 date nu sunt
 *                  libere”): the reason (taken, the member on leave, closed) and the ways out —
 *                  the nearest free time that day, another member free at that time;
 *   createSeries   the rule and the choices for the dates that were not free (skip the date, another
 *                  time that day, another member); every appointment in one transaction; one quota
 *                  unit each, all reserved first (at the limit: QuotaExceeded, nothing written);
 *   getSeries      the rule and its appointments („Se repetă · 3 din 8”);
 *   moveSeries     „Aceasta și următoarele” / „Toate din serie”: another time of day and/or member
 *                  for the open appointments (each keeps its date); „Doar aceasta” is
 *                  moveAppointment;
 *   cancelSeries   „Doar aceasta” / „Aceasta și următoarele” / „Toate din serie”: the open ones; the
 *                  ones that took place stay in the history.
 *
 * The decisions (PROPUS until the founder confirms): D-9b-1 at most 52 appointments or 12 months;
 * D-9b-2 monthly = the same weekday of the month („a treia marți”), a date that does not exist is
 * skipped; D-9b-3 the deposit per appointment, when each is confirmed (B.22, nothing here). The
 * e-mail to the client about a change is B.13.
 */

export const SERIES_LIMITS = {
  minOccurrences: 2,
  maxOccurrences: 52,
  maxMonths: 12,
} as const;

export const SERIES_FREQUENCIES = ['weekly', 'biweekly', 'monthly'] as const;
export type SeriesFrequency = (typeof SERIES_FREQUENCIES)[number];
export type SeriesScope = 'this' | 'following' | 'all';

export type SeriesRuleInput = {
  staffMemberId: unknown;
  serviceId: unknown;
  /** The first appointment (ISO 8601 with offset); its local weekday and time make the rule. */
  startsAt: unknown;
  frequency: unknown;
  /** „Până când”: a local date (YYYY-MM-DD) or a number of appointments, exactly one. */
  until: { date?: unknown; count?: unknown } | undefined;
  durationMinutes?: unknown;
  locationId?: unknown;
};

export type SeriesOccurrence = {
  index: number;
  date: string;
  time: string;
  /** null: the local time does not exist that day (the hour skipped in spring). */
  startsAt: Date | null;
  available: boolean;
  reason: 'taken' | 'staff_on_leave' | 'closed' | null;
  /** „Mută la cea mai apropiată oră liberă”. */
  nearest: { time: string; startsAt: Date } | null;
  /** „Păstrează ora, cu alt membru”: the first is the one the system would choose. */
  otherStaff: Array<{ id: string; displayName: string }>;
};

export type SeriesPreview = {
  timeZone: string;
  frequency: SeriesFrequency;
  /** The local time of every appointment („În fiecare marți, la 10:00”). */
  time: string;
  /** 0 = Monday … 6 = Sunday; monthly: which one of the month (1–5). */
  weekday: number;
  weekOfMonth: number | null;
  occurrences: SeriesOccurrence[];
  unavailable: number;
};

export type SeriesAdjustment = {
  /** The date's index in the preview (1-based). */
  index: unknown;
  /** „Sari peste această dată”. */
  skip?: unknown;
  /** Another time the same day (ISO 8601 with offset). */
  startsAt?: unknown;
  /** Another member. */
  staffMemberId?: unknown;
};

export type CreateSeriesInput = SeriesRuleInput & {
  /** A UUID chosen by the caller: a retry with the same id returns the same series. */
  id: unknown;
  clientId?: unknown;
  client?: ClientInput;
  confirmed?: unknown;
  teamNote?: unknown;
  adjustments?: unknown;
};

export type Series = {
  id: string;
  clientId: string;
  serviceId: string;
  staffMemberId: string;
  frequency: SeriesFrequency;
  time: string;
  firstDate: string;
  until: { date: string } | { count: number };
  /** Every appointment of the series, in order (the cancelled and the past ones too). */
  appointments: Appointment[];
};

// ── the rule ─────────────────────────────────────────────────────────────────────────────

type Rule = {
  staffMemberId: string;
  serviceId: string;
  frequency: SeriesFrequency;
  firstDate: string;
  minute: number;
  until: { date: string } | { count: number };
  dates: string[];
  durationMinutes: unknown;
  locationId: string | undefined;
  timeZone: string;
};

const DAY = 86_400_000;
const toDate = (d: string) => new Date(`${d}T00:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);

function addMonths(date: string, months: number): string {
  const d = toDate(date);
  return fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate())));
}

/** The n-th `weekday` (0 = Sunday, as getUTCDay) of the month `offset` months after `date`. */
function nthWeekdayOfMonth(
  date: string,
  offset: number,
  weekday: number,
  n: number,
): string | null {
  const d = toDate(date);
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1));
  const shift = (weekday - first.getUTCDay() + 7) % 7;
  const day = new Date(first.getTime() + (shift + (n - 1) * 7) * DAY);
  // D-9b-2: the fifth Tuesday of a month that has only four is skipped
  return day.getUTCMonth() === first.getUTCMonth() ? fmt(day) : null;
}

/** The local dates of the rule (D-9b-1: at most 52, before first date + 12 months). */
export function seriesDates(
  firstDate: string,
  frequency: SeriesFrequency,
  until: { date: string } | { count: number },
): string[] {
  const limit = addMonths(firstDate, SERIES_LIMITS.maxMonths);
  const last = 'date' in until ? until.date : limit;
  const wanted = 'count' in until ? until.count : Infinity;
  const weekday = toDate(firstDate).getUTCDay();
  const n = Math.ceil(toDate(firstDate).getUTCDate() / 7);
  const out: string[] = [];
  for (let k = 0; out.length < wanted; k += 1) {
    const date =
      frequency === 'monthly'
        ? nthWeekdayOfMonth(firstDate, k, weekday, n)
        : fmt(new Date(toDate(firstDate).getTime() + k * (frequency === 'weekly' ? 7 : 14) * DAY));
    if (frequency === 'monthly' && date === null) {
      if (addMonths(firstDate, k) >= limit) break;
      continue;
    }
    if (date! > last || date! >= limit) break;
    out.push(date!);
    if (out.length > SERIES_LIMITS.maxOccurrences) break;
  }
  if (out.length > SERIES_LIMITS.maxOccurrences || ('count' in until && out.length < wanted)) {
    throw new InvalidInput('until', 'too_long');
  }
  if (out.length < SERIES_LIMITS.minOccurrences) throw new InvalidInput('until', 'too_short');
  return out;
}

function requireUntil(raw: SeriesRuleInput['until'], firstDate: string) {
  const u = raw ?? {};
  const hasDate = u.date !== undefined && u.date !== null;
  const hasCount = u.count !== undefined && u.count !== null;
  if (hasDate === hasCount) throw new InvalidInput('until', 'required');
  if (hasCount) {
    const c = u.count;
    if (
      typeof c !== 'number' ||
      !Number.isInteger(c) ||
      c < SERIES_LIMITS.minOccurrences ||
      c > SERIES_LIMITS.maxOccurrences
    ) {
      throw new InvalidInput('until', 'invalid');
    }
    return { count: c };
  }
  const date = requireLocalDate('until', u.date);
  if (date <= firstDate) throw new InvalidInput('until', 'too_short');
  if (date >= addMonths(firstDate, SERIES_LIMITS.maxMonths))
    throw new InvalidInput('until', 'too_long');
  return { date };
}

async function readRule(ctx: TenantContext, input: SeriesRuleInput): Promise<Rule> {
  if (!isUuid(input.staffMemberId)) throw new InvalidInput('staffMemberId', 'invalid');
  if (!isUuid(input.serviceId)) throw new InvalidInput('serviceId', 'invalid');
  if (!(SERIES_FREQUENCIES as readonly unknown[]).includes(input.frequency)) {
    throw new InvalidInput('frequency', 'invalid');
  }
  const frequency = input.frequency as SeriesFrequency;
  const startsAt = requireInstant('startsAt', input.startsAt);
  if (input.durationMinutes !== undefined) requireDuration(input.durationMinutes);
  const locationId = await locationFilter(ctx, input.locationId);
  const timeZone = await getOrganizationTimeZone(ctx);
  const span = await tx(ctx, (client) => localSpan(client, timeZone, startsAt, startsAt), true);
  if (!span.aligned) throw new InvalidInput('startsAt', 'invalid');
  const until = requireUntil(input.until, span.date);
  return {
    staffMemberId: input.staffMemberId,
    serviceId: input.serviceId,
    frequency,
    firstDate: span.date,
    minute: span.startMin,
    until,
    dates: seriesDates(span.date, frequency, until),
    durationMinutes: input.durationMinutes,
    locationId,
    timeZone,
  };
}

// ── preview ──────────────────────────────────────────────────────────────────────────────

/** „2 din 8 date nu sunt libere”: every date of the rule, checked before saving. */
export async function previewSeriesInOrg(
  ctx: TenantContext,
  input: SeriesRuleInput,
): Promise<SeriesPreview> {
  hubOnly(ctx);
  const rule = await readRule(ctx, input);
  const points = rule.dates.map((date) => ({ date, minute: rule.minute }));
  const [instants, checks] = await Promise.all([
    localInstants(ctx, rule.timeZone, points),
    checkSeriesPoints(ctx, {
      serviceId: rule.serviceId,
      staffMemberId: rule.staffMemberId,
      durationMinutes: rule.durationMinutes,
      locationId: rule.locationId,
      points,
    }),
  ]);
  const nearest = await localInstants(
    ctx,
    rule.timeZone,
    checks
      .filter((c) => c.nearestMinute !== null)
      .map((c) => ({ date: c.date, minute: c.nearestMinute! })),
  );
  const staffIds = [...new Set(checks.flatMap((c) => c.otherStaffIds))];
  const names = await tx(
    ctx,
    async (client) =>
      new Map(
        (
          await client.query<{ id: string; display_name: string }>(
            `SELECT id, display_name FROM booking.staff_member WHERE id = ANY($1::uuid[])`,
            [staffIds],
          )
        ).rows.map((r) => [r.id, r.display_name]),
      ),
    true,
  );
  let n = 0;
  const occurrences = checks.map((c, i): SeriesOccurrence => {
    const startsAt = instants[i] ?? null;
    let near: SeriesOccurrence['nearest'] = null;
    if (c.nearestMinute !== null) {
      const at = nearest[n++];
      if (at) near = { time: hhmm(c.nearestMinute), startsAt: at };
    }
    const available = c.available && startsAt !== null;
    return {
      index: i + 1,
      date: c.date,
      time: hhmm(c.minute),
      startsAt,
      available,
      reason: available ? null : (c.reason ?? 'closed'),
      nearest: near,
      otherStaff: c.otherStaffIds.map((id) => ({ id, displayName: names.get(id)! })),
    };
  });
  const first = toDate(rule.firstDate);
  return {
    timeZone: rule.timeZone,
    frequency: rule.frequency,
    time: hhmm(rule.minute),
    weekday: (first.getUTCDay() + 6) % 7,
    weekOfMonth: rule.frequency === 'monthly' ? Math.ceil(first.getUTCDate() / 7) : null,
    occurrences,
    unavailable: occurrences.filter((o) => !o.available).length,
  };
}

// ── create ───────────────────────────────────────────────────────────────────────────────

type Planned = { index: number; staffMemberId: string; startsAt: Date; id: string };

type SeriesRow = {
  id: string;
  client_id: string;
  service_id: string;
  staff_member_id: string;
  frequency: SeriesFrequency;
  start_minute: number;
  first_date: string;
  until_date: string | null;
  occurrence_count: number | null;
};

const SERIES_COLUMNS = `id, client_id, service_id, staff_member_id, frequency, start_minute,
  to_char(first_date, 'YYYY-MM-DD') AS first_date, to_char(until_date, 'YYYY-MM-DD') AS until_date,
  occurrence_count`;

async function readSeries(client: PoolClient, id: string): Promise<SeriesRow | null> {
  return (
    (
      await client.query<SeriesRow>(
        `SELECT ${SERIES_COLUMNS} FROM booking.appointment_series WHERE id = $1`,
        [id],
      )
    ).rows[0] ?? null
  );
}

async function readSeriesAppointments(
  client: PoolClient,
  seriesId: string,
  lock = false,
): Promise<Array<AppointmentRow & { staff_user_id: string }>> {
  return (
    await client.query<AppointmentRow & { staff_user_id: string }>(
      `SELECT ${APPOINTMENT_COLUMNS.split(',')
        .map((c) => `a.${c.trim()}`)
        .join(', ')}, m.user_id AS staff_user_id
         FROM booking.appointment a
         JOIN booking.staff_member m ON m.id = a.staff_member_id
        WHERE a.series_id = $1
        ORDER BY a.series_index${lock ? ' FOR UPDATE OF a' : ''}`,
      [seriesId],
    )
  ).rows;
}

function toSeries(row: SeriesRow, appointments: AppointmentRow[]): Series {
  return {
    id: row.id,
    clientId: row.client_id,
    serviceId: row.service_id,
    staffMemberId: row.staff_member_id,
    frequency: row.frequency,
    time: hhmm(row.start_minute),
    firstDate: row.first_date,
    until: row.until_date ? { date: row.until_date } : { count: row.occurrence_count! },
    appointments: appointments.map(toAppointment),
  };
}

function seriesConflict(index: number, err: unknown): never {
  const pg = err as PgError;
  if (
    pg?.code === '23P01' ||
    (err instanceof Conflict &&
      (err.message === 'staff_unavailable' || err.message === 'resource_unavailable'))
  ) {
    throw new Conflict(`series_date_unavailable:${index}`);
  }
  throw err;
}

function requireAdjustments(raw: unknown, count: number) {
  if (raw === undefined || raw === null) return new Map<number, SeriesAdjustment>();
  if (!Array.isArray(raw)) throw new InvalidInput('adjustments', 'invalid');
  const out = new Map<number, SeriesAdjustment>();
  raw.forEach((value, i) => {
    const a = (value ?? {}) as SeriesAdjustment;
    const field = (name: string) => `adjustments.${i + 1}.${name}`;
    if (
      typeof a.index !== 'number' ||
      !Number.isInteger(a.index) ||
      a.index < 1 ||
      a.index > count ||
      out.has(a.index)
    ) {
      throw new InvalidInput(field('index'), 'invalid');
    }
    if (a.skip !== undefined && a.skip !== true) throw new InvalidInput(field('skip'), 'invalid');
    if (a.skip && (a.startsAt !== undefined || a.staffMemberId !== undefined)) {
      throw new InvalidInput(field('skip'), 'invalid');
    }
    if (a.staffMemberId !== undefined && !isUuid(a.staffMemberId)) {
      throw new InvalidInput(field('staffMemberId'), 'invalid');
    }
    if (!a.skip && a.startsAt === undefined && a.staffMemberId === undefined) {
      throw new InvalidInput(field('index'), 'invalid');
    }
    out.set(a.index, a);
  });
  return out;
}

/**
 * „Creează 8 programări”: the rule, the client and the choices for the dates that were not free.
 * Every appointment in one transaction with the checks of a new appointment; a date that still does
 * not fit: Conflict('series_date_unavailable:<index>'), nothing written.
 */
export async function createSeriesInOrg(
  ctx: TenantContext,
  scope: AppointmentScope,
  input: CreateSeriesInput,
): Promise<Series> {
  hubOnly(ctx);
  if (!isUuid(input.id)) throw new InvalidInput('id', 'invalid');
  const seriesId = input.id;
  const teamNote = normalizeOptionalText('teamNote', input.teamNote, APPOINTMENT_LIMITS.teamNote);
  if (input.confirmed !== undefined && typeof input.confirmed !== 'boolean') {
    throw new InvalidInput('confirmed', 'invalid');
  }
  const status: AppointmentStatus = input.confirmed === false ? 'unconfirmed' : 'confirmed';
  if (input.clientId === undefined && input.client === undefined) {
    throw new InvalidInput('clientId', 'required');
  }
  if (input.clientId !== undefined && !isUuid(input.clientId)) throw new ResourceNotFound();
  const clientId = (input.clientId as string | undefined) ?? null;
  const rule = await readRule(ctx, input);
  const adjustments = requireAdjustments(input.adjustments, rule.dates.length);

  // a retry of the same operation: the same series, nothing written twice
  const existing = await tx(
    ctx,
    async (client) => {
      const row = await readSeries(client, seriesId);
      return row ? { row, appointments: await readSeriesAppointments(client, seriesId) } : null;
    },
    true,
  );
  if (existing) {
    const r = existing.row;
    if (
      r.staff_member_id !== rule.staffMemberId ||
      r.service_id !== rule.serviceId ||
      r.frequency !== rule.frequency ||
      r.first_date !== rule.firstDate ||
      r.start_minute !== rule.minute
    ) {
      throw new Conflict('operation_reused');
    }
    for (const a of existing.appointments) await settleQuota(ctx, a.id, 'commit');
    return toSeries(r, existing.appointments);
  }

  const instants = await localInstants(
    ctx,
    rule.timeZone,
    rule.dates.map((date) => ({ date, minute: rule.minute })),
  );
  const planned: Planned[] = [];
  for (let i = 0; i < rule.dates.length; i += 1) {
    const index = i + 1;
    const a = adjustments.get(index);
    if (a?.skip) continue;
    let startsAt = instants[i] ?? null;
    if (a?.startsAt !== undefined) {
      startsAt = requireInstant(`adjustments.${index}.startsAt`, a.startsAt);
      const span = await tx(
        ctx,
        (client) => localSpan(client, rule.timeZone, startsAt!, startsAt!),
        true,
      );
      // „cea mai apropiată oră liberă” is the same day
      if (span.date !== rule.dates[i]) {
        throw new InvalidInput(`adjustments.${index}.startsAt`, 'other_date');
      }
    }
    // the hour skipped in spring, not moved: the date does not fit as it is
    if (!startsAt) throw new Conflict(`series_date_unavailable:${index}`);
    planned.push({
      index,
      staffMemberId: (a?.staffMemberId as string | undefined) ?? rule.staffMemberId,
      startsAt,
      id: uuidv7(),
    });
  }
  if (planned.length < SERIES_LIMITS.minOccurrences) {
    throw new InvalidInput('adjustments', 'too_few');
  }

  // the members: in the calendar, eligible, in scope, at the location
  const staffById = new Map<string, StaffForBooking>();
  for (const p of planned) {
    if (staffById.has(p.staffMemberId)) continue;
    const staff = await tx(ctx, (client) => readStaffForBooking(client, p.staffMemberId), true);
    requireScope(ctx, scope, staff);
    await requireBookableStaff(ctx, staff);
    if (rule.locationId && staff.location_id && staff.location_id !== rule.locationId) {
      throw new Conflict('staff_other_location');
    }
    staffById.set(p.staffMemberId, staff);
  }

  // one unit per appointment, all reserved first; a refusal gives the reserved ones back
  const reserved: string[] = [];
  try {
    for (const p of planned) {
      await reserveQuota(ctx, APPOINTMENTS_QUOTA_KEY, 1, p.id);
      reserved.push(p.id);
    }
  } catch (err) {
    for (const id of reserved) await settleQuota(ctx, id, 'release');
    throw err;
  }

  let created: Series;
  try {
    created = await tx(ctx, async (client, exec) => {
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
      const service = (
        await client.query<ServiceForBooking>(
          `SELECT id, name, duration_minutes, duration_max_minutes, price_kind, price_minor,
                  price_max_minor, currency, capacity, archived_at
             FROM booking.service WHERE id = $1`,
          [rule.serviceId],
        )
      ).rows[0];
      if (!service) throw new ResourceNotFound();
      if (service.archived_at) throw new Conflict('service_archived');
      const terms = await effectiveTermsFor(client, rule.serviceId, service, [...staffById.keys()]);
      for (const staffId of staffById.keys()) {
        // B.2b (S129): every member of the series must do the service
        if (!(await doesService(client, staffId, rule.serviceId))) {
          throw new Conflict('staff_not_for_service');
        }
        if (durationWithin(terms.get(staffId)!, rule.durationMinutes) === null) {
          throw new InvalidInput('durationMinutes', 'invalid');
        }
      }

      const inserted = await client.query(
        `INSERT INTO booking.appointment_series
           (id, organization_id, client_id, service_id, staff_member_id, frequency, start_minute,
            first_date, until_date, occurrence_count, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO NOTHING`,
        [
          seriesId,
          ctx.organizationId,
          clientRow.id,
          rule.serviceId,
          rule.staffMemberId,
          rule.frequency,
          rule.minute,
          rule.firstDate,
          'date' in rule.until ? rule.until.date : null,
          'count' in rule.until ? rule.until.count : null,
          ctx.userId,
        ],
      );
      // a concurrent retry of the same series got there first
      if (inserted.rowCount === 0) throw new Conflict('operation_reused');

      const rows: AppointmentRow[] = [];
      for (const p of planned) {
        const staff = staffById.get(p.staffMemberId)!;
        const own = terms.get(p.staffMemberId)!;
        const duration = durationWithin(own, rule.durationMinutes)!;
        const endsAt = new Date(p.startsAt.getTime() + duration * 60_000);
        const locationId = staff.location_id ?? rule.locationId ?? null;
        let ins: Awaited<ReturnType<typeof insertAppointmentRow>>;
        try {
          await requireWithinSchedule(client, rule.timeZone, p.staffMemberId, p.startsAt, endsAt);
          ins = await insertAppointmentRow(client, ctx, {
            id: p.id,
            staffMemberId: p.staffMemberId,
            staffDisplayName: staff.display_name,
            service,
            client: clientRow,
            startsAt: p.startsAt,
            endsAt,
            duration,
            status,
            price: own,
            teamNote,
            locationId,
            visit: null,
            series: { id: seriesId, index: p.index },
          });
        } catch (err) {
          seriesConflict(p.index, err);
        }
        const row = ins.row!;
        await history(client, ctx, p.id, {
          kind: 'created',
          to: status,
          startsAt: p.startsAt,
          endsAt,
          staffMemberId: p.staffMemberId,
        });
        await audit(
          exec,
          ctx,
          AuditActions.bookingAppointmentCreated,
          'booking_appointment',
          p.id,
          {
            number: ins.number,
            staffMemberId: p.staffMemberId,
            serviceId: rule.serviceId,
            clientId: clientRow.id,
            startsAt: p.startsAt.toISOString(),
            durationMinutes: duration,
            status,
            seriesId,
            seriesIndex: p.index,
            ...(ins.resources.length ? { resourceIds: ins.resources.map((r) => r.id) } : {}),
            ...(locationId ? { locationId } : {}),
          },
        );
        await writeOutboxEvent(client, 'booking', BookingAppointmentCreatedV1, {
          organizationId: ctx.organizationId,
          sourceApp: 'platform',
          resourceId: p.id,
          payload: {
            appointmentId: p.id,
            number: ins.number,
            staffMemberId: p.staffMemberId,
            serviceId: rule.serviceId,
            clientId: clientRow.id,
            startsAt: p.startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            status,
            source: 'hub',
          },
        });
        rows.push(row);
      }
      return toSeries((await readSeries(client, seriesId))!, rows);
    });
  } catch (err) {
    // nothing was written: every reserved unit goes back
    for (const p of planned) await settleQuota(ctx, p.id, 'release');
    throw err;
  }
  for (const p of planned) await settleQuota(ctx, p.id, 'commit');
  return created;
}

// ── read ─────────────────────────────────────────────────────────────────────────────────

/** BookingDetail „Se repetă · 3 din 8”: the rule and every appointment of the series. */
export async function getSeriesInOrg(ctx: TenantContext, seriesId: unknown): Promise<Series> {
  hubOnly(ctx);
  if (!isUuid(seriesId)) throw new ResourceNotFound();
  return tx(
    ctx,
    async (client) => {
      const row = await readSeries(client, seriesId);
      if (!row) throw new ResourceNotFound();
      return toSeries(row, await readSeriesAppointments(client, seriesId));
    },
    true,
  );
}

// ── change / cancel (Doar aceasta / Aceasta și următoarele / Toate din serie) ─────────────

/** The appointments the choice covers, from an appointment of the series, locked. */
async function covered(
  client: PoolClient,
  ctx: TenantContext,
  scope: AppointmentScope,
  appointmentId: string,
  mode: SeriesScope,
) {
  const anchor = (
    await client.query<{ series_id: string | null; series_index: number | null }>(
      `SELECT series_id, series_index FROM booking.appointment WHERE id = $1`,
      [appointmentId],
    )
  ).rows[0];
  if (!anchor) throw new ResourceNotFound();
  if (!anchor.series_id) throw new Conflict('not_in_series');
  const all = await readSeriesAppointments(client, anchor.series_id, true);
  const rows =
    mode === 'this'
      ? all.filter((r) => r.id === appointmentId)
      : mode === 'following'
        ? all.filter((r) => r.series_index! >= anchor.series_index!)
        : all;
  for (const r of rows) requireScope(ctx, scope, { user_id: r.staff_user_id });
  return { seriesId: anchor.series_id, rows };
}

function requireMode(value: unknown, allowed: readonly SeriesScope[]): SeriesScope {
  if (!(allowed as readonly unknown[]).includes(value)) throw new InvalidInput('mode', 'invalid');
  return value as SeriesScope;
}

/**
 * „Anulează”: „Doar aceasta” (as cancelAppointment), „Aceasta și următoarele” or „Toate din
 * serie” — the open ones (each with its history, its event with the quota refund before the start
 * and its audit); the ones that took place or are in progress stay as they are.
 */
export async function cancelSeriesInOrg(
  ctx: TenantContext,
  scope: AppointmentScope,
  appointmentId: unknown,
  input: { mode: unknown; by: unknown },
): Promise<Appointment[]> {
  hubOnly(ctx);
  if (!isUuid(appointmentId)) throw new ResourceNotFound();
  const mode = requireMode(input.mode, ['this', 'following', 'all']);
  const by = input.by;
  if (by !== 'client' && by !== 'business') throw new InvalidInput('by', 'invalid');
  return tx(ctx, async (client, exec) => {
    const { seriesId, rows } = await covered(client, ctx, scope, appointmentId, mode);
    const open = mode === 'this' ? rows : rows.filter((r) => MOVABLE.includes(r.status));
    if (open.length === 0) throw new Conflict('appointment_final');
    const settings = await readSettings(client);
    const out: Appointment[] = [];
    for (const r of open) {
      out.push(toAppointment(await cancelRow(client, exec, ctx, r, by, settings, { seriesId })));
    }
    return out;
  });
}

/**
 * „Modifică” → „Aceasta și următoarele” / „Toate din serie”: another local time of day and/or
 * another member for the open appointments; each keeps its date. A date that no longer fits:
 * Conflict('series_date_unavailable:<index>'), nothing changed. „Doar aceasta” is moveAppointment.
 */
export async function moveSeriesInOrg(
  ctx: TenantContext,
  scope: AppointmentScope,
  appointmentId: unknown,
  input: { mode: unknown; time?: unknown; staffMemberId?: unknown },
): Promise<Appointment[]> {
  hubOnly(ctx);
  if (!isUuid(appointmentId)) throw new ResourceNotFound();
  const mode = requireMode(input.mode, ['following', 'all']);
  if (input.time === undefined && input.staffMemberId === undefined) {
    throw new InvalidInput('time', 'required');
  }
  let minute: number | null = null;
  if (input.time !== undefined) {
    const m = typeof input.time === 'string' ? /^(\d{2}):(\d{2})$/.exec(input.time) : null;
    minute = m ? Number(m[1]) * 60 + Number(m[2]) : -1;
    if (!m || minute >= 1440 || minute % 5 !== 0) throw new InvalidInput('time', 'invalid');
  }
  let staff: StaffForBooking | null = null;
  if (input.staffMemberId !== undefined) {
    if (!isUuid(input.staffMemberId)) throw new InvalidInput('staffMemberId', 'invalid');
    const staffId = input.staffMemberId;
    staff = await tx(ctx, (client) => readStaffForBooking(client, staffId), true);
    requireScope(ctx, scope, staff);
    await requireBookableStaff(ctx, staff);
  }
  const timeZone = await getOrganizationTimeZone(ctx);
  return tx(ctx, async (client, exec) => {
    const { seriesId, rows } = await covered(client, ctx, scope, appointmentId, mode);
    const open = rows.filter((r) => MOVABLE.includes(r.status));
    if (open.length === 0) throw new Conflict('appointment_final');
    const out: Appointment[] = [];
    for (const r of open) {
      const staffMemberId = staff?.id ?? r.staff_member_id;
      if (staff) {
        // B.10: the appointment keeps its location
        if (r.location_id && staff.location_id && staff.location_id !== r.location_id) {
          throw new Conflict('staff_other_location');
        }
        if (!(await doesService(client, staff.id, r.service_id))) {
          throw new Conflict('staff_not_for_service');
        }
      }
      let startsAt = r.starts_at;
      if (minute !== null) {
        const span = await localSpan(client, timeZone, r.starts_at, r.starts_at);
        const at = (
          await client.query<{ at: Date; back: string }>(
            `SELECT x.at, to_char(x.at AT TIME ZONE $3, 'YYYY-MM-DD"T"HH24:MI') AS back
               FROM (SELECT (($1::date + make_interval(mins => $2))::timestamp AT TIME ZONE $3)
                            AS at) x`,
            [span.date, minute, timeZone],
          )
        ).rows[0]!;
        if (at.back !== `${span.date}T${hhmm(minute)}`) {
          throw new Conflict(`series_date_unavailable:${r.series_index}`);
        }
        startsAt = at.at;
      }
      const endsAt = new Date(startsAt.getTime() + r.duration_minutes * 60_000);
      let updated: AppointmentRow;
      try {
        await requireWithinSchedule(client, timeZone, staffMemberId, startsAt, endsAt);
        updated = (
          await client.query<AppointmentRow>(
            `UPDATE booking.appointment
                SET starts_at = $2, ends_at = $3, staff_member_id = $4, staff_display_name = $5
              WHERE id = $1
              RETURNING ${APPOINTMENT_COLUMNS}`,
            [r.id, startsAt, endsAt, staffMemberId, staff?.display_name ?? r.staff_display_name],
          )
        ).rows[0]!;
      } catch (err) {
        seriesConflict(r.series_index!, err);
      }
      await history(client, ctx, r.id, { kind: 'moved', startsAt, endsAt, staffMemberId });
      await writeOutboxEvent(client, 'booking', BookingAppointmentChangedV1, {
        organizationId: ctx.organizationId,
        sourceApp: 'platform',
        resourceId: r.id,
        payload: {
          appointmentId: r.id,
          staffMemberId,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
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
          startsAt: startsAt.toISOString(),
          staffMemberId,
          durationMinutes: r.duration_minutes,
        },
        seriesId,
      });
      out.push(toAppointment(updated));
    }
    return out;
  });
}
