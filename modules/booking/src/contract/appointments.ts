import { authorize, checkRolePermission } from '@ventora/access';
import type { TenantContext } from '@ventora/access';
import {
  addTimeBlockInOrg,
  archiveTimeBlockInOrg,
  cancelAppointmentInOrg,
  changeAppointmentStatusInOrg,
  correctAppointmentStatusInOrg,
  countUpcomingAppointmentsInOrg,
  createAppointmentInOrg,
  createClientInOrg,
  getAppointmentInOrg,
  getBookingSettingsInOrg,
  listAppointmentHistoryInOrg,
  listAppointmentsInOrg,
  listTimeBlocksInOrg,
  moveAppointmentInOrg,
  searchClientsInOrg,
  setBookingSettingsInOrg,
  updateAppointmentNoteInOrg,
  updateClientInOrg,
  updateTimeBlockInOrg,
  type Appointment,
  type AppointmentDetail,
  type AppointmentHistoryItem,
  type AppointmentScope,
  type AppointmentStatus,
  type BookingSettings,
  type Client,
  type ClientInput,
  type ClientLocale,
  type TimeBlock,
  type UpcomingAppointments,
} from '../server/appointments';
import { registerAppointmentsQuotaResolver } from '../server/quota';
import { offerFreedClassSeatsAfter } from '../server/waitlist';

// B.4b: the reconciliation of booking.appointments knows this module as soon as it is loaded
registerAppointmentsQuotaResolver();

/*
 * Lot B.4a — the public contract of the appointments (design BookingStatuses, BookingNew,
 * BookingDetail, BookingCalendar, BookingList; plan reports/2026-11-09_2150_plan-booking-b4.md).
 * It replaces the proof contract of Lots 2.3 / 3.3. Every function starts with authorize()
 * (application booking); the organization comes only from the session, and an id of another
 * business answers ResourceNotFound (T1).
 *
 * Who does what (D-B4-6 = a): booking:read reads the business's calendar (the whole team);
 * booking:write creates and changes appointments, a member only those where they are the member;
 * with booking:admin (owner, admin, application_manager) all of them. „Corectează starea…” only
 * for the owner or an admin (S116-D9). The booking rules need booking:settings.
 *
 * Errors: InvalidInput(field, reason); Conflict (appointment_overlap, staff_unavailable,
 * staff_member_removed, service_archived, client_archived, client_phone_taken, client_email_taken,
 * appointment_final, transition_not_allowed, no_show_too_early, correction_window_passed,
 * operation_reused, time_block_archived, resource_unavailable (B.3b: no free unit of a resource the
 * service needs), staff_not_for_service and service_unassigned (B.2b, S129)); ResourceNotFound;
 * Forbidden; AppNotEnabled.
 */

type Session = { sessionToken: string };

function auth(params: Session, permission: string): Promise<TenantContext> {
  return authorize({ sessionToken: params.sessionToken, applicationId: 'booking', permission });
}

const read = (params: Session) => auth(params, 'booking:read');

/** booking:write, and whether the context changes all appointments or only its own (D-B4-6). */
async function write(params: Session): Promise<{ ctx: TenantContext; scope: AppointmentScope }> {
  const ctx = await auth(params, 'booking:write');
  const all =
    ctx.role !== 'support' && (await checkRolePermission(ctx.role, 'booking', 'booking:admin'));
  return { ctx, scope: all ? 'all' : 'own' };
}

