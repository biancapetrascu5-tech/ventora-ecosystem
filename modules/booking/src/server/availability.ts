import type { PoolClient } from 'pg';
import type { TenantContext } from '@ventora/access';
import { Conflict, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { getOrganizationTimeZone } from '@ventora/organizations';
import { withBookingTx } from './db';
import { daysBetween, eachDate, requireLocalDate, type Interval } from './schedule';
import { ceilToStep, hhmm, isFreeAt, memberSlots, type Busy, type SlotRules } from './slots';
import { requiredResources } from './resources';
import { staffForService } from './staff-services';
import { durationWithin, effectiveTermsFor } from './terms';
import { readCalendarStaff, staffEligibility, staffLocalDays, type CalendarStaff } from './staff';
import { isUuid, LIMITS } from './validation';

/*
 * Lot B.5 — the free slots (BOOKING.md §3 B.5; plan reports/2026-11-10_1115_plan-booking-b5.md,
 * approved 10.11.2026 with D-B5-1…8 = a). One read-only transaction per window of days: the
 * business time zone (C.0), the service, the members in the calendar and still eligible (D-B2-6),
 * their local days (B.2, the same rule createAppointment applies, D-B4-4), the occupying
 * appointments and the active blocked times, the booking rules (notice, buffer). The computation
 * is the pure server/slots.ts; local minutes ↔ instants happen in Postgres (AT TIME ZONE), so the
 * change to or from summer time keeps the local hours.
 *
 * mode 'team' (Hub: BookingNew, BookingCalendar „Primul loc liber”): from now on, no notice
 * (D-B5-3 = a), every member in the calendar, a duration between the service's minimum and maximum.
 * mode 'online' (the public page, B.11): the notice, only services and members bookable online, the
 * maximum duration (S123-3), a horizon of 30 days (D-B5-5 = a). B.5 exposes only the team mode
 * through the contract; B.11 calls the same functions from the public page's context.
 */

export const SLOT_LIMITS = {
  /** getFreeSlots: at most this many days at once (the 5-day strip of BookingPublic, a week). */
  days: 7,
  /** findFirstFreeSlot: how far ahead (D-B5-5 = a). */
  teamHorizonDays: 62,
  onlineHorizonDays: 30,
} as const;

export type SlotMode = 'team' | 'online';

/** The occupying states (the same list as server/appointments.ts and the trigger). */
const OCCUPYING = ['awaiting_payment', 'unconfirmed', 'confirmed', 'in_progress'];

export type FreeSlot = {
  /** Local 'HH:MM' in the business time zone. */
  time: string;
  startsAt: Date;
  /** false: on the grid, taken (BookingNew shows it struck through); only for one member. */
  available: boolean;
  /** „Oricine e liber”: who is free at this time, the first one is who would be chosen (D-B5-4). */
  staffMemberIds?: string[];
};

export type FreeSlotDay = { date: string; slots: FreeSlot[] };

export type FreeSlots = {
  timeZone: string;
  durationMinutes: number;
  days: FreeSlotDay[];
};

export type FirstFreeSlot = {
  date: string;
  time: string;
  startsAt: Date;
  staffMemberId: string;
  staffDisplayName: string;
};

export type SlotQuery = {
  serviceId: unknown;
  /** A member's id, or 'any' („Oricine e liber”). */
  staffMemberId: unknown;
  durationMinutes?: unknown;
  mode: SlotMode;
  /**
   * B.10: an active location already checked (server/locations.ts): only the members who work
   * there or everywhere, and the resources standing there or everywhere. undefined = all.
   */
  locationId?: string;
};

// ── loading ─────────────────────────────────────────────────────────────────────────────────

type ServiceRow = {
  id: string;
  duration_minutes: number;
  duration_max_minutes: number | null;
  price_kind: 'fixed' | 'from' | 'range';
  price_minor: number;
  price_max_minor: number | null;
  capacity: number;
  bookable_online: boolean;
  archived_at: Date | null;
};

type MemberDay = {
  staffMemberId: string;
  date: string;
  intervals: Interval[];
  busy: Busy[];
  rules: SlotRules;
  /** Occupying appointments of the member that start this date (D-B5-4: fewest first). */
  load: number;
};

type Loaded = {
  timeZone: string;
  durationMinutes: number;
  /** The members considered, in the team's order (empty: nothing can be booked). */
  staff: CalendarStaff[];
  days: MemberDay[];
};

function requireId(id: unknown): string {
  if (!isUuid(id)) throw new ResourceNotFound();
  return id;
}

function requireStaffChoice(value: unknown): string | 'any' {
  return value === 'any' ? 'any' : requireId(value);
}

/** 'YYYY-MM-DDTHH:MI' local → date and minute. */
function splitLocal(text: string): { date: string; minute: number } {
  return {
    date: text.slice(0, 10),
    minute: Number(text.slice(11, 13)) * 60 + Number(text.slice(14, 16)),
  };
}

/** The pieces of a local interval on each date it touches, from `from` to `to`. */
function piecesByDate(
  start: string,
  end: string,
  from: string,
  to: string,
): Array<{ date: string; startMin: number; endMin: number }> {
  const s = splitLocal(start);
  const e = splitLocal(end);
  const out: Array<{ date: string; startMin: number; endMin: number }> = [];
  const first = s.date < from ? from : s.date;
  const last = e.date > to ? to : e.date;
  if (first > last) return out;
  for (const date of eachDate(first, last)) {
    const startMin = date === s.date ? s.minute : 0;
    const endMin = date === e.date ? e.minute : 1440;
    if (endMin > startMin) out.push({ date, startMin, endMin });
  }
  return out;
}

async function readService(client: PoolClient, id: string): Promise<ServiceRow> {
  const { rows } = await client.query<ServiceRow>(
    `SELECT id, duration_minutes, duration_max_minutes, price_kind, price_minor, price_max_minor,
            capacity, bookable_online, archived_at
       FROM booking.service WHERE id = $1`,
    [id],
  );
  if (!rows[0]) throw new ResourceNotFound();
  return rows[0];
}

function durationFor(service: ServiceRow, mode: SlotMode, value: unknown): number {
  const max = service.duration_max_minutes ?? service.duration_minutes;
  // online: always the maximum (S123-3); the team may ask for less
  if (mode === 'online' || value === undefined) return max;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value % LIMITS.durationStep !== 0 ||
    value < service.duration_minutes ||
    value > max
  ) {
    throw new InvalidInput('durationMinutes', 'invalid');
  }
  return value;
}

