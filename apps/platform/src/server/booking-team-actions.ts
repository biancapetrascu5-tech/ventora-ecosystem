'use server';

import './access-config';
import { headers } from 'next/headers';
import { authorize } from '@ventora/access';
import {
  addStaffTimeOff,
  archiveStaffDayOverride,
  archiveStaffTimeOff,
  getBusinessHours,
  getStaffSchedule,
  listStaff,
  setStaffDayOverride,
  setStaffWeeklyHours,
  updateStaffTimeOff,
  type BusinessDay,
  type Interval,
  type StaffDayOverride,
  type StaffNext,
  type StaffSchedule,
  type StaffTimeOff,
} from '@ventora/booking';
import { getSession } from '@ventora/identity';
import { getOrganizationTimeZone } from '@ventora/organizations';
import { reportActionError } from './report-error';

/* Lot B.2-UI — EasyBook · Setări · „Programul echipei” (BookingTeamSchedule, S124). The business and
   the person come only from the session; every call goes through the booking contracts (B.2),
   which start with authorize(). Decision 3: the page only for booking:settings. S124: the reason
   of a leave only for the owner and the admins (the contract hides it; C1 keeps it when not sent).
   The data reaches the screen without Date objects. */

const SEES_LEAVE_REASON = new Set(['owner', 'admin']);

export type TeamMemberData = {
  id: string;
  name: string;
  role: string;
  week: { weekday: number; intervals: Interval[] }[];
  next: StaffNext;
};
export type RemovedMemberData = { id: string; name: string; archivedAt: string };

export type TeamPageData = {
  members: TeamMemberData[];
  removed: RemovedMemberData[];
  business: BusinessDay[];
  /** S124: „Motiv” shown and written only by the owner and the admins. */
  canSeeReason: boolean;
  /** The business's today („YYYY-MM-DD”, C.0 time zone): the DatePickers' ring and defaults. */
  today: string;
  timeZone: string;
};

export type TeamPage =
  | { kind: 'ok'; data: TeamPageData }
  | { kind: 'signedOut' }
  | { kind: 'notEnabled' }
  | { kind: 'forbidden' };

export type OverrideData = {
  id: string;
  date: string;
  isWorking: boolean;
  intervals: Interval[];
};
export type TimeOffData = { id: string; startsOn: string; endsOn: string; reason: string | null };
export type MemberScheduleData = {
  id: string;
  name: string;
  weekly: { weekday: number; isWorking: boolean; intervals: Interval[] }[];
  overrides: OverrideData[];
  timeOff: TimeOffData[];
};

const toOverride = (o: StaffDayOverride): OverrideData => ({
  id: o.id,
  date: o.date,
  isWorking: o.isWorking,
  intervals: o.intervals,
});
const toTimeOff = (t: StaffTimeOff): TimeOffData => ({
  id: t.id,
  startsOn: t.startsOn,
  endsOn: t.endsOn,
  reason: t.reason,
});
const toSchedule = (s: StaffSchedule): MemberScheduleData => ({
  id: s.staffMember.id,
  name: s.staffMember.displayName,
  weekly: s.weekly.map((w) => ({
    weekday: w.weekday,
    isWorking: w.isWorking,
    intervals: w.intervals,
  })),
  overrides: s.overrides.map(toOverride),
  timeOff: s.timeOff.filter((t) => !t.archivedAt).map(toTimeOff),
});

const codeOf = (err: unknown) => (err as { code?: string } | null)?.code;

async function sessionToken(): Promise<string | null> {
  const session = await getSession(await headers());
  return session?.token ?? null;
}

function todayIn(timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return parts;
}

/** The page: who may open it (decision 3), then the members, the business's week and today. */
export async function readTeamPage(): Promise<TeamPage> {
  const token = await sessionToken();
  if (!token) return { kind: 'signedOut' };
  let organizationId: string;
  let role: string;
  try {
    const ctx = await authorize({
      sessionToken: token,
      applicationId: 'booking',
      permission: 'booking:settings',
    });
    organizationId = ctx.organizationId;
    role = ctx.role;
  } catch (err) {
    const code = codeOf(err);
    if (code === 'APP_NOT_ENABLED') return { kind: 'notEnabled' };
    if (code === 'NOT_AUTHENTICATED') return { kind: 'signedOut' };
    reportActionError('booking.team.read', err, { quietIfExpected: true });
    return { kind: 'forbidden' };
  }
  const [staff, business, timeZone] = await Promise.all([
    listStaff({ sessionToken: token }),
    getBusinessHours({ sessionToken: token }),
    getOrganizationTimeZone({ organizationId }),
  ]);
  return {
    kind: 'ok',
    data: {
      members: staff.members.map((m) => ({
        id: m.id,
        name: m.displayName,
        role: m.role,
        week: m.week,
        next: m.next,
      })),
      removed: staff.removed.map((m) => ({
        id: m.id,
        name: m.displayName,
        archivedAt: (m.archivedAt ?? new Date()).toISOString(),
      })),
      business,
      canSeeReason: SEES_LEAVE_REASON.has(role),
      today: todayIn(timeZone),
      timeZone,
    },
  };
}

