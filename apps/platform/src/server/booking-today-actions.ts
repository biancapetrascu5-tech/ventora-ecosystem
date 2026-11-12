'use server';

import './access-config';
import { headers } from 'next/headers';
import { authorize } from '@ventora/access';
import {
  completeAppointment,
  confirmAppointment,
  getAppointmentPayments,
  getBusinessHours,
  getClientCard,
  listAppointments,
  listStaff,
  startAppointment,
  type Appointment,
} from '@ventora/booking';
import { getSession } from '@ventora/identity';
import { getOrganizationTimeZone } from '@ventora/organizations';
import { addDays, freeAfter, hhmm, instantsAround, localOf, weekdayOf } from './booking-time';
import { growthRole, readGrowthSlot, type GrowthSlotView } from './growth-slot';
import { reportActionError } from './report-error';

/* Lot B.6b — EasyBook · „Azi” (BookingToday). The business and the person come only from the
   session; every read goes through the booking contracts (booking:read, D-B4-6 = a). The times are
   the business's (C.0). „Au nevoie de tine”: the unconfirmed appointments still to come today and
   the visits of the last 30 days with something still to pay (B.21, fixed price). The requests to
   move have no source yet (the client moves the booking itself, B.11b) and the slot
   `booking.today.aside` is read only for the owner and the admins (the design). */

const UNPAID_DAYS = 30;
const UNPAID_MAX = 30;

export type TodayAppointmentData = {
  id: string;
  staffId: string;
  start: string;
  end: string;
  client: string;
  service: string;
  status: Appointment['status'];
};
export type TodayUnconfirmedData = TodayAppointmentData & { phone: string | null };
export type TodayUnpaidData = {
  id: string;
  client: string;
  amountMinor: number;
  currency: 'RON' | 'EUR';
  visitDate: string;
};

export type TodayPageData = {
  timeZone: string;
  today: string;
  now: string;
  staff: { id: string; name: string }[];
  appointments: TodayAppointmentData[];
  unconfirmed: TodayUnconfirmedData[];
  unpaid: TodayUnpaidData[];
  /** The opening of the day's free time („după 15:00 mai ai 3 ore libere”), when there is one. */
  free: { time: string; hours: number } | null;
  growth: GrowthSlotView | null;
  role: string;
  canWrite: boolean;
};

export type TodayPage =
  | { kind: 'ok'; data: TodayPageData }
  | { kind: 'signedOut' }
  | { kind: 'notEnabled' }
  | { kind: 'forbidden' };

const codeOf = (err: unknown) => (err as { code?: string } | null)?.code;

async function sessionToken(): Promise<string | null> {
  const session = await getSession(await headers());
  return session?.token ?? null;
}

const toData = (a: Appointment, timeZone: string): TodayAppointmentData => {
  const s = localOf(a.startsAt, timeZone);
  const e = localOf(a.endsAt, timeZone);
  return {
    id: a.id,
    staffId: a.staffMemberId,
    start: s.time,
    end: e.date === s.date ? e.time : '24:00',
    client: a.clientName,
    service: a.serviceName,
    status: a.status,
  };
};

export async function readTodayPage(): Promise<TodayPage> {
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
    reportActionError('booking.today.read', err, { quietIfExpected: true });
    return { kind: 'forbidden' };
  }
  const canWrite = await authorize({
    sessionToken: token,
    applicationId: 'booking',
    permission: 'booking:write',
  }).then(
    () => true,
    () => false,
  );
  const timeZone = await getOrganizationTimeZone({ organizationId: ctx.organizationId });
  const here = localOf(new Date(), timeZone);
  const day = instantsAround(here.date, here.date);
  const past = instantsAround(addDays(here.date, -UNPAID_DAYS), addDays(here.date, -1));
  const isOwner = growthRole(ctx.role) !== 'member';

  const [staff, list, done, growth, business] = await Promise.all([
    listStaff({ sessionToken: token }),
    listAppointments({ sessionToken: token, from: day.from, to: day.to, limit: 500 }),
    listAppointments({
      sessionToken: token,
      from: past.from,
      to: day.to,
      status: ['completed'],
      limit: UNPAID_MAX,
    }),
    isOwner ? readGrowthSlot(ctx, 'booking.today.aside') : Promise.resolve(null),
    getBusinessHours({ sessionToken: token }),
  ]);
  const open = business.find((d) => d.weekday === weekdayOf(here.date));
  const closesAt = open?.isOpen && open.closesAtMin !== null ? hhmm(open.closesAtMin) : null;

  const appointments = list.items
    .filter((a) => localOf(a.startsAt, timeZone).date === here.date)
    .map((a) => toData(a, timeZone));

  // the unconfirmed ones still to come today, with the client's phone („Sună”)
  const waiting = appointments
    .filter((a) => a.status === 'unconfirmed' && a.start >= here.time)
    .slice(0, 5);
  const byId = new Map(list.items.map((a) => [a.id, a]));
  const unconfirmed = await Promise.all(
    waiting.map(async (a) => {
      const clientId = byId.get(a.id)?.clientId;
      const card = clientId
        ? await getClientCard({ sessionToken: token, clientId }).catch(() => null)
        : null;
      return { ...a, phone: card?.client.phone ?? null };
    }),
  );

  // B.21: the visits with something still to pay (fixed price; „de la” / interval: the salon sets it)
  const balances = await Promise.all(
    done.items
      .filter((a) => a.price.kind === 'fixed')
      .map(async (a) => {
        const r = await getAppointmentPayments({ sessionToken: token, appointmentId: a.id }).catch(
          () => null,
        );
        const due = r?.balance.outstandingMinor ?? 0;
        return due > 0
          ? {
              id: a.id,
              client: a.clientName,
              amountMinor: due,
              currency: a.price.currency,
              visitDate: localOf(a.startsAt, timeZone).date,
            }
          : null;
      }),
  );

  return {
    kind: 'ok',
    data: {
      timeZone,
      today: here.date,
      now: here.time,
      staff: staff.members.map((m) => ({ id: m.id, name: m.displayName })),
      appointments,
      unconfirmed,
      unpaid: balances.filter((b): b is TodayUnpaidData => b !== null),
      free: closesAt ? freeAfter(appointments, here.time, closesAt) : null,
      growth,
      role: ctx.role,
      canWrite,
    },
  };
}

export type TodayActionResult = { ok: true } | { ok: false; error: 'failed' | 'forbidden' };

async function run(
  action: string,
  fn: (token: string) => Promise<unknown>,
): Promise<TodayActionResult> {
  const token = await sessionToken();
  if (!token) return { ok: false, error: 'forbidden' };
  try {
    await fn(token);
    return { ok: true };
  } catch (err) {
    reportActionError(action, err, { quietIfExpected: true });
    const code = codeOf(err);
    return { ok: false, error: code === 'FORBIDDEN' ? 'forbidden' : 'failed' };
  }
}

/** „Confirmă” (after the Toast's „Anulează” window). */
export async function confirmTodayAppointment(appointmentId: string): Promise<TodayActionResult> {
  return run('booking.today.confirm', (sessionToken) =>
    confirmAppointment({ sessionToken, appointmentId }),
  );
}

/** „Marchează ca încheiată”: a confirmed appointment is started first (B.4a: confirmed → in progress → completed). */
export async function completeTodayAppointment(
  appointmentId: string,
  started: boolean,
): Promise<TodayActionResult> {
  return run('booking.today.complete', async (sessionToken) => {
    if (!started) await startAppointment({ sessionToken, appointmentId });
    await completeAppointment({ sessionToken, appointmentId });
  });
}