export type CreateAppointmentParams = Session & {
  /** A UUID chosen by the caller; a retry with the same id returns the same appointment. */
  id: string;
  /** A member's id, or 'any' („Oricine e liber”, B.5: the system chooses the member). */
  staffMemberId: string | 'any';
  serviceId: string;
  clientId?: string;
  client?: { name: string; phone?: string | null; email?: string | null; locale?: ClientLocale };
  /** ISO 8601 with offset, e.g. 2026-12-07T10:00:00+02:00. */
  startsAt: string;
  durationMinutes?: number;
  confirmed?: boolean;
  teamNote?: string | null;
  /** B.10: for a member who works everywhere, or „any” at one location. */
  locationId?: string;
  /** B.9e „Plata: Din pachet”: a sale of the client for this service (listClientPackages). */
  packageSaleId?: string | null;
};
export type AppointmentIdParams = Session & { appointmentId: string };
export type MoveAppointmentParams = AppointmentIdParams & {
  startsAt?: string;
  staffMemberId?: string;
  durationMinutes?: number;
};
export type UpdateAppointmentNoteParams = AppointmentIdParams & { teamNote: string | null };
export type CancelAppointmentParams = AppointmentIdParams & { by: 'client' | 'business' };
export type CorrectAppointmentStatusParams = AppointmentIdParams & {
  status: 'completed' | 'no_show';
  reason: string;
};
export type ListAppointmentsParams = Session & {
  from: string;
  to: string;
  staffMemberId?: string;
  status?: AppointmentStatus[];
  query?: string;
  limit?: number;
  offset?: number;
  /** B.10: the calendar of one location (with the appointments that have none). */
  locationId?: string;
};
export type TimeBlockInputParams = { startsAt: string; endsAt: string; reason?: string | null };
export type AddTimeBlockParams = Session & TimeBlockInputParams & { staffMemberId: string };
export type UpdateTimeBlockParams = Session & TimeBlockInputParams & { timeBlockId: string };
export type TimeBlockIdParams = Session & { timeBlockId: string };
export type ListTimeBlocksParams = Session & { from: string; to: string; staffMemberId?: string };
export type SearchClientsParams = Session & { query?: string; limit?: number };
export type ClientFields = {
  name: string;
  phone?: string | null;
  email?: string | null;
  locale?: ClientLocale;
};
export type ClientParams = Session & ClientFields;
export type UpdateClientParams = Session & { clientId: string } & Partial<ClientFields>;
export type CountUpcomingAppointmentsParams = Session & {
  serviceId?: string;
  staffMemberId?: string;
  /** Local dates (YYYY-MM-DD) in the business time zone; `toDate` defaults to `fromDate`. */
  fromDate?: string;
  toDate?: string;
};
export type SetBookingSettingsParams = Session & {
  freeCancelHours?: number;
  confirmationMode?: 'auto' | 'manual';
  noticeMin?: number;
  /** B.13: the reminder by e-mail 24 hours before. */
  reminderEmail?: boolean;
  bufferMin?: number;
};

function clientInput(p: Partial<ClientFields>): ClientInput {
  return { name: p.name, phone: p.phone, email: p.email, locale: p.locale };
}

// ── appointments ───────────────────────────────────────────────────────────────────────────

/** „Programare nouă” (BookingNew). */
export async function createAppointment(params: CreateAppointmentParams): Promise<Appointment> {
  const { ctx, scope } = await write(params);
  return createAppointmentInOrg(ctx, scope, {
    id: params.id,
    staffMemberId: params.staffMemberId,
    serviceId: params.serviceId,
    clientId: params.clientId,
    client: params.client ? clientInput(params.client) : undefined,
    startsAt: params.startsAt,
    durationMinutes: params.durationMinutes,
    confirmed: params.confirmed,
    teamNote: params.teamNote,
    locationId: params.locationId,
    packageSaleId: params.packageSaleId,
  });
}

/** BookingDetail: the appointment and the last 3 history rows. */
export async function getAppointment(params: AppointmentIdParams): Promise<AppointmentDetail> {
  return getAppointmentInOrg(await read(params), params.appointmentId);
}

/** „Vezi tot istoricul”. */
export async function listAppointmentHistory(
  params: AppointmentIdParams,
): Promise<AppointmentHistoryItem[]> {
  return listAppointmentHistoryInOrg(await read(params), params.appointmentId);
}

/** BookingCalendar / BookingList / BookingToday: the appointments in [from, to), at most 62 days. */
export async function listAppointments(
  params: ListAppointmentsParams,
): Promise<{ items: Appointment[]; total: number }> {
  return listAppointmentsInOrg(await read(params), {
    from: params.from,
    to: params.to,
    staffMemberId: params.staffMemberId,
    status: params.status,
    query: params.query,
    locationId: params.locationId,
    limit: params.limit,
    offset: params.offset,
  });
}

/** „Mută programarea”. */
export async function moveAppointment(params: MoveAppointmentParams): Promise<Appointment> {
  const { ctx, scope } = await write(params);
  return moveAppointmentInOrg(ctx, scope, params.appointmentId, {
    startsAt: params.startsAt,
    staffMemberId: params.staffMemberId,
    durationMinutes: params.durationMinutes,
  });
}

export async function updateAppointmentNote(
  params: UpdateAppointmentNoteParams,
): Promise<Appointment> {
  const { ctx, scope } = await write(params);
  return updateAppointmentNoteInOrg(ctx, scope, params.appointmentId, params.teamNote);
}

/** „Confirmă”. */
export async function confirmAppointment(params: AppointmentIdParams): Promise<Appointment> {
  const { ctx, scope } = await write(params);
  return changeAppointmentStatusInOrg(ctx, scope, params.appointmentId, 'confirmed');
}

/** „Începe”. */
export async function startAppointment(params: AppointmentIdParams): Promise<Appointment> {
  const { ctx, scope } = await write(params);
  return changeAppointmentStatusInOrg(ctx, scope, params.appointmentId, 'in_progress');
}

