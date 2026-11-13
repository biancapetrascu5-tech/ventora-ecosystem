'use server';

import './access-config';
import { headers } from 'next/headers';
import { authorize, checkRolePermission } from '@ventora/access';
import {
  cancelAppointment,
  completeAppointment,
  confirmAppointment,
  correctAppointmentStatus,
  getAppointment,
  getClientCard,
  listAppointmentHistory,
  listAppointments,
  listStaff,
  markNoShow,
  moveAppointment,
  startAppointment,
  updateAppointmentNote,
  type Appointment,
  type AppointmentHistoryItem,
  type AppointmentStatus,
} from '@ventora/booking';
import { getSession } from '@ventora/identity';
import { getOrganizationTimeZone } from '@ventora/organizations';
import { addDays, instantsAround, localOf, weekdayOf } from './booking-time';
import { reportActionError } from './report-error';

/* Lot B.6a / B.6b — EasyBook · „Programări” with the detail of an appointment (BookingDetail,
   BookingStatuses; Decision 7, screen 3). The business and the person come only from the session;
   every call goes through the booking contracts, which start with authorize() (booking:read to
   read the whole calendar, booking:write to change — a member only their own appointments,
   D-B4-6 = a). The instants become local dates and „HH:MM” of the business's time zone (C.0)
   here; no Date objects reach the screen. */

export type ListPeriod = 'today' | 'week' | 'month';
export type ListState = 'active' | 'unconfirmed' | 'cancelled';

export type AppointmentRowData = {
  id: string;
  date: string;
  start: string;
  end: string;
  minutes: number;
  client: string;
  service: string;
  staffId: string;
  staff: string;
  price: {
    kind: 'fixed' | 'from' | 'range';
    minor: number;
    maxMinor: number | null;
    currency: 'RON' | 'EUR';
  };
  status: AppointmentStatus;
};

export type AppointmentsPageData = {
  rows: AppointmentRowData[];
  staff: { id: string; name: string }[];
  today: string;
  canWrite: boolean;
  /** 'own': a member changes only their own appointments. */
  scope: 'all' | 'own';
  myStaffId: string | null;
  /** The owner or an admin (S116-D9). */
  canCorrect: boolean;
};

export type AppointmentsPage =
  | { kind: 'ok'; data: AppointmentsPageData }
  | { kind: 'signedOut' }
  | { kind: 'notEnabled' }
  | { kind: 'forbidden' };

const codeOf = (err: unknown) => (err as { code?: string } | null)?.code;
const reasonOf = (err: unknown) => (err as { message?: string } | null)?.message ?? '';

async function sessionToken(): Promise<string | null> {
  const session = await getSession(await headers());
  return session?.token ?? null;
}

const STATES: Record<ListState, AppointmentStatus[]> = {
  active: ['awaiting_payment', 'unconfirmed', 'confirmed', 'in_progress', 'completed', 'no_show'],
  unconfirmed: ['unconfirmed'],
  cancelled: ['cancelled'],
};

function rangeOf(period: ListPeriod, today: string): { first: string; last: string } {
  if (period === 'today') return { first: today, last: today };
  if (period === 'week') {
    const monday = addDays(today, 1 - weekdayOf(today));
    return { first: monday, last: addDays(monday, 6) };
  }
  const first = `${today.slice(0, 8)}01`;
  const next = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1));
  return { first, last: addDays(next.toISOString().slice(0, 10), -1) };
}

function rowOf(a: Appointment, timeZone: string): AppointmentRowData {
  const s = localOf(a.startsAt, timeZone);
  const e = localOf(a.endsAt, timeZone);
  return {
    id: a.id,
    date: s.date,
    start: s.time,
    end: e.date === s.date ? e.time : '24:00',
    minutes: a.durationMinutes,
    client: a.clientName,
    service: a.serviceName,
    staffId: a.staffMemberId,
    staff: a.staffDisplayName,
    price: a.price,
    status: a.status,
  };
}

