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
import {
  setStaffServicesInOrg,
  type MemberServices,
  type StoppedPair,
} from '../server/staff-services';
import {
  listStaffServiceTermsInOrg,
  setStaffServiceTermsInOrg,
  type EffectiveTerms,
  type StaffServiceTerms,
} from '../server/terms';
import {
  countUpcomingAppointmentsInOrg,
  countUpcomingByStaffInOrg,
  type UpcomingAppointments,
} from '../server/appointments';

/** B.4b (S124): the warning data of an exception or a leave; nothing is cancelled. */
export type WithUpcomingAppointments<T> = T & { upcomingAppointments: UpcomingAppointments };
/** B.4b (S124): „… nu mai e în echipă, dar are {n} programări viitoare”. */
export type StaffListWithAppointments = Omit<StaffList, 'removed'> & {
  removed: Array<StaffList['removed'][number] & { upcomingAppointments: number }>;
};

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
export type SetStaffServicesParams = Session & {
  staffMemberId: string;
  /** „Toate serviciile” (including services added later). */
  allServices: boolean;
  /** The services ticked one by one (when not allServices); empty is allowed (S129, reception). */
  serviceIds?: string[];
};
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
export async function listStaff(params: Session): Promise<StaffListWithAppointments> {
  const ctx = await read(params);
  const list = await listStaffInOrg(ctx);
  const counts = await countUpcomingByStaffInOrg(
    ctx,
    list.removed.map((m) => m.id),
  );
  return {
    ...list,
    removed: list.removed.map((m) => ({ ...m, upcomingAppointments: counts.get(m.id) ?? 0 })),
  };
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
): Promise<WithUpcomingAppointments<StaffDayOverride>> {
  const ctx = await manage(params);
  const saved = await setStaffDayOverrideInOrg(ctx, params.staffMemberId, {
    date: params.date,
    isWorking: params.isWorking,
    intervals: params.intervals,
  });
  const upcomingAppointments = await countUpcomingAppointmentsInOrg(ctx, {
    staffMemberId: params.staffMemberId,
    fromDate: params.date,
  });
  return { ...saved, upcomingAppointments };
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

async function withLeaveAppointments(
  ctx: Awaited<ReturnType<typeof manage>>,
  saved: StaffTimeOff,
): Promise<WithUpcomingAppointments<StaffTimeOff>> {
  const upcomingAppointments = await countUpcomingAppointmentsInOrg(ctx, {
    staffMemberId: saved.staffMemberId,
    fromDate: saved.startsOn,
    toDate: saved.endsOn,
  });
  return { ...saved, upcomingAppointments };
}

/** „Adaugă un concediu”; the answer says how many appointments fall in it (S124). */
export async function addStaffTimeOff(
  params: AddStaffTimeOffParams,
): Promise<WithUpcomingAppointments<StaffTimeOff>> {
  const ctx = await manage(params);
  const saved = await addStaffTimeOffInOrg(ctx, params.staffMemberId, timeOffInput(params));
  return withLeaveAppointments(ctx, saved);
}

/** C1: `reason` left out (undefined) keeps the saved reason; `null` or "" clears it. */
export async function updateStaffTimeOff(
  params: UpdateStaffTimeOffParams,
): Promise<WithUpcomingAppointments<StaffTimeOff>> {
  const ctx = await manage(params);
  const saved = await updateStaffTimeOffInOrg(ctx, params.timeOffId, timeOffInput(params));
  return withLeaveAppointments(ctx, saved);
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

/**
 * B.2b (S129) „Servicii”, from the member side (BookingTeamSchedule drawer). booking:settings. The
 * answer lists the services the member stopped doing, with their future appointments (kept).
 */
export async function setStaffServices(
  params: SetStaffServicesParams,
): Promise<{ services: MemberServices; stopped: StoppedPair[] }> {
  const ctx = await authorize({
    sessionToken: params.sessionToken,
    applicationId: 'booking',
    permission: 'booking:settings',
  });
  return setStaffServicesInOrg(ctx, params.staffMemberId, {
    allServices: params.allServices,
    serviceIds: params.serviceIds,
  });
}

export type ListStaffServiceTermsParams = Session & { serviceId?: string; staffMemberId?: string };
export type SetStaffServiceTermsParams = Session & {
  staffMemberId: string;
  serviceId: string;
  /** null / absent: the service's. */
  durationMinutes?: number | null;
  durationMaxMinutes?: number | null;
  price?: { kind: 'fixed' | 'from' | 'range'; minor: number; maxMinor?: number | null } | null;
};

/** B.2c: the members' own duration and price, for one service or one member. booking:read. */
export async function listStaffServiceTerms(
  params: ListStaffServiceTermsParams,
): Promise<StaffServiceTerms[]> {
  const ctx = await authorize({
    sessionToken: params.sessionToken,
    applicationId: 'booking',
    permission: 'booking:read',
  });
  return listStaffServiceTermsInOrg(ctx, {
    serviceId: params.serviceId,
    staffMemberId: params.staffMemberId,
  });
}

/**
 * B.2c: a member's own duration and / or price for a service (a senior stylist charges more).
 * booking:settings. All null → back to the service's. The member must do the service (B.2b).
 */
export async function setStaffServiceTerms(
  params: SetStaffServiceTermsParams,
): Promise<{ terms: StaffServiceTerms | null; effective: EffectiveTerms }> {
  const ctx = await authorize({
    sessionToken: params.sessionToken,
    applicationId: 'booking',
    permission: 'booking:settings',
  });
  return setStaffServiceTermsInOrg(ctx, {
    staffMemberId: params.staffMemberId,
    serviceId: params.serviceId,
    durationMinutes: params.durationMinutes,
    durationMaxMinutes: params.durationMaxMinutes,
    price: params.price,
  });
}
