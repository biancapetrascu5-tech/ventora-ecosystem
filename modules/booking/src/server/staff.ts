import type { PoolClient } from 'pg';
import { AuditActions, appendAuditEventInTx, type AuditSqlExecutor } from '@ventora/audit';
import { getMemberApplicationAccess, type TenantContext } from '@ventora/access';
import { uuidv7 } from '@ventora/db-kit';
import { Conflict, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { getUserById } from '@ventora/identity';
import { getOrganizationTimeZone, listMembers, resolveOrgContext } from '@ventora/organizations';
import { withBookingTx } from './db';
import { isUuid } from './validation';
import {
  DEFAULT_BUSINESS_WEEK,
  SCHEDULE_LIMITS,
  clipToBusiness,
  dayAvailability,
  daysBetween,
  eachDate,
  intersect,
  businessIntervals,
  normalizeReason,
  ownDay,
  requireLocalDate,
  requireWithinBusiness,
  validateBusinessWeek,
  validateStaffWeek,
  validateWorkDay,
  weekdayOf,
  type BusinessDay,
  type Interval,
  type WorkDay,
} from './schedule';

/*
 * Lot B.2 — the members in the calendar and their schedule (BOOKING.md §3 B.2; plan
 * reports/2026-11-08_2007_plan-booking-b2-b3.md §1, aligned to the design S124,
 * BookingTeamSchedule). Every write runs in one transaction as booking_rw with the organization of
 * the authorized context, with its audit row (category booking) in the same transaction. No
 * physical delete: archive and restore.
 *
 * Who is in the calendar (D-B-1, D-B2-1 = a): every active member of the business with the role
 * owner, admin or member who has EasyBook (owner and admin implicitly, a member with the access
 * row), read through core/access (getMemberApplicationAccess, §6.4 b). S124: members join and
 * leave the calendar from Hub · Echipă și invitații, not from EasyBook — listStaff brings the
 * calendar in line with the team (a new member appears, one who left or lost EasyBook is
 * „Scos din calendar pe {date}”, one who comes back is restored with the same row, D-B2-4 = a).
 * Those changes are audited with actor `system`. D-B2-6 = a: B.4 reads staffEligibility() again on
 * every new appointment. Appointments are never cancelled by any of this (S124).
 */

const APPLICATION_ID = 'booking';
const CALENDAR_ROLES = new Set(['owner', 'admin', 'member']);
/** S124: the reason of a leave is for the owner and the admins only. */
const SEES_LEAVE_REASON = new Set(['owner', 'admin']);

export type StaffEligibility =
  'eligible' | 'not_member' | 'suspended' | 'role_not_allowed' | 'no_booking_access';

export type StaffMember = {
  id: string;
  userId: string;
  displayName: string;
  scheduleMode: 'business' | 'custom';
  bookableOnline: boolean;
  sortOrder: number;
  /** „Scos din calendar pe {date}” when set. */
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** What comes next for a member (S124 „Urmează”); null = „Nimic programat”. */
export type StaffNext =
  | { kind: 'leave'; from: string; to: string }
  | { kind: 'off'; date: string }
  | { kind: 'other'; date: string; intervals: Interval[] }
  | null;

export type StaffListItem = StaffMember & {
  role: string;
  /** The week as the calendar takes it: the member's own week (or the business's), cut to it. */
  week: Array<{ weekday: number; intervals: Interval[] }>;
  next: StaffNext;
};

export type StaffList = {
  members: StaffListItem[];
  /** S124 „Nu mai sunt în echipă”: out of the calendar, the most recent first. */
  removed: StaffMember[];
};

export type StaffDayOverride = {
  id: string;
  staffMemberId: string;
  date: string;
  isWorking: boolean;
  intervals: Interval[];
};

export type StaffTimeOff = {
  id: string;
  staffMemberId: string;
  startsOn: string;
  endsOn: string;
  /** Only for the owner and the admins (S124); null for everyone else. */
  reason: string | null;
  archivedAt: Date | null;
};

export type StaffSchedule = {
  staffMember: StaffMember;
  weekly: Array<WorkDay & { weekday: number }>;
  overrides: StaffDayOverride[];
  timeOff: StaffTimeOff[];
};

/** S124: who had their intervals cut when the business's hours changed. */
export type StaffCutToBusinessHours = {
  staffMemberId: string;
  displayName: string;
  weekdays: number[];
  dates: string[];
};

export type BusinessHoursSaved = { days: BusinessDay[]; affected: StaffCutToBusinessHours[] };

export type AvailabilityDay = {
  staffMemberId: string;
  date: string;
  /** Instants (UTC) of the local intervals, in the business time zone. */
  intervals: Array<{ start: Date; end: Date }>;
};

type StaffRow = {
  id: string;
  user_id: string;
  display_name: string;
  schedule_mode: 'business' | 'custom';
  bookable_online: boolean;
  sort_order: number;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type DayRow = {
  is_working: boolean;
  start1_min: number | null;
  end1_min: number | null;
  start2_min: number | null;
  end2_min: number | null;
};

const STAFF_COLUMNS = `id, user_id, display_name, schedule_mode, bookable_online, sort_order,
  archived_at, created_at, updated_at`;

function toStaff(r: StaffRow): StaffMember {
  return {
    id: r.id,
    userId: r.user_id,
    displayName: r.display_name,
    scheduleMode: r.schedule_mode,
    bookableOnline: r.bookable_online,
    sortOrder: r.sort_order,
    archivedAt: r.archived_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toWorkDay(r: DayRow): WorkDay {
  if (!r.is_working || r.start1_min === null || r.end1_min === null) {
    return { isWorking: false, intervals: [] };
  }
  const intervals: Interval[] = [{ startMin: r.start1_min, endMin: r.end1_min }];
  if (r.start2_min !== null && r.end2_min !== null) {
    intervals.push({ startMin: r.start2_min, endMin: r.end2_min });
  }
  return { isWorking: true, intervals };
}

/** The 4 interval columns of a working day (NULL for the missing ones). */
function dayColumns(day: WorkDay): [number | null, number | null, number | null, number | null] {
  const [a, b] = day.intervals;
  return [a?.startMin ?? null, a?.endMin ?? null, b?.startMin ?? null, b?.endMin ?? null];
}

/** A DATE column as 'YYYY-MM-DD' text (pg would turn DATE into a local JS Date). */
const DATE_TEXT = (col: string) => `to_char(${col}, 'YYYY-MM-DD')`;

function requireId(id: unknown): string {
  // an id that is not a UUID cannot exist: the same answer as another business's id (T1)
  if (!isUuid(id)) throw new ResourceNotFound();
  return id;
}

type AuditTarget = 'booking_business_hours' | 'booking_staff_member' | 'booking_staff_time_off';

function audit(
  exec: AuditSqlExecutor,
  ctx: TenantContext,
  action: string,
  targetType: AuditTarget,
  targetId: string,
  metadata: Record<string, unknown>,
  actor: 'user' | 'system' = 'user',
) {
  return appendAuditEventInTx(exec, {
    category: 'booking',
    action,
    outcome: 'success',
    actorType: actor,
    actorId: actor === 'user' ? ctx.userId : null,
    organizationId: ctx.organizationId,
    targetType,
    targetId,
    metadata,
  });
}

async function readStaff(client: PoolClient, id: string, lock = false): Promise<StaffRow> {
  const { rows } = await client.query<StaffRow>(
    `SELECT ${STAFF_COLUMNS} FROM booking.staff_member WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
  if (!rows[0]) throw new ResourceNotFound();
  return rows[0];
}

/** A member in the calendar, locked for the write of its schedule. */
async function readActiveStaff(client: PoolClient, id: string): Promise<StaffRow> {
  const row = await readStaff(client, id, true);
  if (row.archived_at) throw new Conflict('staff_member_removed');
  return row;
}

/** Today in the business time zone, as 'YYYY-MM-DD'. */
async function localToday(client: PoolClient, timeZone: string): Promise<string> {
  const { rows } = await client.query<{ d: string }>(
    `SELECT to_char((now() AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS d`,
    [timeZone],
  );
  return rows[0]!.d;
}

// ── who is in the calendar ──────────────────────────────────────────────────────────────────

/**
 * D-B2-1 = a, D-B2-6 = a: may this person be in the calendar and receive new appointments in the
 * business of the context? Read fresh from core/access + core/organizations on every call.
 */
export async function staffEligibility(
  ctx: TenantContext,
  userId: string,
): Promise<StaffEligibility> {
  const access = await getMemberApplicationAccess(ctx, userId, APPLICATION_ID);
  if (access.status === 'not_member') return 'not_member';
  if (access.status === 'suspended') return 'suspended';
  if (!CALENDAR_ROLES.has(access.role)) return 'role_not_allowed';
  return access.hasAccess ? 'eligible' : 'no_booking_access';
}

/** The current name of the person (identity), for the keep_snapshot copy. */
async function currentName(userId: string): Promise<string | null> {
  const user = await getUserById(userId);
  const name = user?.name?.trim().slice(0, 120);
  return name && name.length > 0 ? name : null;
}

/**
 * S124: brings the calendar in line with the team in Hub. Returns the role of each eligible
 * member (by userId) for the list.
 */
async function syncStaffWithTeam(ctx: TenantContext): Promise<Map<string, string>> {
  const orgCtx = await resolveOrgContext({
    userId: ctx.userId,
    organizationId: ctx.organizationId,
  });
  const members = (await listMembers(orgCtx)) as Array<{
    userId: string;
    role: string;
    status: string;
  }>;
  const eligible = new Map<string, { role: string; name: string }>();
  for (const m of members) {
    if (m.status !== 'active' || !CALENDAR_ROLES.has(m.role)) continue;
    if ((await staffEligibility(ctx, m.userId)) !== 'eligible') continue;
    const name = await currentName(m.userId);
    if (name) eligible.set(m.userId, { role: m.role, name });
  }

  await withBookingTx(ctx.organizationId, async (client, exec) => {
    const { rows } = await client.query<StaffRow>(
      `SELECT ${STAFF_COLUMNS} FROM booking.staff_member
        ORDER BY archived_at IS NULL DESC, archived_at DESC FOR UPDATE`,
    );
    // the active row of a person, else its most recently archived one
    const byUser = new Map<string, StaffRow>();
    for (const r of rows) if (!byUser.has(r.user_id)) byUser.set(r.user_id, r);

    for (const [userId, { name }] of eligible) {
      const row = byUser.get(userId);
      if (row && !row.archived_at) {
        if (row.display_name !== name) {
          await client.query(`UPDATE booking.staff_member SET display_name = $2 WHERE id = $1`, [
            row.id,
            name,
          ]);
        }
        continue;
      }
      if (row) {
        await client.query(
          `UPDATE booking.staff_member
              SET archived_at = NULL, archived_by_user_id = NULL, display_name = $2
            WHERE id = $1`,
          [row.id, name],
        );
        await audit(
          exec,
          ctx,
          AuditActions.bookingStaffRestored,
          'booking_staff_member',
          row.id,
          { userId, source: 'team' },
          'system',
        );
        continue;
      }
      const id = uuidv7();
      const inserted = await client.query(
        `INSERT INTO booking.staff_member (id, organization_id, user_id, display_name, sort_order)
         VALUES ($1, $2, $3, $4,
                 (SELECT COALESCE(max(sort_order) + 1, 0) FROM booking.staff_member
                   WHERE archived_at IS NULL))
         ON CONFLICT (organization_id, (user_id::text)) WHERE archived_at IS NULL DO NOTHING`,
        [id, ctx.organizationId, userId, name],
      );
      if (inserted.rowCount === 1) {
        await audit(
          exec,
          ctx,
          AuditActions.bookingStaffAdded,
          'booking_staff_member',
          id,
          { userId, source: 'team' },
          'system',
        );
      }
    }

    for (const r of rows) {
      if (r.archived_at || eligible.has(r.user_id)) continue;
      await client.query(`UPDATE booking.staff_member SET archived_at = now() WHERE id = $1`, [
        r.id,
      ]);
      await audit(
        exec,
        ctx,
        AuditActions.bookingStaffArchived,
        'booking_staff_member',
        r.id,
        { userId: r.user_id, source: 'team' },
        'system',
      );
    }
  });
  return new Map([...eligible].map(([userId, v]) => [userId, v.role]));
}

// ── the business's week ─────────────────────────────────────────────────────────────────────

export async function getBusinessHoursInOrg(ctx: TenantContext): Promise<BusinessDay[]> {
  return withBookingTx(ctx.organizationId, (client) => readBusinessWeek(client), true);
}

async function readBusinessWeek(client: PoolClient): Promise<BusinessDay[]> {
  const { rows } = await client.query<{
    weekday: number;
    is_open: boolean;
    opens_at_min: number | null;
    closes_at_min: number | null;
  }>(
    `SELECT weekday, is_open, opens_at_min, closes_at_min FROM booking.business_hours ORDER BY weekday`,
  );
  if (rows.length === 0) return DEFAULT_BUSINESS_WEEK.map((d) => ({ ...d }));
  return rows.map((r) => ({
    weekday: r.weekday,
    isOpen: r.is_open,
    opensAtMin: r.opens_at_min,
    closesAtMin: r.closes_at_min,
  }));
}

/**
 * All 7 days at once; the first save inserts them, the next ones only update. S124: the members'
 * own weeks and their future exceptions are cut to the new hours in the same transaction (a day
 * with nothing left becomes off), and the answer says who was affected.
 */
export async function setBusinessHoursInOrg(
  ctx: TenantContext,
  days: unknown,
): Promise<BusinessHoursSaved> {
  const week = validateBusinessWeek(days);
  const timeZone = await getOrganizationTimeZone(ctx);
  return withBookingTx(ctx.organizationId, async (client, exec) => {
    const before = await readBusinessWeek(client);
    const changed = week
      .filter((d) => {
        const b = before.find((x) => x.weekday === d.weekday);
        return (
          !b ||
          b.isOpen !== d.isOpen ||
          b.opensAtMin !== d.opensAtMin ||
          b.closesAtMin !== d.closesAtMin
        );
      })
      .map((d) => d.weekday);
    for (const d of week) {
      await client.query(
        `INSERT INTO booking.business_hours
           (organization_id, weekday, is_open, opens_at_min, closes_at_min, updated_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (organization_id, weekday) DO UPDATE
           SET is_open = EXCLUDED.is_open, opens_at_min = EXCLUDED.opens_at_min,
               closes_at_min = EXCLUDED.closes_at_min,
               updated_by_user_id = EXCLUDED.updated_by_user_id`,
        [ctx.organizationId, d.weekday, d.isOpen, d.opensAtMin, d.closesAtMin, ctx.userId],
      );
    }
    if (changed.length === 0) return { days: week, affected: [] };

    await audit(
      exec,
      ctx,
      AuditActions.bookingBusinessHoursUpdated,
      'booking_business_hours',
      ctx.organizationId,
      { changedWeekdays: changed },
    );

    // S124: cut the members' intervals to the new hours
    const affected = new Map<string, StaffCutToBusinessHours>();
    const note = (id: string, name: string) => {
      let a = affected.get(id);
      if (!a)
        affected.set(id, (a = { staffMemberId: id, displayName: name, weekdays: [], dates: [] }));
      return a;
    };
    const weekly = await client.query<
      DayRow & { staff_member_id: string; weekday: number; display_name: string }
    >(
      `SELECT w.staff_member_id, w.weekday, w.is_working, w.start1_min, w.end1_min, w.start2_min,
              w.end2_min, m.display_name
         FROM booking.staff_weekly_hours w
         JOIN booking.staff_member m ON m.id = w.staff_member_id
        WHERE m.archived_at IS NULL AND m.schedule_mode = 'custom' AND w.weekday = ANY($1::int[])
        ORDER BY m.sort_order, w.weekday
        FOR UPDATE OF w`,
      [changed],
    );
    for (const r of weekly.rows) {
      const cut = clipToBusiness(
        toWorkDay(r),
        week.find((d) => d.weekday === r.weekday),
      );
      if (!cut.changed) continue;
      await client.query(
        `UPDATE booking.staff_weekly_hours
            SET is_working = $3, start1_min = $4, end1_min = $5, start2_min = $6, end2_min = $7
          WHERE staff_member_id = $1 AND weekday = $2`,
        [r.staff_member_id, r.weekday, cut.day.isWorking, ...dayColumns(cut.day)],
      );
      note(r.staff_member_id, r.display_name).weekdays.push(r.weekday);
    }
    const today = await localToday(client, timeZone);
    const overrides = await client.query<
      DayRow & { id: string; staff_member_id: string; on_date: string; display_name: string }
    >(
      `SELECT o.id, o.staff_member_id, ${DATE_TEXT('o.on_date')} AS on_date, o.is_working,
              o.start1_min, o.end1_min, o.start2_min, o.end2_min, m.display_name
         FROM booking.staff_day_override o
         JOIN booking.staff_member m ON m.id = o.staff_member_id
        WHERE m.archived_at IS NULL AND o.archived_at IS NULL AND o.is_working
          AND o.on_date >= $1::date
          AND EXTRACT(ISODOW FROM o.on_date)::int = ANY($2::int[])
        ORDER BY o.on_date
        FOR UPDATE OF o`,
      [today, changed],
    );
    for (const r of overrides.rows) {
      const cut = clipToBusiness(
        toWorkDay(r),
        week.find((d) => d.weekday === weekdayOf(r.on_date)),
      );
      if (!cut.changed) continue;
      await client.query(
        `UPDATE booking.staff_day_override
            SET is_working = $2, start1_min = $3, end1_min = $4, start2_min = $5, end2_min = $6
          WHERE id = $1`,
        [r.id, cut.day.isWorking, ...dayColumns(cut.day)],
      );
      note(r.staff_member_id, r.display_name).dates.push(r.on_date);
    }
    for (const a of affected.values()) {
      await audit(
        exec,
        ctx,
        AuditActions.bookingStaffScheduleUpdated,
        'booking_staff_member',
        a.staffMemberId,
        {
          kind: 'cut_to_business_hours',
          weekdays: a.weekdays,
          dates: a.dates,
        },
      );
    }
    return { days: week, affected: [...affected.values()] };
  });
}

// ── the members in the calendar ─────────────────────────────────────────────────────────────

/**
 * S124 „Programul echipei”: the calendar brought in line with the team, then the members in order
 * with their role, their week and what comes next, and the members no longer in the team.
 */
export async function listStaffInOrg(ctx: TenantContext): Promise<StaffList> {
  const roles = await syncStaffWithTeam(ctx);
  const timeZone = await getOrganizationTimeZone(ctx);
  return withBookingTx(
    ctx.organizationId,
    async (client) => {
      const business = await readBusinessWeek(client);
      const today = await localToday(client, timeZone);
      const { rows } = await client.query<StaffRow>(
        `SELECT ${STAFF_COLUMNS} FROM booking.staff_member
          ORDER BY archived_at IS NULL DESC, sort_order, display_name, id`,
      );
      const active = rows.filter((r) => !r.archived_at);
      const ids = active.map((r) => r.id);
      const weekly = (
        await client.query<DayRow & { staff_member_id: string; weekday: number }>(
          `SELECT staff_member_id, weekday, is_working, start1_min, end1_min, start2_min, end2_min
             FROM booking.staff_weekly_hours WHERE staff_member_id = ANY($1::uuid[])`,
          [ids],
        )
      ).rows;
      const nextOverride = (
        await client.query<DayRow & { staff_member_id: string; on_date: string }>(
          `SELECT DISTINCT ON (staff_member_id) staff_member_id, ${DATE_TEXT('on_date')} AS on_date,
                  is_working, start1_min, end1_min, start2_min, end2_min
             FROM booking.staff_day_override
            WHERE staff_member_id = ANY($1::uuid[]) AND archived_at IS NULL AND on_date >= $2::date
            ORDER BY staff_member_id, on_date`,
          [ids, today],
        )
      ).rows;
      const nextLeave = (
        await client.query<{ staff_member_id: string; starts_on: string; ends_on: string }>(
          `SELECT DISTINCT ON (staff_member_id) staff_member_id,
                  ${DATE_TEXT('starts_on')} AS starts_on, ${DATE_TEXT('ends_on')} AS ends_on
             FROM booking.staff_time_off
            WHERE staff_member_id = ANY($1::uuid[]) AND archived_at IS NULL AND ends_on >= $2::date
            ORDER BY staff_member_id, starts_on`,
          [ids, today],
        )
      ).rows;

      const members: StaffListItem[] = active.map((r) => {
        const own = new Map<number, WorkDay>(
          weekly.filter((w) => w.staff_member_id === r.id).map((w) => [w.weekday, toWorkDay(w)]),
        );
        const week = [1, 2, 3, 4, 5, 6, 7].map((weekday) => {
          const day =
            r.schedule_mode === 'custom'
              ? (own.get(weekday) ?? { isWorking: false, intervals: [] })
              : {
                  isWorking: true,
                  intervals: businessIntervals(business.find((b) => b.weekday === weekday)),
                };
          return {
            weekday,
            intervals: intersect(
              day.intervals,
              businessIntervals(business.find((b) => b.weekday === weekday)),
            ),
          };
        });
        const leave = nextLeave.find((l) => l.staff_member_id === r.id);
        const o = nextOverride.find((x) => x.staff_member_id === r.id);
        let next: StaffNext = null;
        // a leave that has started, or starts before the next exception, comes first
        if (leave && (!o || leave.starts_on <= o.on_date)) {
          next = { kind: 'leave', from: leave.starts_on, to: leave.ends_on };
        } else if (o) {
          const day = toWorkDay(o);
          next = day.isWorking
            ? { kind: 'other', date: o.on_date, intervals: day.intervals }
            : { kind: 'off', date: o.on_date };
        }
        return { ...toStaff(r), role: roles.get(r.user_id) ?? 'member', week, next };
      });
      const removed = rows
        .filter((r) => r.archived_at)
        .sort((a, b) => b.archived_at!.getTime() - a.archived_at!.getTime())
        .map(toStaff);
      return { members, removed };
    },
    true,
  );
}

/** Online booking and the schedule mode (business = follows the business's week). */
export async function updateStaffMemberInOrg(
  ctx: TenantContext,
  staffMemberId: string,
  params: { bookableOnline?: unknown; scheduleMode?: unknown },
): Promise<StaffMember> {
  const id = requireId(staffMemberId);
  if (params.bookableOnline !== undefined && typeof params.bookableOnline !== 'boolean') {
    throw new InvalidInput('bookableOnline', 'invalid');
  }
  if (
    params.scheduleMode !== undefined &&
    params.scheduleMode !== 'business' &&
    params.scheduleMode !== 'custom'
  ) {
    throw new InvalidInput('scheduleMode', 'invalid');
  }
  return withBookingTx(ctx.organizationId, async (client, exec) => {
    const before = await readActiveStaff(client, id);
    const bookableOnline = (params.bookableOnline as boolean | undefined) ?? before.bookable_online;
    const scheduleMode =
      (params.scheduleMode as 'business' | 'custom' | undefined) ?? before.schedule_mode;
    if (scheduleMode === 'custom' && before.schedule_mode !== 'custom') {
      // a custom week needs its 7 days first (setStaffWeeklyHours)
      const { rows } = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM booking.staff_weekly_hours WHERE staff_member_id = $1`,
        [id],
      );
      if ((rows[0]?.n ?? 0) < 7) throw new InvalidInput('scheduleMode', 'invalid');
    }
    const changed: string[] = [];
    if (bookableOnline !== before.bookable_online) changed.push('bookableOnline');
    if (scheduleMode !== before.schedule_mode) changed.push('scheduleMode');
    if (changed.length === 0) return toStaff(before);
    const { rows } = await client.query<StaffRow>(
      `UPDATE booking.staff_member SET bookable_online = $2, schedule_mode = $3
        WHERE id = $1 RETURNING ${STAFF_COLUMNS}`,
      [id, bookableOnline, scheduleMode],
    );
    await audit(exec, ctx, AuditActions.bookingStaffUpdated, 'booking_staff_member', id, {
      changed,
    });
    return toStaff(rows[0]!);
  });
}

const MAX_REORDER = 200;

/** The order of all members in the calendar at once (its columns), like C4 in B.1. */
export async function reorderStaffInOrg(
  ctx: TenantContext,
  staffMemberIds: unknown,
): Promise<StaffMember[]> {
  if (
    !Array.isArray(staffMemberIds) ||
    staffMemberIds.length > MAX_REORDER ||
    !staffMemberIds.every(isUuid) ||
    new Set(staffMemberIds.map((s: string) => s.toLowerCase())).size !== staffMemberIds.length
  ) {
    throw new InvalidInput('staffMemberIds', 'invalid');
  }
  const ids = (staffMemberIds as string[]).map((s) => s.toLowerCase());
  return withBookingTx(ctx.organizationId, async (client, exec) => {
    const { rows: active } = await client.query<StaffRow>(
      `SELECT ${STAFF_COLUMNS} FROM booking.staff_member
        WHERE archived_at IS NULL ORDER BY id FOR UPDATE`,
    );
    const byId = new Map(active.map((r) => [r.id, r]));
    if (active.length !== ids.length || !ids.every((id) => byId.has(id))) {
      throw new Conflict('staff_order_stale');
    }
    for (const [position, id] of ids.entries()) {
      const before = byId.get(id)!;
      if (before.sort_order === position) continue;
      await client.query(`UPDATE booking.staff_member SET sort_order = $2 WHERE id = $1`, [
        id,
        position,
      ]);
      await audit(exec, ctx, AuditActions.bookingStaffUpdated, 'booking_staff_member', id, {
        changed: ['sortOrder'],
        sortOrder: { from: before.sort_order, to: position },
        reorder: true,
      });
    }
    const { rows } = await client.query<StaffRow>(
      `SELECT ${STAFF_COLUMNS} FROM booking.staff_member
        WHERE archived_at IS NULL ORDER BY sort_order, display_name, id`,
    );
    return rows.map(toStaff);
  });
}

// ── the member's schedule ───────────────────────────────────────────────────────────────────

const OVERRIDE_COLUMNS = `id, staff_member_id, ${DATE_TEXT('on_date')} AS on_date, is_working,
  start1_min, end1_min, start2_min, end2_min`;
const TIME_OFF_COLUMNS = `id, staff_member_id, ${DATE_TEXT('starts_on')} AS starts_on,
  ${DATE_TEXT('ends_on')} AS ends_on, reason, archived_at`;

type OverrideRow = DayRow & { id: string; staff_member_id: string; on_date: string };
type TimeOffRow = {
  id: string;
  staff_member_id: string;
  starts_on: string;
  ends_on: string;
  reason: string | null;
  archived_at: Date | null;
};

function toOverride(r: OverrideRow): StaffDayOverride {
  return { id: r.id, staffMemberId: r.staff_member_id, date: r.on_date, ...toWorkDay(r) };
}

function toTimeOff(r: TimeOffRow, ctx: TenantContext): StaffTimeOff {
  return {
    id: r.id,
    staffMemberId: r.staff_member_id,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    reason: SEES_LEAVE_REASON.has(ctx.role) ? r.reason : null,
    archivedAt: r.archived_at,
  };
}

/** The week, the active exceptions and the active leaves from `from` on (default: today, local). */
export async function getStaffScheduleInOrg(
  ctx: TenantContext,
  staffMemberId: string,
  params: { from?: unknown },
): Promise<StaffSchedule> {
  const id = requireId(staffMemberId);
  const from = params.from === undefined ? null : requireLocalDate('from', params.from);
  const timeZone = from ? null : await getOrganizationTimeZone(ctx);
  return withBookingTx(
    ctx.organizationId,
    async (client) => {
      const staff = await readStaff(client, id);
      const since = from ?? (await localToday(client, timeZone!));
      const weekly = await client.query<DayRow & { weekday: number }>(
        `SELECT weekday, is_working, start1_min, end1_min, start2_min, end2_min
           FROM booking.staff_weekly_hours WHERE staff_member_id = $1 ORDER BY weekday`,
        [id],
      );
      const overrides = await client.query<OverrideRow>(
        `SELECT ${OVERRIDE_COLUMNS} FROM booking.staff_day_override
          WHERE staff_member_id = $1 AND archived_at IS NULL AND on_date >= $2::date
          ORDER BY on_date`,
        [id, since],
      );
      const timeOff = await client.query<TimeOffRow>(
        `SELECT ${TIME_OFF_COLUMNS} FROM booking.staff_time_off
          WHERE staff_member_id = $1 AND archived_at IS NULL AND ends_on >= $2::date
          ORDER BY starts_on, id`,
        [id, since],
      );
      return {
        staffMember: toStaff(staff),
        weekly: weekly.rows.map((r) => ({ weekday: r.weekday, ...toWorkDay(r) })),
        overrides: overrides.rows.map(toOverride),
        timeOff: timeOff.rows.map((r) => toTimeOff(r, ctx)),
      };
    },
    true,
  );
}

/**
 * The member's own week (all 7 days), inside the business's week (S124: before_open /
 * after_close / business_closed); the member then follows it (schedule_mode = custom).
 */
export async function setStaffWeeklyHoursInOrg(
  ctx: TenantContext,
  staffMemberId: string,
  days: unknown,
): Promise<StaffSchedule> {
  const id = requireId(staffMemberId);
  await withBookingTx(ctx.organizationId, async (client, exec) => {
    const staff = await readActiveStaff(client, id);
    const week = validateStaffWeek(days, await readBusinessWeek(client));
    for (const d of week) {
      await client.query(
        `INSERT INTO booking.staff_weekly_hours
           (staff_member_id, weekday, organization_id, is_working, start1_min, end1_min, start2_min, end2_min)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (staff_member_id, weekday) DO UPDATE
           SET is_working = EXCLUDED.is_working, start1_min = EXCLUDED.start1_min,
               end1_min = EXCLUDED.end1_min, start2_min = EXCLUDED.start2_min,
               end2_min = EXCLUDED.end2_min`,
        [id, d.weekday, ctx.organizationId, d.isWorking, ...dayColumns(d)],
      );
    }
    if (staff.schedule_mode !== 'custom') {
      await client.query(`UPDATE booking.staff_member SET schedule_mode = 'custom' WHERE id = $1`, [
        id,
      ]);
    }
    await audit(exec, ctx, AuditActions.bookingStaffScheduleUpdated, 'booking_staff_member', id, {
      kind: 'weekly',
    });
  });
  return getStaffScheduleInOrg(ctx, id, {});
}

/**
 * One date that replaces the week: „Zi liberă” or „Alt program” (within that day's business
 * hours). An active one on the same date is replaced in place.
 */
export async function setStaffDayOverrideInOrg(
  ctx: TenantContext,
  staffMemberId: string,
  params: { date: unknown; isWorking: unknown; intervals?: unknown },
): Promise<StaffDayOverride> {
  const id = requireId(staffMemberId);
  const date = requireLocalDate('date', params.date);
  const day = validateWorkDay('day', { isWorking: params.isWorking, intervals: params.intervals });
  return withBookingTx(ctx.organizationId, async (client, exec) => {
    await readActiveStaff(client, id);
    const business = await readBusinessWeek(client);
    requireWithinBusiness(
      'day',
      day,
      business.find((b) => b.weekday === weekdayOf(date)),
    );
    const { rows: existing } = await client.query<{ id: string }>(
      `SELECT id FROM booking.staff_day_override
        WHERE staff_member_id = $1 AND on_date = $2::date AND archived_at IS NULL FOR UPDATE`,
      [id, date],
    );
    const row = existing[0]
      ? (
          await client.query<OverrideRow>(
            `UPDATE booking.staff_day_override
                SET is_working = $2, start1_min = $3, end1_min = $4, start2_min = $5, end2_min = $6
              WHERE id = $1 RETURNING ${OVERRIDE_COLUMNS}`,
            [existing[0].id, day.isWorking, ...dayColumns(day)],
          )
        ).rows[0]!
      : (
          await client.query<OverrideRow>(
            `INSERT INTO booking.staff_day_override
               (id, organization_id, staff_member_id, on_date, is_working, start1_min, end1_min,
                start2_min, end2_min, created_by_user_id)
             VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10)
             RETURNING ${OVERRIDE_COLUMNS}`,
            [uuidv7(), ctx.organizationId, id, date, day.isWorking, ...dayColumns(day), ctx.userId],
          )
        ).rows[0]!;
    await audit(exec, ctx, AuditActions.bookingStaffScheduleUpdated, 'booking_staff_member', id, {
      kind: 'override',
      date,
      isWorking: day.isWorking,
    });
    return toOverride(row);
  });
}

/** „Șterge excepția”: the week applies again on that date (archived, not deleted). */
export async function archiveStaffDayOverrideInOrg(
  ctx: TenantContext,
  overrideId: string,
): Promise<StaffDayOverride> {
  const id = requireId(overrideId);
  return withBookingTx(ctx.organizationId, async (client, exec) => {
    const { rows } = await client.query<OverrideRow & { archived_at: Date | null }>(
      `SELECT ${OVERRIDE_COLUMNS}, archived_at FROM booking.staff_day_override WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const before = rows[0];
    if (!before) throw new ResourceNotFound();
    if (before.archived_at) return toOverride(before);
    await client.query(
      `UPDATE booking.staff_day_override SET archived_at = now(), archived_by_user_id = $2
        WHERE id = $1`,
      [id, ctx.userId],
    );
    await audit(
      exec,
      ctx,
      AuditActions.bookingStaffScheduleUpdated,
      'booking_staff_member',
      before.staff_member_id,
      { kind: 'override_removed', date: before.on_date },
    );
    return toOverride(before);
  });
}

type TimeOffParams = { startsOn: unknown; endsOn: unknown; reason?: unknown };

/** S124 leave: „De la”, „Până la” (not before „De la”), optional „Motiv”. */
function validateTimeOff(params: TimeOffParams) {
  const startsOn = requireLocalDate('startsOn', params.startsOn);
  const endsOn = requireLocalDate('endsOn', params.endsOn);
  const days = daysBetween(startsOn, endsOn);
  if (days < 1) throw new InvalidInput('endsOn', 'leave_order');
  if (days > SCHEDULE_LIMITS.timeOffDays) throw new InvalidInput('endsOn', 'too_long');
  return { startsOn, endsOn, reason: normalizeReason(params.reason) };
}

/** A leave. The reason is not copied into the audit row (only the dates). */
export async function addStaffTimeOffInOrg(
  ctx: TenantContext,
  staffMemberId: string,
  params: TimeOffParams,
): Promise<StaffTimeOff> {
  const id = requireId(staffMemberId);
  const t = validateTimeOff(params);
  return withBookingTx(ctx.organizationId, async (client, exec) => {
    await readActiveStaff(client, id);
    const timeOffId = uuidv7();
    const { rows } = await client.query<TimeOffRow>(
      `INSERT INTO booking.staff_time_off
         (id, organization_id, staff_member_id, starts_on, ends_on, reason, created_by_user_id)
       VALUES ($1, $2, $3, $4::date, $5::date, $6, $7)
       RETURNING ${TIME_OFF_COLUMNS}`,
      [timeOffId, ctx.organizationId, id, t.startsOn, t.endsOn, t.reason, ctx.userId],
    );
    await audit(
      exec,
      ctx,
      AuditActions.bookingStaffTimeOffAdded,
      'booking_staff_time_off',
      timeOffId,
      {
        staffMemberId: id,
        startsOn: t.startsOn,
        endsOn: t.endsOn,
      },
    );
    return toTimeOff(rows[0]!, ctx);
  });
}

export async function updateStaffTimeOffInOrg(
  ctx: TenantContext,
  timeOffId: string,
  params: TimeOffParams,
): Promise<StaffTimeOff> {
  const id = requireId(timeOffId);
  const t = validateTimeOff(params);
  return withBookingTx(ctx.organizationId, async (client, exec) => {
    const { rows: found } = await client.query<TimeOffRow>(
      `SELECT ${TIME_OFF_COLUMNS} FROM booking.staff_time_off WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const before = found[0];
    if (!before) throw new ResourceNotFound();
    if (before.archived_at) throw new Conflict('staff_time_off_cancelled');
    // C1: a reason that is not sent stays as it is (a manager who does not see it keeps it).
    const keepReason = params.reason === undefined;
    const { rows } = await client.query<TimeOffRow>(
      `UPDATE booking.staff_time_off SET starts_on = $2::date, ends_on = $3::date,
              reason = CASE WHEN $5::boolean THEN reason ELSE $4 END
        WHERE id = $1 RETURNING ${TIME_OFF_COLUMNS}`,
      [id, t.startsOn, t.endsOn, t.reason, keepReason],
    );
    await audit(exec, ctx, AuditActions.bookingStaffTimeOffUpdated, 'booking_staff_time_off', id, {
      staffMemberId: before.staff_member_id,
      startsOn: t.startsOn,
      endsOn: t.endsOn,
    });
    return toTimeOff(rows[0]!, ctx);
  });
}

/** „Anulează concediul” (archived, not deleted). */
export async function archiveStaffTimeOffInOrg(
  ctx: TenantContext,
  timeOffId: string,
): Promise<StaffTimeOff> {
  const id = requireId(timeOffId);
  return withBookingTx(ctx.organizationId, async (client, exec) => {
    const { rows: found } = await client.query<TimeOffRow>(
      `SELECT ${TIME_OFF_COLUMNS} FROM booking.staff_time_off WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const before = found[0];
    if (!before) throw new ResourceNotFound();
    if (before.archived_at) return toTimeOff(before, ctx);
    const { rows } = await client.query<TimeOffRow>(
      `UPDATE booking.staff_time_off SET archived_at = now(), archived_by_user_id = $2
        WHERE id = $1 RETURNING ${TIME_OFF_COLUMNS}`,
      [id, ctx.userId],
    );
    await audit(exec, ctx, AuditActions.bookingStaffTimeOffArchived, 'booking_staff_time_off', id, {
      staffMemberId: before.staff_member_id,
      startsOn: before.starts_on,
      endsOn: before.ends_on,
    });
    return toTimeOff(rows[0]!, ctx);
  });
}

// ── availability ─────────────────────────────────────────────────────────────────────────────

/**
 * The working intervals of the members in the calendar (or one), per local date from `from` to
 * `to` (at most 62 days), as instants in the business time zone (C.0). Appointments, the buffer and
 * the notice are B.5. The local → instant step runs in Postgres (`AT TIME ZONE`), so the change to
 * or from summer time keeps the local hours.
 */
export async function getStaffAvailabilityInOrg(
  ctx: TenantContext,
  params: { from: unknown; to: unknown; staffMemberId?: unknown },
): Promise<AvailabilityDay[]> {
  const from = requireLocalDate('from', params.from);
  const to = requireLocalDate('to', params.to);
  const span = daysBetween(from, to);
  if (span < 1) throw new InvalidInput('to', 'order');
  if (span > SCHEDULE_LIMITS.availabilityDays) throw new InvalidInput('to', 'too_long');
  const only = params.staffMemberId === undefined ? null : requireId(params.staffMemberId);
  const timeZone = await getOrganizationTimeZone(ctx);

  return withBookingTx(
    ctx.organizationId,
    async (client) => {
      const staff = await readCalendarStaff(client, only);
      if (only && staff.length === 0) throw new ResourceNotFound();
      const local = await staffLocalDays(
        client,
        staff.map((s) => ({ id: s.id, scheduleMode: s.scheduleMode })),
        from,
        to,
      );

      // local (date, minute) → instant in the business time zone, in one query
      const dates: string[] = [];
      const minutes: number[] = [];
      for (const d of local) {
        for (const i of d.intervals) {
          dates.push(d.date, d.date);
          minutes.push(i.startMin, i.endMin);
        }
      }
      const instants =
        dates.length === 0
          ? []
          : (
              await client.query<{ at: Date }>(
                `SELECT ((t.d + make_interval(mins => t.m)) AT TIME ZONE $3) AS at
                   FROM unnest($1::date[], $2::int[]) WITH ORDINALITY AS t(d, m, n)
                  ORDER BY t.n`,
                [dates, minutes, timeZone],
              )
            ).rows.map((r) => r.at);
      let k = 0;
      return local.map((d) => ({
        staffMemberId: d.staffMemberId,
        date: d.date,
        intervals: d.intervals.map(() => ({ start: instants[k++]!, end: instants[k++]! })),
      }));
    },
    true,
  );
}

export { ownDay };

// ── B.5: the members in the calendar and their local days (shared with the free slots) ────

/** A member in the calendar, as the availability and the free slots (B.5) need it. */
export type CalendarStaff = {
  id: string;
  userId: string;
  displayName: string;
  scheduleMode: 'business' | 'custom';
  bookableOnline: boolean;
  sortOrder: number;
};

/** The members in the calendar (not archived), or one of them, in the team's order. */
export async function readCalendarStaff(
  client: PoolClient,
  only: string | null,
): Promise<CalendarStaff[]> {
  const { rows } = await client.query<StaffRow>(
    `SELECT ${STAFF_COLUMNS} FROM booking.staff_member
      WHERE archived_at IS NULL ${only ? 'AND id = $1' : ''}
      ORDER BY sort_order, display_name, id`,
    only ? [only] : [],
  );
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    displayName: r.display_name,
    scheduleMode: r.schedule_mode,
    bookableOnline: r.bookable_online,
    sortOrder: r.sort_order,
  }));
}

/**
 * The local working intervals of these members on every date from `from` to `to` (plan B.2 §1.3:
 * leave, exception, own week or the business's, cut to the business hours), in 5 queries.
 */
export async function staffLocalDays(
  client: PoolClient,
  staff: ReadonlyArray<{ id: string; scheduleMode: 'business' | 'custom' }>,
  from: string,
  to: string,
): Promise<Array<{ staffMemberId: string; date: string; intervals: Interval[] }>> {
  const business = await readBusinessWeek(client);
  const ids = staff.map((s) => s.id);
  const weekly = (
    await client.query<DayRow & { staff_member_id: string; weekday: number }>(
      `SELECT staff_member_id, weekday, is_working, start1_min, end1_min, start2_min, end2_min
         FROM booking.staff_weekly_hours WHERE staff_member_id = ANY($1::uuid[])`,
      [ids],
    )
  ).rows;
  const overrides = (
    await client.query<OverrideRow>(
      `SELECT ${OVERRIDE_COLUMNS} FROM booking.staff_day_override
        WHERE staff_member_id = ANY($1::uuid[]) AND archived_at IS NULL
          AND on_date BETWEEN $2::date AND $3::date`,
      [ids, from, to],
    )
  ).rows;
  const leaves = (
    await client.query<TimeOffRow>(
      `SELECT ${TIME_OFF_COLUMNS} FROM booking.staff_time_off
        WHERE staff_member_id = ANY($1::uuid[]) AND archived_at IS NULL
          AND starts_on <= $3::date AND ends_on >= $2::date`,
      [ids, from, to],
    )
  ).rows;

  const local: Array<{ staffMemberId: string; date: string; intervals: Interval[] }> = [];
  for (const s of staff) {
    const week = new Map<number, WorkDay>(
      weekly.filter((w) => w.staff_member_id === s.id).map((w) => [w.weekday, toWorkDay(w)]),
    );
    for (const date of eachDate(from, to)) {
      const o = overrides.find((x) => x.staff_member_id === s.id && x.on_date === date);
      const onLeave = leaves.some(
        (l) => l.staff_member_id === s.id && l.starts_on <= date && l.ends_on >= date,
      );
      local.push({
        staffMemberId: s.id,
        date,
        intervals: dayAvailability({
          date,
          business,
          scheduleMode: s.scheduleMode,
          weekly: week,
          override: o ? toWorkDay(o) : undefined,
          onLeave,
        }),
      });
    }
  }
  return local;
}

// ── B.4: the working intervals of one member on one local date ──────────────────────────────

/**
 * B.4 (D-B4-4 = a): the member's working intervals (local minutes) on one local date — leave,
 * exception, own week or the business's, cut to the business hours — read inside the caller's
 * transaction. An appointment outside them is refused; the team adds „Alt program” first (B.2).
 */
export async function staffDayIntervals(
  client: PoolClient,
  staffMemberId: string,
  date: string,
): Promise<Interval[]> {
  const staff = await readStaff(client, staffMemberId);
  const business = await readBusinessWeek(client);
  const weekday = weekdayOf(date);
  const weekly = (
    await client.query<DayRow & { weekday: number }>(
      `SELECT weekday, is_working, start1_min, end1_min, start2_min, end2_min
         FROM booking.staff_weekly_hours WHERE staff_member_id = $1 AND weekday = $2`,
      [staffMemberId, weekday],
    )
  ).rows;
  const override = (
    await client.query<DayRow>(
      `SELECT is_working, start1_min, end1_min, start2_min, end2_min
         FROM booking.staff_day_override
        WHERE staff_member_id = $1 AND on_date = $2::date AND archived_at IS NULL`,
      [staffMemberId, date],
    )
  ).rows[0];
  const onLeave =
    (
      await client.query(
        `SELECT 1 FROM booking.staff_time_off
          WHERE staff_member_id = $1 AND archived_at IS NULL
            AND starts_on <= $2::date AND ends_on >= $2::date`,
        [staffMemberId, date],
      )
    ).rowCount! > 0;
  return dayAvailability({
    date,
    business,
    scheduleMode: staff.schedule_mode,
    weekly: new Map(weekly.map((w) => [w.weekday, toWorkDay(w)])),
    override: override ? toWorkDay(override) : undefined,
    onLeave,
  });
}