/** The list: the period, the person, the state and the search, in the business's days. */
export async function readAppointmentsPage(params: {
  period: ListPeriod;
  staffId: string;
  state: ListState;
  query: string;
}): Promise<AppointmentsPage> {
  const token = await sessionToken();
  if (!token) return { kind: 'signedOut' };
  let ctx: Awaited<ReturnType<typeof authorize>>;
  try {
    ctx = await authorize({
      sessionToken: token,
      applicationId: 'booking',
      permission: 'booking:read',
    });
  } catch (err) {
    const code = codeOf(err);
    if (code === 'APP_NOT_ENABLED') return { kind: 'notEnabled' };
    if (code === 'NOT_AUTHENTICATED') return { kind: 'signedOut' };
    reportActionError('booking.appointments.read', err, { quietIfExpected: true });
    return { kind: 'forbidden' };
  }
  const [canWrite, admin] = await Promise.all([
    authorize({ sessionToken: token, applicationId: 'booking', permission: 'booking:write' }).then(
      () => true,
      () => false,
    ),
    ctx.role === 'support'
      ? Promise.resolve(false)
      : checkRolePermission(ctx.role, 'booking', 'booking:admin'),
  ]);
  const timeZone = await getOrganizationTimeZone({ organizationId: ctx.organizationId });
  const today = localOf(new Date(), timeZone).date;
  const { first, last } = rangeOf(params.period, today);
  const { from, to } = instantsAround(first, last);
  const [staff, list] = await Promise.all([
    listStaff({ sessionToken: token }),
    listAppointments({
      sessionToken: token,
      from,
      to,
      status: STATES[params.state],
      staffMemberId: params.staffId !== 'all' ? params.staffId : undefined,
      query: params.query.trim() || undefined,
      limit: 500,
    }),
  ]);
  const rows = list.items
    .map((a) => rowOf(a, timeZone))
    .filter((r) => r.date >= first && r.date <= last)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const mine = staff.members.find((m) => m.userId === ctx.userId) ?? null;
  return {
    kind: 'ok',
    data: {
      rows,
      staff: staff.members.map((m) => ({ id: m.id, name: m.displayName })),
      today,
      canWrite,
      scope: admin ? 'all' : 'own',
      myStaffId: mine?.id ?? null,
      canCorrect: ctx.role === 'owner' || ctx.role === 'admin',
    },
  };
}

export type HistoryData = {
  kind: AppointmentHistoryItem['kind'];
  toStatus: AppointmentStatus | null;
  actorType: AppointmentHistoryItem['actorType'];
  actor: string | null;
  date: string;
  time: string;
  /** 'moved': the local start before and after. */
  from: string | null;
  to: string | null;
};

export type AppointmentDetailData = {
  row: AppointmentRowData;
  serviceId: string;
  clientId: string;
  phone: string | null;
  note: string;
  source: 'hub' | 'public';
  /** When the state last changed (S116-D9: the 24 hours of „Corectează starea…”). */
  statusChangedAt: string;
  startsAt: string;
  cancellation: {
    by: 'client' | 'business';
    byName: string | null;
    minutesBefore: number;
    late: boolean;
  } | null;
  deposit: { minor: number; currency: 'RON' | 'EUR'; until: string } | null;
  history: HistoryData[];
  historyCount: number;
};

export type DetailResult =
  { ok: true; data: AppointmentDetailData } | { ok: false; error: 'notFound' | 'failed' };

function historyOf(
  items: AppointmentHistoryItem[],
  timeZone: string,
  names: Map<string, string>,
): HistoryData[] {
  // newest first; a move shows the start before it (the next older row with a start)
  const sorted = [...items].sort((a, b) => b.at.getTime() - a.at.getTime());
  return sorted.map((h, i) => {
    const at = localOf(h.at, timeZone);
    const before = sorted.slice(i + 1).find((x) => x.startsAt);
    return {
      kind: h.kind,
      toStatus: h.toStatus,
      actorType: h.actorType,
      actor: h.actorUserId ? (names.get(h.actorUserId) ?? null) : null,
      date: at.date,
      time: at.time,
      from: h.kind === 'moved' && before?.startsAt ? localOf(before.startsAt, timeZone).time : null,
      to: h.kind === 'moved' && h.startsAt ? localOf(h.startsAt, timeZone).time : null,
    };
  });
}

