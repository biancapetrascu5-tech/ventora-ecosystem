import { authorize, checkRolePermission } from '@ventora/access';
import type { TenantContext } from '@ventora/access';
import type { Appointment, AppointmentScope, ClientLocale } from '../server/appointments';
import {
  cancelSeriesInOrg,
  createSeriesInOrg,
  getSeriesInOrg,
  moveSeriesInOrg,
  previewSeriesInOrg,
  type Series,
  type SeriesFrequency,
  type SeriesPreview,
} from '../server/series';

/*
 * Lot B.9b — the public contract of the recurring appointments (design BookingRecurring, S126;
 * plan reports/2026-11-12_plan-booking-b9.md). The same permissions as the appointments
 * (D-B4-6 = a): booking:read reads and previews, booking:write creates and changes (a member only
 * their own appointments; with booking:admin all of them). Only from the Hub.
 *
 * Errors: as createAppointment, plus InvalidInput('until', required | invalid | too_short |
 * too_long) (D-9b-1: at most 52 appointments or 12 months), InvalidInput('frequency' | 'mode' |
 * 'time' | 'adjustments.<n>.<field>', …), Conflict('series_date_unavailable:<index>') — that date
 * does not fit; previewSeries gives the reason and the ways out — and Conflict('not_in_series').
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

export type SeriesRuleParams = {
  staffMemberId: string;
  serviceId: string;
  /** The first appointment, ISO 8601 with offset. */
  startsAt: string;
  frequency: SeriesFrequency;
  /** „Până când”: a local date (YYYY-MM-DD) or a number of appointments. */
  until: { date: string } | { count: number };
  durationMinutes?: number;
  locationId?: string;
};
export type PreviewSeriesParams = Session & SeriesRuleParams;
export type CreateSeriesParams = Session &
  SeriesRuleParams & {
    /** A UUID chosen by the caller; a retry with the same id returns the same series. */
    id: string;
    clientId?: string;
    client?: { name: string; phone?: string | null; email?: string | null; locale?: ClientLocale };
    confirmed?: boolean;
    teamNote?: string | null;
    /** The choices for the dates that were not free (by their index in the preview). */
    adjustments?: Array<
      { index: number; skip: true } | { index: number; startsAt?: string; staffMemberId?: string }
    >;
  };
export type SeriesIdParams = Session & { seriesId: string };
export type MoveSeriesParams = Session & {
  /** An appointment of the series: „Aceasta și următoarele” counts from it. */
  appointmentId: string;
  mode: 'following' | 'all';
  /** The new local time of day ('HH:MM'). */
  time?: string;
  staffMemberId?: string;
};
export type CancelSeriesParams = Session & {
  appointmentId: string;
  mode: 'this' | 'following' | 'all';
  by: 'client' | 'business';
};

function rule(p: SeriesRuleParams) {
  return {
    staffMemberId: p.staffMemberId,
    serviceId: p.serviceId,
    startsAt: p.startsAt,
    frequency: p.frequency,
    until: p.until,
    durationMinutes: p.durationMinutes,
    locationId: p.locationId,
  };
}

/** „2 din 8 date nu sunt libere”: the dates of the rule, checked before saving. */
export async function previewSeries(params: PreviewSeriesParams): Promise<SeriesPreview> {
  return previewSeriesInOrg(await auth(params, 'booking:read'), rule(params));
}

/** „Creează 8 programări”. */
export async function createSeries(params: CreateSeriesParams): Promise<Series> {
  const { ctx, scope } = await write(params);
  return createSeriesInOrg(ctx, scope, {
    ...rule(params),
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
    teamNote: params.teamNote,
    adjustments: params.adjustments,
  });
}

/** „Se repetă · 3 din 8”: the rule and every appointment of the series. */
export async function getSeries(params: SeriesIdParams): Promise<Series> {
  return getSeriesInOrg(await auth(params, 'booking:read'), params.seriesId);
}

/** „Modifică” → „Aceasta și următoarele” / „Toate din serie”. */
export async function moveSeries(params: MoveSeriesParams): Promise<Appointment[]> {
  const { ctx, scope } = await write(params);
  return moveSeriesInOrg(ctx, scope, params.appointmentId, {
    mode: params.mode,
    time: params.time,
    staffMemberId: params.staffMemberId,
  });
}

/** „Anulează” → „Doar aceasta” / „Aceasta și următoarele” / „Toate din serie”. */
export async function cancelSeries(params: CancelSeriesParams): Promise<Appointment[]> {
  const { ctx, scope } = await write(params);
  return cancelSeriesInOrg(ctx, scope, params.appointmentId, { mode: params.mode, by: params.by });
}
