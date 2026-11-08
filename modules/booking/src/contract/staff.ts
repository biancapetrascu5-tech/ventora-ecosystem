import { authorize } from '@ventora/access';
import type { TenantContext } from '@ventora/access';
import {
  addStaffTimeOffInOrg,
  archiveStaffDayOverrideInOrg,
  archiveStaffTimeOffInOrg,
  getBusinessHoursInOrg,
  getStaffAvailabilityInOrg,
  getStaffScheduleInOrg,
  listStaffInOrg,
  reorderStaffInOrg,
  setBusinessHoursInOrg,
  setStaffDayOverrideInOrg,
  setStaffWeeklyHoursInOrg,
  updateStaffMemberInOrg,
  updateStaffTimeOffInOrg,
  type AvailabilityDay,
  type BusinessHoursSaved,
  type StaffCutToBusinessHours,
  type StaffDayOverride,
  type StaffEligibility,
  type StaffList,
  type StaffListItem,
  type StaffMember,
  type StaffNext,
  type StaffSchedule,
  type StaffTimeOff,
} from '../server/staff';
import type { BusinessDay, Interval, ScheduleError, WorkDay } from '../server/schedule';

/*
 * Lot B.2 — the public contract of the members in the calendar and their schedule (design S124,
 * BookingTeamSchedule). Every function starts with authorize() (application booking): reading with
 * booking:read, writing with booking:settings (owner, admin, application_manager). The organization
 * comes only from the session; an id of another business answers ResourceNotFound (T1).
 *
 * Members join and leave the calendar from Hub · Echipă și invitații (S124): there is no „add” or
 * „remove” here; listStaff brings the calendar in line with the team.
 *
 * Errors: InvalidInput(field, reason) with the reason of a schedule (ScheduleError: order, overlap,
 * before_open, after_close, business_closed, leave_order, required, too_long, invalid, too_many);
 * Conflict (staff_member_removed, staff_order_stale, staff_time_off_cancelled); ResourceNotFound;
 * Forbidden; AppNotEnabled.
 */

type Session = { sessionToken: string };

function read(params: Session): Promise<TenantContext> {
  return authorize({
    sessionToken: params.sessionToken,
    applicationId: 'booking',
    permission: 'booking:read',
  });
}

function manage(params: Session): Promise<TenantContext> {
  return authorize({
    sessionToken: params.sessionToken,
    applicationId: 'booking',
    permission: 'booking:settings',
  });
}

export type BusinessDayInput = {
  weekday: number;
  isOpen: boolean;
  opensAtMin?: number | null;
  closesAtMin?: number | null;
};
export type WorkDayInput = { isWorking: boolean; intervals?: Interval[] };
export type SetBusinessHoursParams = Session & { days: BusinessDayInput[] };
export type UpdateStaffMemberParams = Session & {
  staffMemberId: string;
  bookableOnline?: boolean;
  scheduleMode?: 'business' | 'custom';
};
export type ReorderStaffParams = Session & { staffMemberIds: string[] };
export type GetStaffScheduleParams = Session & { staffMemberId: string; from?: string };
export type SetStaffWeeklyHoursParams = Session & {
  staffMemberId: string;
  days: Array<WorkDayInput & { weekday: number }>;
};
export type SetStaffDayOverrideParams = Session &
  WorkDayInput & { staffMemberId: string; date: string };
export type StaffDayOverrideIdParams = Session & { overrideId: string };
export type TimeOffInput = { startsOn: string; endsOn: string; reason?: string | null };
export type AddStaffTimeOffParams = Session & TimeOffInput & { staffMemberId: string };
export type UpdateStaffTimeOffParams = Session & TimeOffInput & { timeOffId: string };
export type StaffTimeOffIdParams = Session & { timeOffId: string };
export type GetStaffAvailabilityParams = Session & {
  from: string;
  to: string;
  staffMemberId?: string;
};