/** The members to consider: one (checked) or all, in the calendar, eligible, online if asked. */
async function candidateStaff(
  ctx: TenantContext,
  client: PoolClient,
  serviceId: string,
  choice: string | 'any',
  mode: SlotMode,
  locationId?: string,
): Promise<CalendarStaff[]> {
  const everyone = await readCalendarStaff(client, choice === 'any' ? null : choice);
  // B.10: a member of another location, asked for directly, is refused; „any” skips them
  const all = locationId
    ? everyone.filter((s) => s.locationId === null || s.locationId === locationId)
    : everyone;
  if (choice !== 'any' && everyone.length > 0 && all.length === 0) {
    throw new Conflict('staff_other_location');
  }
  // B.2b (S129): only the members who do the service; one who doesn't, asked for directly, is refused
  const doing = new Set(await staffForService(client, serviceId));
  if (choice !== 'any' && all.length > 0 && !doing.has(choice)) {
    throw new Conflict('staff_not_for_service');
  }
  const staff = all.filter((s) => doing.has(s.id));
  if (choice !== 'any' && staff.length === 0) {
    const { rows } = await client.query(`SELECT 1 FROM booking.staff_member WHERE id = $1`, [
      choice,
    ]);
    if (rows.length === 0) throw new ResourceNotFound();
    throw new Conflict('staff_member_removed');
  }
  const eligible: CalendarStaff[] = [];
  for (const s of staff) {
    // D-B2-6 = a: read fresh from core/access on every call
    if ((await staffEligibility(ctx, s.userId)) === 'eligible') eligible.push(s);
  }
  if (choice !== 'any' && eligible.length === 0) throw new Conflict('staff_member_removed');
  return mode === 'online' ? eligible.filter((s) => s.bookableOnline) : eligible;
}

/**
 * Everything the computation needs for the dates `from`…`to` (local, in the business time zone):
 * the members' days, what occupies them, the rules.
 */