export type TeamActionError =
  'forbidden' | 'not_found' | 'removed' | 'cancelled' | 'failed' | `invalid:${string}:${string}`;

export type TeamActionResult<T> = { ok: true; value: T } | { ok: false; error: TeamActionError };

async function run<T>(
  action: string,
  fn: (token: string) => Promise<T>,
): Promise<TeamActionResult<T>> {
  const token = await sessionToken();
  if (!token) return { ok: false, error: 'forbidden' };
  try {
    return { ok: true, value: await fn(token) };
  } catch (err) {
    reportActionError(action, err, { quietIfExpected: true });
    const code = codeOf(err);
    const message = (err as Error | null)?.message ?? '';
    if (code === 'CONFLICT') {
      if (message === 'staff_member_removed') return { ok: false, error: 'removed' };
      if (message === 'staff_time_off_cancelled') return { ok: false, error: 'cancelled' };
    }
    if (code === 'INVALID_INPUT') {
      const field = (err as { field?: string }).field ?? '';
      return { ok: false, error: `invalid:${field}:${message}` };
    }
    if (code === 'RESOURCE_NOT_FOUND') return { ok: false, error: 'not_found' };
    if (code === 'FORBIDDEN' || code === 'APP_NOT_ENABLED' || code === 'NOT_AUTHENTICATED') {
      return { ok: false, error: 'forbidden' };
    }
    return { ok: false, error: 'failed' };
  }
}

/** The Drawer: the week, the exceptions and the leaves from today on. */
export async function readMemberSchedule(
  staffMemberId: string,
): Promise<TeamActionResult<MemberScheduleData>> {
  return run('booking.team.schedule', async (sessionToken) =>
    toSchedule(await getStaffSchedule({ sessionToken, staffMemberId })),
  );
}

/** „Salvează programul”: the 7 days, inside the business's week. */
export async function saveWeeklyHours(
  staffMemberId: string,
  days: { weekday: number; isWorking: boolean; intervals: Interval[] }[],
): Promise<TeamActionResult<MemberScheduleData>> {
  return run('booking.team.week', async (sessionToken) =>
    toSchedule(await setStaffWeeklyHours({ sessionToken, staffMemberId, days })),
  );
}

/** „Salvează excepția”: „Zi liberă” or „Alt program” on a date (new or the same date again). */
export async function saveDayOverride(
  staffMemberId: string,
  date: string,
  day: { isWorking: boolean; intervals: Interval[] },
): Promise<TeamActionResult<OverrideData>> {
  return run('booking.team.override', async (sessionToken) =>
    toOverride(
      await setStaffDayOverride({
        sessionToken,
        staffMemberId,
        date,
        isWorking: day.isWorking,
        intervals: day.intervals,
      }),
    ),
  );
}

/** „Șterge excepția”. */
export async function removeDayOverride(overrideId: string): Promise<TeamActionResult<null>> {
  return run('booking.team.override.remove', async (sessionToken) => {
    await archiveStaffDayOverride({ sessionToken, overrideId });
    return null;
  });
}

/**
 * „Salvează concediul”, new or edited. `reason` undefined keeps the saved one (C1): someone who
 * does not see it never sends it.
 */
export async function saveTimeOff(
  staffMemberId: string,
  timeOffId: string | null,
  fields: { startsOn: string; endsOn: string; reason?: string | null },
): Promise<TeamActionResult<TimeOffData>> {
  return run('booking.team.timeoff', async (sessionToken) =>
    toTimeOff(
      timeOffId
        ? await updateStaffTimeOff({ sessionToken, timeOffId, ...fields })
        : await addStaffTimeOff({ sessionToken, staffMemberId, ...fields }),
    ),
  );
}

/** „Anulează concediul”. */
export async function cancelTimeOff(timeOffId: string): Promise<TeamActionResult<null>> {
  return run('booking.team.timeoff.cancel', async (sessionToken) => {
    await archiveStaffTimeOff({ sessionToken, timeOffId });
    return null;
  });
}