/** The business's week (or the default, D-B2-5 = a, before the first save). */
export async function getBusinessHours(params: Session): Promise<BusinessDay[]> {
  return getBusinessHoursInOrg(await read(params));
}

/**
 * All 7 days at once. S124: the members' intervals outside the new hours are cut to them; the
 * answer lists who was affected (shown to the owner).
 */
export async function setBusinessHours(
  params: SetBusinessHoursParams,
): Promise<BusinessHoursSaved> {
  return setBusinessHoursInOrg(await manage(params), params.days);
}

/** „Programul echipei”: the members in the calendar and the ones no longer in the team. */
export async function listStaff(params: Session): Promise<StaffList> {
  return listStaffInOrg(await read(params));
}

export async function updateStaffMember(params: UpdateStaffMemberParams): Promise<StaffMember> {
  return updateStaffMemberInOrg(await manage(params), params.staffMemberId, {
    bookableOnline: params.bookableOnline,
    scheduleMode: params.scheduleMode,
  });
}

/** The full order of the members in the calendar (its columns), in one transaction. */
export async function reorderStaff(params: ReorderStaffParams): Promise<StaffMember[]> {
  return reorderStaffInOrg(await manage(params), params.staffMemberIds);
}

/** The week, the exceptions and the leaves; the reason of a leave only for owner and admins. */
export async function getStaffSchedule(params: GetStaffScheduleParams): Promise<StaffSchedule> {
  return getStaffScheduleInOrg(await read(params), params.staffMemberId, { from: params.from });
}

/** „Editează programul”: the 7 days, inside the business's week. */
export async function setStaffWeeklyHours(
  params: SetStaffWeeklyHoursParams,
): Promise<StaffSchedule> {
  return setStaffWeeklyHoursInOrg(await manage(params), params.staffMemberId, params.days);
}

/** „Adaugă o excepție”: „Zi liberă” or „Alt program” on one date. */
export async function setStaffDayOverride(
  params: SetStaffDayOverrideParams,
): Promise<StaffDayOverride> {
  return setStaffDayOverrideInOrg(await manage(params), params.staffMemberId, {
    date: params.date,
    isWorking: params.isWorking,
    intervals: params.intervals,
  });
}

/** „Șterge excepția”. */
export async function archiveStaffDayOverride(
  params: StaffDayOverrideIdParams,
): Promise<StaffDayOverride> {
  return archiveStaffDayOverrideInOrg(await manage(params), params.overrideId);
}

function timeOffInput(params: TimeOffInput): TimeOffInput {
  return { startsOn: params.startsOn, endsOn: params.endsOn, reason: params.reason };
}

/** „Adaugă un concediu”. */
export async function addStaffTimeOff(params: AddStaffTimeOffParams): Promise<StaffTimeOff> {
  return addStaffTimeOffInOrg(await manage(params), params.staffMemberId, timeOffInput(params));
}

export async function updateStaffTimeOff(params: UpdateStaffTimeOffParams): Promise<StaffTimeOff> {
  return updateStaffTimeOffInOrg(await manage(params), params.timeOffId, timeOffInput(params));
}

/** „Anulează concediul”. */
export async function archiveStaffTimeOff(params: StaffTimeOffIdParams): Promise<StaffTimeOff> {
  return archiveStaffTimeOffInOrg(await manage(params), params.timeOffId);
}

/** The working intervals per date (UTC instants in the business time zone), at most 62 days. */
export async function getStaffAvailability(
  params: GetStaffAvailabilityParams,
): Promise<AvailabilityDay[]> {
  return getStaffAvailabilityInOrg(await read(params), {
    from: params.from,
    to: params.to,
    staffMemberId: params.staffMemberId,
  });
}

export type {
  AvailabilityDay,
  BusinessDay,
  BusinessHoursSaved,
  Interval,
  ScheduleError,
  StaffCutToBusinessHours,
  StaffDayOverride,
  StaffEligibility,
  StaffList,
  StaffListItem,
  StaffMember,
  StaffNext,
  StaffSchedule,
  StaffTimeOff,
  WorkDay,
};