async function load(
  ctx: TenantContext,
  query: SlotQuery,
  from: string,
  to: string,
): Promise<Loaded> {
  const serviceId = requireId(query.serviceId);
  const choice = requireStaffChoice(query.staffMemberId);
  const timeZone = await getOrganizationTimeZone(ctx);

  return withBookingTx(
    ctx.organizationId,
    async (client) => {
      const service = await readService(client, serviceId);
      const candidates = await candidateStaff(
        ctx,
        client,
        serviceId,
        choice,
        query.mode,
        query.locationId,
      );
      // B.2c: each member's own duration (the service's by default); online always the maximum
      const terms = await effectiveTermsFor(
        client,
        serviceId,
        service,
        candidates.map((c) => c.id),
      );
      const durationOf = new Map<string, number>();
      for (const c of candidates) {
        const t = terms.get(c.id)!;
        const d =
          query.mode === 'online' ? t.durationMax : durationWithin(t, query.durationMinutes);
        if (d === null) {
          // one member asked for directly: outside their bounds is an error; „any” skips them
          if (choice !== 'any') throw new InvalidInput('durationMinutes', 'invalid');
          continue;
        }
        durationOf.set(c.id, d);
      }
      const durationMinutes =
        choice === 'any'
          ? durationFor(service, query.mode, query.durationMinutes)
          : (durationOf.get(choice) ?? durationFor(service, query.mode, query.durationMinutes));
      const staff = candidates.filter((c) => durationOf.has(c.id));
      // an archived service has no slots; online, neither one not bookable online
      const closed =
        service.archived_at !== null || (query.mode === 'online' && !service.bookable_online);
      if (closed || staff.length === 0) return { timeZone, durationMinutes, staff: [], days: [] };

      const settings = (
        await client.query<{ notice_min: number; buffer_min: number }>(
          `SELECT notice_min, buffer_min FROM booking.settings`,
        )
      ).rows[0] ?? { notice_min: 0, buffer_min: 0 };
      const noticeMin = query.mode === 'online' ? settings.notice_min : 0;

      // the earliest start: now (+ the notice online), local, rounded up to the 5-minute step
      const earliest = (
        await client.query<{ t: string; s: number }>(
          `SELECT to_char(x, 'YYYY-MM-DD"T"HH24:MI') AS t, extract(second FROM x)::float AS s
             FROM (SELECT (now() + make_interval(mins => $1)) AT TIME ZONE $2 AS x) q`,
          [noticeMin, timeZone],
        )
      ).rows[0]!;
      const e = splitLocal(earliest.t);
      const earliestMinute = ceilToStep(e.minute + (earliest.s > 0 ? 1 : 0));

      const ids = staff.map((s) => s.id);
      const local = await staffLocalDays(
        client,
        staff.map((s) => ({ id: s.id, scheduleMode: s.scheduleMode })),
        from,
        to,
      );
      const occupied = (
        await client.query<{
          staff_member_id: string;
          service_id: string | null;
          ls: string;
          le: string;
        }>(
          `SELECT a.staff_member_id, a.service_id,
                  to_char(a.starts_at AT TIME ZONE $4, 'YYYY-MM-DD"T"HH24:MI') AS ls,
                  to_char(a.ends_at AT TIME ZONE $4, 'YYYY-MM-DD"T"HH24:MI') AS le
             FROM booking.appointment a
            WHERE a.staff_member_id = ANY($1::uuid[]) AND a.status = ANY($5::text[])
              AND a.starts_at < (($3::date + 2)::timestamp AT TIME ZONE $4)
              AND a.ends_at > (($2::date - 1)::timestamp AT TIME ZONE $4)
           UNION ALL
           SELECT b.staff_member_id, NULL,
                  to_char(b.starts_at AT TIME ZONE $4, 'YYYY-MM-DD"T"HH24:MI'),
                  to_char(b.ends_at AT TIME ZONE $4, 'YYYY-MM-DD"T"HH24:MI')
             FROM booking.time_block b
            WHERE b.staff_member_id = ANY($1::uuid[]) AND b.archived_at IS NULL
              AND b.starts_at < (($3::date + 2)::timestamp AT TIME ZONE $4)
              AND b.ends_at > (($2::date - 1)::timestamp AT TIME ZONE $4)
           ${
             // B.11a: online, a time held for another client (10 minutes, until the e-mail code)
             query.mode === 'online'
               ? `UNION ALL
           SELECT h.staff_member_id, NULL,
                  to_char(h.starts_at AT TIME ZONE $4, 'YYYY-MM-DD"T"HH24:MI'),
                  to_char(h.ends_at AT TIME ZONE $4, 'YYYY-MM-DD"T"HH24:MI')
             FROM booking.public_hold h
            WHERE h.staff_member_id = ANY($1::uuid[]) AND h.state = 'pending'
              AND h.expires_at > now()
              AND h.starts_at < (($3::date + 2)::timestamp AT TIME ZONE $4)
              AND h.ends_at > (($2::date - 1)::timestamp AT TIME ZONE $4)`
               : ''
           }`,
          [ids, from, to, timeZone, OCCUPYING],
        )
      ).rows;

      const busy = new Map<string, Busy[]>();
      const loadOf = new Map<string, number>();
      for (const o of occupied) {
        const pieces = piecesByDate(o.ls, o.le, from, to);
        for (const p of pieces) {
          const key = `${o.staff_member_id}|${p.date}`;
          const list = busy.get(key) ?? [];
          list.push({ startMin: p.startMin, endMin: p.endMin, serviceId: o.service_id });
          busy.set(key, list);
        }
        if (o.service_id !== null) {
          const key = `${o.staff_member_id}|${o.ls.slice(0, 10)}`;
          loadOf.set(key, (loadOf.get(key) ?? 0) + 1);
        }
      }

      // B.3b (D-B5-8 = a): the resources the service needs and what uses them (any member)
      const resources = await requiredResources(client, serviceId, query.locationId ?? null);
      const resourceBusy = new Map<string, Array<{ startMin: number; endMin: number }>>();
      if (resources.length > 0) {
        const uses = (
          await client.query<{ resource_id: string; ls: string; le: string }>(
            `SELECT ar.resource_id,
                    to_char(a.starts_at AT TIME ZONE $4, 'YYYY-MM-DD"T"HH24:MI') AS ls,
                    to_char(a.ends_at AT TIME ZONE $4, 'YYYY-MM-DD"T"HH24:MI') AS le
               FROM booking.appointment_resource ar
               JOIN booking.appointment a ON a.id = ar.appointment_id
              WHERE ar.resource_id = ANY($1::uuid[]) AND a.status = ANY($5::text[])
                AND a.starts_at < (($3::date + 2)::timestamp AT TIME ZONE $4)
                AND a.ends_at > (($2::date - 1)::timestamp AT TIME ZONE $4)`,
            [resources.map((r) => r.id), from, to, timeZone, OCCUPYING],
          )
        ).rows;
        for (const u of uses) {
          for (const p of piecesByDate(u.ls, u.le, from, to)) {
            const key = `${u.resource_id}|${p.date}`;
            const list = resourceBusy.get(key) ?? [];
            list.push({ startMin: p.startMin, endMin: p.endMin });
            resourceBusy.set(key, list);
          }
        }
      }

      const days: MemberDay[] = local.map((d) => {
        const key = `${d.staffMemberId}|${d.date}`;
        return {
          staffMemberId: d.staffMemberId,
          date: d.date,
          intervals: d.intervals,
          busy: busy.get(key) ?? [],
          load: loadOf.get(key) ?? 0,
          rules: {
            serviceId,
            durationMin: durationOf.get(d.staffMemberId) ?? durationMinutes,
            capacity: service.capacity,
            bufferMin: settings.buffer_min,
            earliestMin: d.date < e.date ? 1441 : d.date === e.date ? earliestMinute : null,
            resources: resources.map((r) => ({
              units: r.units,
              busy: resourceBusy.get(`${r.id}|${d.date}`) ?? [],
            })),
          },
        };
      });
      return { timeZone, durationMinutes, staff, days };
    },
    true,
  );
}