/** One appointment for the drawer: its data, the last 3 history rows (or all of them). */
export async function readAppointmentDetail(id: string, all = false): Promise<DetailResult> {
  const token = await sessionToken();
  if (!token) return { ok: false, error: 'failed' };
  try {
    const ctx = await authorize({
      sessionToken: token,
      applicationId: 'booking',
      permission: 'booking:read',
    });
    const [detail, staff, timeZone] = await Promise.all([
      getAppointment({ sessionToken: token, appointmentId: id }),
      listStaff({ sessionToken: token }),
      getOrganizationTimeZone({ organizationId: ctx.organizationId }),
    ]);
    const a = detail.appointment;
    const [card, history] = await Promise.all([
      getClientCard({ sessionToken: token, clientId: a.clientId }).catch(() => null),
      all
        ? listAppointmentHistory({ sessionToken: token, appointmentId: id })
        : Promise.resolve(detail.history),
    ]);
    const names = new Map(
      [...staff.members, ...staff.removed].map((m) => [m.userId, m.displayName] as const),
    );
    return {
      ok: true,
      data: {
        row: rowOf(a, timeZone),
        serviceId: a.serviceId,
        clientId: a.clientId,
        phone: card?.client.phone ?? null,
        note: a.teamNote ?? '',
        source: a.source,
        statusChangedAt: a.statusChangedAt.toISOString(),
        startsAt: a.startsAt.toISOString(),
        cancellation: a.cancellation
          ? {
              by: a.cancellation.by,
              byName: a.cancellation.byUserId ? (names.get(a.cancellation.byUserId) ?? null) : null,
              minutesBefore: a.cancellation.minutesBefore,
              late: a.cancellation.late,
            }
          : null,
        deposit: a.deposit
          ? {
              minor: a.deposit.minor,
              currency: a.deposit.currency,
              until: localOf(a.deposit.dueAt, timeZone).time,
            }
          : null,
        history: historyOf(history, timeZone, names),
        historyCount: detail.historyCount,
      },
    };
  } catch (err) {
    reportActionError('booking.appointments.detail', err, { quietIfExpected: true });
    return { ok: false, error: codeOf(err) === 'NOT_FOUND' ? 'notFound' : 'failed' };
  }
}

export type DetailActionError =
  'failed' | 'forbidden' | 'tooEarly' | 'window' | 'reason' | 'overlap' | 'final';
export type DetailActionResult = { ok: true } | { ok: false; error: DetailActionError };

function errorOf(err: unknown): DetailActionError {
  const code = codeOf(err);
  if (code === 'FORBIDDEN') return 'forbidden';
  if (code === 'INVALID_INPUT')
    return (err as { field?: string }).field === 'reason' ? 'reason' : 'failed';
  if (code !== 'CONFLICT') return 'failed';
  switch (reasonOf(err)) {
    case 'no_show_too_early':
      return 'tooEarly';
    case 'correction_window_passed':
      return 'window';
    case 'appointment_overlap':
    case 'staff_unavailable':
    case 'resource_unavailable':
      return 'overlap';
    case 'appointment_final':
    case 'transition_not_allowed':
      return 'final';
    default:
      return 'failed';
  }
}

async function run(
  action: string,
  fn: (token: string) => Promise<unknown>,
): Promise<DetailActionResult> {
  const token = await sessionToken();
  if (!token) return { ok: false, error: 'forbidden' };
  try {
    await fn(token);
    return { ok: true };
  } catch (err) {
    reportActionError(action, err, { quietIfExpected: true });
    return { ok: false, error: errorOf(err) };
  }
}

export async function confirmAppointmentAction(appointmentId: string) {
  return run('booking.detail.confirm', (sessionToken) =>
    confirmAppointment({ sessionToken, appointmentId }),
  );
}
export async function startAppointmentAction(appointmentId: string) {
  return run('booking.detail.start', (sessionToken) =>
    startAppointment({ sessionToken, appointmentId }),
  );
}
export async function completeAppointmentAction(appointmentId: string) {
  return run('booking.detail.complete', (sessionToken) =>
    completeAppointment({ sessionToken, appointmentId }),
  );
}
export async function noShowAppointmentAction(appointmentId: string) {
  return run('booking.detail.noShow', (sessionToken) =>
    markNoShow({ sessionToken, appointmentId }),
  );
}
export async function cancelAppointmentAction(appointmentId: string, by: 'client' | 'business') {
  return run('booking.detail.cancel', (sessionToken) =>
    cancelAppointment({ sessionToken, appointmentId, by }),
  );
}
export async function moveAppointmentAction(appointmentId: string, startsAt: string) {
  return run('booking.detail.move', (sessionToken) =>
    moveAppointment({ sessionToken, appointmentId, startsAt }),
  );
}
export async function saveAppointmentNoteAction(appointmentId: string, note: string) {
  return run('booking.detail.note', (sessionToken) =>
    updateAppointmentNote({
      sessionToken,
      appointmentId,
      teamNote: note.trim() ? note.trim() : null,
    }),
  );
}
export async function correctAppointmentAction(
  appointmentId: string,
  status: 'completed' | 'no_show',
  reason: string,
) {
  return run('booking.detail.correct', (sessionToken) =>
    correctAppointmentStatus({ sessionToken, appointmentId, status, reason }),
  );
}
