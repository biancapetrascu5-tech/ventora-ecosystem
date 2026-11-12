import { authorize, checkRolePermission } from '@ventora/access';
import type { TenantContext } from '@ventora/access';
import type { AppointmentScope, ClientLocale } from '../server/appointments';
import type { VisitStart } from '../server/availability';
import {
  cancelVisitInOrg,
  createVisitInOrg,
  findVisitStartInOrg,
  getVisitInOrg,
  moveVisitInOrg,
  type Visit,
} from '../server/visits';

/*
 * Lot B.9a — the public contract of a visit with several services (design BookingMultiService,
 * S126; plan reports/2026-11-12_plan-booking-b9.md). The same permissions as the appointments
 * (D-B4-6 = a): booking:read reads, booking:write creates and changes (a member only the visits
 * where every step is theirs; with booking:admin all of them). Only from the Hub (D-9a-2: not on
 * the public page in the pilot).
 *
 * Errors: as createAppointment, plus InvalidInput('steps', too_few | too_many),
 * InvalidInput('steps.<n>.<field>', invalid) and Conflict('visit_step_unavailable:<n>') — the
 * step n does not fit (the member's schedule, an overlap, a resource); findVisitStart then gives
 * the first start that day at which every step fits.
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

export type VisitStepParams = {
  /** A UUID chosen by the caller: the step's appointment id. */
  id: string;
  staffMemberId: string;
  serviceId: string;
  durationMinutes?: number;
  /** 0, 5, 10, 15 or 30 (0 or absent on the last step). */
  breakAfterMinutes?: number;
};

export type CreateVisitParams = Session & {
  /** A UUID chosen by the caller; a retry with the same id returns the same visit. */
  id: string;
  clientId?: string;
  client?: { name: string; phone?: string | null; email?: string | null; locale?: ClientLocale };
  /** ISO 8601 with offset: the start of the first step. */
  startsAt: string;
  /** 2–5 steps, in order. */
  steps: VisitStepParams[];
  confirmed?: boolean;
  teamNote?: string | null;
  locationId?: string;
};
export type VisitIdParams = Session & { visitId: string };
export type MoveVisitParams = VisitIdParams & { startsAt: string };
export type CancelVisitParams = VisitIdParams & { by: 'client' | 'business' };
export type FindVisitStartParams = Session & {
  /** The local date (YYYY-MM-DD) in the business time zone. */
  date: string;
  steps: Array<Omit<VisitStepParams, 'id'>>;
  locationId?: string;
};

/** „Programare nouă” with several services. */
export async function createVisit(params: CreateVisitParams): Promise<Visit> {
  const { ctx, scope } = await write(params);
  return createVisitInOrg(ctx, scope, {
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
    startsAt: params.startsAt,
    steps: params.steps,
    confirmed: params.confirmed,
    teamNote: params.teamNote,
    locationId: params.locationId,
  });
}

/** The visit's steps, the total time with the pauses and the total price. */
export async function getVisit(params: VisitIdParams): Promise<Visit> {
  return getVisitInOrg(await auth(params, 'booking:read'), params.visitId);
}

/** „Folosește 11:15”: the first start that day at which every step fits (null: none). */
export async function findVisitStart(params: FindVisitStartParams): Promise<VisitStart | null> {
  return findVisitStartInOrg(await auth(params, 'booking:read'), {
    date: params.date,
    steps: params.steps,
    locationId: params.locationId,
  });
}

/** „Mută vizita”: every step by the same amount (D-9a-1). */
export async function moveVisit(params: MoveVisitParams): Promise<Visit> {
  const { ctx, scope } = await write(params);
  return moveVisitInOrg(ctx, scope, params.visitId, { startsAt: params.startsAt });
}

/** „Anulează vizita”: every step still open (D-9a-1). */
export async function cancelVisit(params: CancelVisitParams): Promise<Visit> {
  const { ctx, scope } = await write(params);
  return cancelVisitInOrg(ctx, scope, params.visitId, params.by);
}