/**
 * Local (date, minute) → instant, in one query. A local time that does not exist (the hour skipped
 * in spring) gives null; one that exists twice (autumn) gives its first instant.
 */
async function toInstants(
  ctx: TenantContext,
  timeZone: string,
  points: Array<{ date: string; minute: number }>,
): Promise<Array<Date | null>> {
  if (points.length === 0) return [];
  const { rows } = await withBookingTx(
    ctx.organizationId,
    (client) =>
      client.query<{ at: Date; back: string }>(
        `SELECT x.at, to_char(x.at AT TIME ZONE $3, 'YYYY-MM-DD"T"HH24:MI') AS back
           FROM (SELECT ((t.d + make_interval(mins => t.m))::timestamp AT TIME ZONE $3) AS at, t.n
                   FROM unnest($1::date[], $2::int[]) WITH ORDINALITY AS t(d, m, n)) x
          ORDER BY x.n`,
        [points.map((p) => p.date), points.map((p) => p.minute), timeZone],
      ),
    true,
  );
  return rows.map((r, i) => {
    const p = points[i]!;
    const expected = `${p.date}T${hhmm(p.minute)}`;
    // the skipped hour: Postgres moves it forward, so the round trip differs
    return r.back === expected ? r.at : null;
  });
}

// ── the free slots ──────────────────────────────────────────────────────────────────────────

