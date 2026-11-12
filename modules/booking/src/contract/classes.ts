import { authorize, checkRolePermission } from '@ventora/access';
import type { TenantContext } from '@ventora/access';
import type { Appointment, AppointmentScope, ClientLocale } from '../server/appointments';
import {
  addClassParticipantInOrg,
  cancelClassSessionInOrg,
  createClassSessionsInOrg,
  getClassSessionInOrg,
  listClassSessionsInOrg,
  markClassAttendanceInOrg,
  type ClassSession,
  type ClassSessionDetail,
} from '../server/classes';

/*
 * Lot B.9d1 — the contract of the classes (design BookingClasses, S126; plan
 * reports/2026-11-12_plan-booking-b9.md). booking:read sees the sessions; booking:write creates and
 * cancels sessions and changes the participants (a member only in their own sessions; with
 * booking:admin all of them). Only from the Hub (the online booking of a seat is B.9d2).
 *
 * Errors: InvalidInput (id, serviceId, staffMemberId, resourceId, seats, startsAt, repeatWeeks,
 * from, to, confirmed, attended); Conflict (service_not_class, service_archived,
 * staff_not_for_service, staff_member_removed, staff_other_location, resource_archived,
 * resource_other_location, class_session_unavailable:<n>, class_full, already_participant,
 * class_session_cancelled, client_archived, not_in_class, transition_not_allowed,
 * no_show_too_early, operation_reused); ResourceNotFound; Forbidden; QuotaExceeded.
 */

type Session = { sessionToken: string };

function auth(params: Session, permission: string): Promise<TenantContext> {
  return authorize({ sessionToken: params.sessionToken, applicationId: 'booking', permission });
}

async function write(params: Session): Promise<{ ctx: TenantContext; scope: AppointmentScope }> {
  const ctx = await auth(params, 'booking:write');
  const all =
    ctx.role !== 'support' && (await checkRolePermission(ctx.role, 'booking', 'booking:admin'));
  return { ctx, scope: all ? 'all' : 'own' };
}

export type CreateClassSessionsParams = Session & {
  /** A UUID chosen by the caller: the first session's id. */
  id: string;
  serviceId: string;
  staffMemberId: string;
  resourceId?: string | null;
  seats?: number;
  /** ISO 8601 with offset. */
  startsAt: string;
  /** „Se repetă săptămânal”: how many sessions in all (1–52). */
  repeatWeeks?: number;
  locationId?: string;
};
export type ListClassSessionsParams = Session & {
  from: string;
  to: string;
  staffMemberId?: string;
  includeCancelled?: boolean;
};
export type ClassSessionIdParams = Session & { sessionId: string };
export type AddClassParticipantParams = ClassSessionIdParams & {
  id: string;
  clientId?: string;
  client?: { name: string; phone?: string | null; email?: string | null; locale?: ClientLocale };
  confirmed?: boolean;
};
export type MarkClassAttendanceParams = Session & { appointmentId: string; attended: boolean };

/** „Sesiune nouă” (with „Se repetă săptămânal”). */
export async function createClassSessions(
  params: CreateClassSessionsParams,
): Promise<ClassSession[]> {
  const { ctx, scope } = await write(params);
  return createClassSessionsInOrg(ctx, scope, {
    id: params.id,
    serviceId: params.serviceId,
    staffMemberId: params.staffMemberId,
    resourceId: params.resourceId,
    seats: params.seats,
    startsAt: params.startsAt,
    repeatWeeks: params.repeatWeeks,
    locationId: params.locationId,
  });
}

/** The calendar: „Pilates de grup · 8/10”, „Plin”. */
export async function listClassSessions(params: ListClassSessionsParams): Promise<ClassSession[]> {
  return listClassSessionsInOrg(await auth(params, 'booking:read'), {
    from: params.from,
    to: params.to,
    staffMemberId: params.staffMemberId,
    includeCancelled: params.includeCancelled,
  });
}

/** The Drawer „Clasă”: the session and its participants. */
export async function getClassSession(params: ClassSessionIdParams): Promise<ClassSessionDetail> {
  return getClassSessionInOrg(await auth(params, 'booking:read'), params.sessionId);
}

/** „Adaugă participant”. */
export async function addClassParticipant(params: AddClassParticipantParams): Promise<Appointment> {
  const { ctx, scope } = await write(params);
  return addClassParticipantInOrg(ctx, scope, params.sessionId, {
    id: params.id,
    clientId: params.clientId,
    client: params.client
      ? {
          name: params.client.name,
          phone: params.client.phone,
          email: params.client.email,
          locale: params.client.locale,
        }
      : undefined,
    confirmed: params.confirmed,
  });
}

/** „Marchează: a venit / nu a venit”. */
export async function markClassAttendance(params: MarkClassAttendanceParams): Promise<Appointment> {
  const { ctx, scope } = await write(params);
  return markClassAttendanceInOrg(ctx, scope, params.appointmentId, params.attended);
}

/** „Anulează sesiunea…”. */
export async function cancelClassSession(
  params: ClassSessionIdParams,
): Promise<ClassSessionDetail> {
  const { ctx, scope } = await write(params);
  return cancelClassSessionInOrg(ctx, scope, params.sessionId);
}