/** „Încasează”: in B.4 only „Încheiată” (D-B4-10 = a); the payment is recorded from B.21. */
export async function completeAppointment(params: AppointmentIdParams): Promise<Appointment> {
  const { ctx, scope } = await write(params);
  return changeAppointmentStatusInOrg(ctx, scope, params.appointmentId, 'completed');
}

/** „Marchează: nu a venit”, only after the start. */
export async function markNoShow(params: AppointmentIdParams): Promise<Appointment> {
  const { ctx, scope } = await write(params);
  return changeAppointmentStatusInOrg(ctx, scope, params.appointmentId, 'no_show');
}

/** „Anulează programarea”, by the business or recorded for the client. */
export async function cancelAppointment(params: CancelAppointmentParams): Promise<Appointment> {
  const { ctx, scope } = await write(params);
  const cancelled = await cancelAppointmentInOrg(ctx, scope, params.appointmentId, params.by);
  // B.9d2 (D-9d-2): the freed seat of a class goes to the first one on its waiting list
  if (cancelled.classSessionId) {
    await offerFreedClassSeatsAfter(ctx.organizationId, cancelled.classSessionId);
  }
  return cancelled;
}

/** „Corectează starea…” (S116-D9): owner or admin, 24 hours, „Încheiată” ↔ „Nu a venit”. */
export async function correctAppointmentStatus(
  params: CorrectAppointmentStatusParams,
): Promise<Appointment> {
  const { ctx } = await write(params);
  return correctAppointmentStatusInOrg(ctx, params.appointmentId, {
    status: params.status,
    reason: params.reason,
  });
}

// ── blocked times ──────────────────────────────────────────────────────────────────────────

export async function addTimeBlock(params: AddTimeBlockParams): Promise<TimeBlock> {
  const { ctx, scope } = await write(params);
  return addTimeBlockInOrg(ctx, scope, params.staffMemberId, {
    startsAt: params.startsAt,
    endsAt: params.endsAt,
    reason: params.reason,
  });
}

export async function updateTimeBlock(params: UpdateTimeBlockParams): Promise<TimeBlock> {
  const { ctx, scope } = await write(params);
  return updateTimeBlockInOrg(ctx, scope, params.timeBlockId, {
    startsAt: params.startsAt,
    endsAt: params.endsAt,
    reason: params.reason,
  });
}

export async function archiveTimeBlock(params: TimeBlockIdParams): Promise<TimeBlock> {
  const { ctx, scope } = await write(params);
  return archiveTimeBlockInOrg(ctx, scope, params.timeBlockId);
}

export async function listTimeBlocks(params: ListTimeBlocksParams): Promise<TimeBlock[]> {
  return listTimeBlocksInOrg(await read(params), {
    from: params.from,
    to: params.to,
    staffMemberId: params.staffMemberId,
  });
}

// ── clients ────────────────────────────────────────────────────────────────────────────────

/** The client field of BookingNew („Clienți recenți” without a query). */
export async function searchClients(params: SearchClientsParams): Promise<Client[]> {
  return searchClientsInOrg(await read(params), { query: params.query, limit: params.limit });
}

export async function createClient(params: ClientParams): Promise<Client> {
  const { ctx } = await write(params);
  return createClientInOrg(ctx, clientInput(params));
}

export async function updateClient(params: UpdateClientParams): Promise<Client> {
  const { ctx } = await write(params);
  return updateClientInOrg(ctx, params.clientId, clientInput(params));
}

// ── B.4b: the upcoming appointments (S124, BookingServices) ─────────────────────────────────

/** „Are {n} programări viitoare” (a service) / „{name} are {n} programări pe {date}” (S124). */
export async function countUpcomingAppointments(
  params: CountUpcomingAppointmentsParams,
): Promise<UpcomingAppointments> {
  return countUpcomingAppointmentsInOrg(await read(params), {
    serviceId: params.serviceId,
    staffMemberId: params.staffMemberId,
    fromDate: params.fromDate,
    toDate: params.toDate,
  });
}

// ── booking rules (D-B4-5) ─────────────────────────────────────────────────────────────────

export async function getBookingSettings(params: Session): Promise<BookingSettings> {
  return getBookingSettingsInOrg(await read(params));
}

export async function setBookingSettings(
  params: SetBookingSettingsParams,
): Promise<BookingSettings> {
  return setBookingSettingsInOrg(await auth(params, 'booking:settings'), {
    freeCancelHours: params.freeCancelHours,
    confirmationMode: params.confirmationMode,
    noticeMin: params.noticeMin,
    reminderEmail: params.reminderEmail,
    bufferMin: params.bufferMin,
  });
}

export type {
  Appointment,
  AppointmentDetail,
  AppointmentHistoryItem,
  AppointmentStatus,
  BookingSettings,
  Client,
  ClientLocale,
  TimeBlock,
  UpcomingAppointments,
};