function requireWindow(fromRaw: unknown, toRaw: unknown, maxDays: number) {
  const from = requireLocalDate('from', fromRaw);
  const to = requireLocalDate('to', toRaw);
  const span = daysBetween(from, to);
  if (span < 1) throw new InvalidInput('to', 'order');
  if (span > maxDays) throw new InvalidInput('to', 'too_long');
  return { from, to };
}

/** The member order of D-B5-4 = a: fewest appointments that day, then the team's order. */
function byLoad(staff: CalendarStaff[], loadOf: (id: string) => number): string[] {
  return staff
    .map((s, i) => ({ id: s.id, i, load: loadOf(s.id) }))
    .sort((a, b) => a.load - b.load || a.i - b.i)
    .map((x) => x.id);
}

async function computeFreeSlots(
  ctx: TenantContext,
  query: SlotQuery,
  from: string,
  to: string,
): Promise<FreeSlots> {
  const loaded = await load(ctx, query, from, to);
  const any = query.staffMemberId === 'any';
  const dates = eachDate(from, to);

  // per date and start minute: who is free (and, for one member, the taken grid times)
  const perDate = new Map<string, Map<number, { free: Set<string>; taken: boolean }>>();
  for (const day of loaded.days) {
    const map = perDate.get(day.date) ?? new Map();
    for (const s of memberSlots(day.intervals, day.busy, day.rules)) {
      const entry = map.get(s.startMin) ?? { free: new Set<string>(), taken: false };
      if (s.available) entry.free.add(day.staffMemberId);
      else entry.taken = true;
      map.set(s.startMin, entry);
    }
    perDate.set(day.date, map);
  }

  const points: Array<{ date: string; minute: number; free: Set<string> }> = [];
  for (const date of dates) {
    const map = perDate.get(date);
    if (!map) continue;
    for (const [minute, entry] of [...map.entries()].sort((a, b) => a[0] - b[0])) {
      // „Oricine e liber” lists only the free times (the struck-through ones are for one member)
      if (any && entry.free.size === 0) continue;
      points.push({ date, minute, free: entry.free });
    }
  }
  const instants = await toInstants(ctx, loaded.timeZone, points);
  const loadOf = new Map(loaded.days.map((d) => [`${d.staffMemberId}|${d.date}`, d.load]));

  const days: FreeSlotDay[] = dates.map((date) => ({ date, slots: [] }));
  const seen = new Set<number>();
  points.forEach((p, i) => {
    const at = instants[i];
    if (!at || seen.has(at.getTime())) return;
    seen.add(at.getTime());
    const slot: FreeSlot = { time: hhmm(p.minute), startsAt: at, available: p.free.size > 0 };
    if (any) {
      slot.staffMemberIds = byLoad(
        loaded.staff.filter((s) => p.free.has(s.id)),
        (id) => loadOf.get(`${id}|${p.date}`) ?? 0,
      );
    }
    days.find((d) => d.date === p.date)!.slots.push(slot);
  });
  return { timeZone: loaded.timeZone, durationMinutes: loaded.durationMinutes, days };
}

/** BookingNew / BookingPublic: the start times of `from`…`to` (at most 7 days). */
export async function getFreeSlotsInOrg(
  ctx: TenantContext,
  query: SlotQuery & { from: unknown; to: unknown },
): Promise<FreeSlots> {
  const { from, to } = requireWindow(query.from, query.to, SLOT_LIMITS.days);
  return computeFreeSlots(ctx, query, from, to);
}

/** Today in the business time zone. */
async function localToday(ctx: TenantContext, timeZone: string): Promise<string> {
  return withBookingTx(
    ctx.organizationId,
    async (client) =>
      (
        await client.query<{ d: string }>(
          `SELECT to_char((now() AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS d`,
          [timeZone],
        )
      ).rows[0]!.d,
    true,
  );
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(date + 'T00:00:00Z') + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * „Primul loc liber” (BookingCalendar, BookingStates: „Următorul loc liber: joi, 14:30, la Ioana.”):
 * day by day from `from` (by default today) up to the horizon (62 days for the team, 30 online,
 * counted from today), in windows of 7 days. null: nothing free.
 */
export async function findFirstFreeSlotInOrg(
  ctx: TenantContext,
  query: SlotQuery & { from?: unknown },
): Promise<FirstFreeSlot | null> {
  const timeZone = await getOrganizationTimeZone(ctx);
  const today = await localToday(ctx, timeZone);
  const fromRaw = query.from === undefined ? today : requireLocalDate('from', query.from);
  const from = fromRaw < today ? today : fromRaw;
  const horizon =
    query.mode === 'online' ? SLOT_LIMITS.onlineHorizonDays : SLOT_LIMITS.teamHorizonDays;
  const last = addDays(today, horizon - 1);
  // the arguments are checked even when the window is past the horizon
  requireId(query.serviceId);
  requireStaffChoice(query.staffMemberId);

  for (let start = from; start <= last; start = addDays(start, SLOT_LIMITS.days)) {
    const end = addDays(start, SLOT_LIMITS.days - 1);
    const free = await computeFreeSlots(
      ctx,
      { ...query, staffMemberId: query.staffMemberId },
      start,
      end > last ? last : end,
    );
    for (const day of free.days) {
      const slot = day.slots.find((s) => s.available);
      if (!slot) continue;
      const staffMemberId =
        query.staffMemberId === 'any' ? slot.staffMemberIds![0]! : (query.staffMemberId as string);
      const name = await withBookingTx(
        ctx.organizationId,
        async (client) =>
          (
            await client.query<{ display_name: string }>(
              `SELECT display_name FROM booking.staff_member WHERE id = $1`,
              [staffMemberId],
            )
          ).rows[0]!.display_name,
        true,
      );
      return {
        date: day.date,
        time: slot.time,
        startsAt: slot.startsAt,
        staffMemberId,
        staffDisplayName: name,
      };
    }
  }
  return null;
}

/**
 * „Oricine e liber” at save time (D-B5-4 = a): the members free at `startsAt` for this service and
 * duration (team rules: the buffer, no notice), in the order of the choice — fewest appointments
 * that day, then the team's order. createAppointment tries them in order.
 */
export async function staffFreeAtInOrg(
  ctx: TenantContext,
  query: { serviceId: string; startsAt: Date; durationMinutes?: unknown; locationId?: string },
): Promise<string[]> {
  const timeZone = await getOrganizationTimeZone(ctx);
  const at = await withBookingTx(
    ctx.organizationId,
    async (client) =>
      (
        await client.query<{ t: string; s: number }>(
          `SELECT to_char(x, 'YYYY-MM-DD"T"HH24:MI') AS t, extract(second FROM x)::float AS s
             FROM (SELECT $1::timestamptz AT TIME ZONE $2 AS x) q`,
          [query.startsAt, timeZone],
        )
      ).rows[0]!,
    true,
  );
  const local = splitLocal(at.t);
  if (at.s !== 0 || local.minute % LIMITS.durationStep !== 0) {
    throw new InvalidInput('startsAt', 'invalid');
  }
  const loaded = await load(
    ctx,
    {
      serviceId: query.serviceId,
      staffMemberId: 'any',
      durationMinutes: query.durationMinutes,
      mode: 'team',
      locationId: query.locationId,
    },
    local.date,
    local.date,
  );
  // a past time stays allowed for the team, as for a chosen member (B.4a)
  const free = loaded.days.filter((d) =>
    // the resources are checked when the appointment is written (Conflict resource_unavailable)
    isFreeAt(d.intervals, d.busy, { ...d.rules, earliestMin: null, resources: [] }, local.minute),
  );
  const loadOf = new Map(free.map((d) => [d.staffMemberId, d.load]));
  return byLoad(
    loaded.staff.filter((s) => loadOf.has(s.id)),
    (id) => loadOf.get(id) ?? 0,
  );
}
