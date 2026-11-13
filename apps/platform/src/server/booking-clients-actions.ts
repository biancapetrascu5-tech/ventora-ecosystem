'use server';

import './access-config';
import { headers } from 'next/headers';
import { authorize, checkRolePermission } from '@ventora/access';
import {
  getClientCard,
  getClientPaymentTotals,
  listClientAppointments,
  listStaff,
  removeBehaviorNote,
  type AppointmentStatus,
} from '@ventora/booking';
import { getSession } from '@ventora/identity';
import { getOrganizationTimeZone } from '@ventora/organizations';
import { localOf } from './booking-time';
import { reportActionError } from './report-error';

/* Decision 7, screen 4 — EasyBook · „Fișa clientului” (BookingClientCard, S116 c). The business
   and the person come only from the session; the booking contracts start with authorize()
   (booking:read). Who sees what (S116-D11): the owner, the admins and the application manager
   (booking:admin) see the whole history, the figures and the note „Risc ridicat”; a member sees
   only their own appointments with the client. The note is removed with booking:admin (S116-D12),
   with a reason written to the business log. Instants become local dates of the business here. */

export type ClientHistoryRow = {
  id: string;
  date: string;
  time: string;
  service: string;
  member: string;
  priceMinor: number;
  currency: 'RON' | 'EUR';
  status: AppointmentStatus;
};

export type ClientCardData = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  /** The month the client was added, as a local date (first day). */
  since: string;
  /** 'all': the owner, an admin, the application manager; 'own': a member. */
  scope: 'all' | 'own';
  canClearNote: boolean;
  stats: {
    visits: number;
    noShows: number;
    lateCancellations: number;
    spent: { minor: number; currency: 'RON' | 'EUR' } | null;
  } | null;
  /** „Risc ridicat”, with the dates of the no-shows that count (local dates, oldest first). */
  risk: { noShows: number; months: number; dates: string[] } | null;
  history: ClientHistoryRow[];
  today: string;
};

export type ClientCardResult =
  | { kind: 'ok'; data: ClientCardData }
  | { kind: 'signedOut' }
  | { kind: 'notEnabled' }
  | { kind: 'notFound' }
  | { kind: 'forbidden' };

const codeOf = (err: unknown) => (err as { code?: string } | null)?.code;

async function sessionToken(): Promise<string | null> {
  const session = await getSession(await headers());
  return session?.token ?? null;
}

export async function readClientCard(clientId: string): Promise<ClientCardResult> {
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
    reportActionError('booking.client.read', err, { quietIfExpected: true });
    return { kind: 'forbidden' };
  }
  try {
    const admin =
      ctx.role === 'support'
        ? false
        : await checkRolePermission(ctx.role, 'booking', 'booking:admin');
    const [card, list, staff, totals, timeZone] = await Promise.all([
      getClientCard({ sessionToken: token, clientId }),
      listClientAppointments({ sessionToken: token, clientId, limit: 100 }),
      listStaff({ sessionToken: token }),
      admin ? getClientPaymentTotals({ sessionToken: token, clientId }) : Promise.resolve([]),
      getOrganizationTimeZone({ organizationId: ctx.organizationId }),
    ]);
    if (card.client.erasedAt) return { kind: 'notFound' };
    const me = staff.members.find((m) => m.userId === ctx.userId)?.displayName ?? null;
    const all = list.items.map((a) => {
      const at = localOf(a.startsAt, timeZone);
      return {
        id: a.id,
        date: at.date,
        time: at.time,
        service: a.serviceName,
        member: a.staffDisplayName,
        priceMinor: a.priceMinor,
        currency: (a.currency.trim() === 'EUR' ? 'EUR' : 'RON') as 'RON' | 'EUR',
        status: a.status as AppointmentStatus,
      };
    });
    const history = admin ? all : all.filter((r) => me !== null && r.member === me);
    const note = admin ? card.behaviorNote : null;
    const today = localOf(new Date(), timeZone).date;
    // the no-shows that count: the newest ones (the list is newest first)
    const noShowDates = note
      ? all
          .filter((r) => r.status === 'no_show')
          .slice(0, note.noShows)
          .map((r) => r.date)
          .reverse()
      : [];
    const spent = totals.length ? totals.reduce((a, b) => (b.netMinor > a.netMinor ? b : a)) : null;
    const created = localOf(card.client.createdAt, timeZone).date;
    return {
      kind: 'ok',
      data: {
        id: card.client.id,
        name: card.client.name,
        phone: card.client.phone,
        email: card.client.email,
        since: `${created.slice(0, 8)}01`,
        scope: admin ? 'all' : 'own',
        canClearNote: admin,
        stats: admin
          ? {
              visits: card.stats.visits,
              noShows: card.stats.noShows,
              lateCancellations: card.stats.lateCancellations,
              spent: spent ? { minor: spent.netMinor, currency: spent.currency } : null,
            }
          : null,
        risk: note ? { noShows: note.noShows, months: note.months, dates: noShowDates } : null,
        history,
        today,
      },
    };
  } catch (err) {
    if (codeOf(err) === 'NOT_FOUND') return { kind: 'notFound' };
    reportActionError('booking.client.read', err, { quietIfExpected: true });
    return { kind: 'forbidden' };
  }
}

export type ClearNoteResult = { ok: true } | { ok: false; error: 'reason' | 'failed' };

/** „Șterge nota…” (booking:admin): the reason (10–500 characters) goes to the business log. */
export async function clearBehaviorNoteAction(
  clientId: string,
  reason: string,
): Promise<ClearNoteResult> {
  const token = await sessionToken();
  if (!token) return { ok: false, error: 'failed' };
  if (reason.trim().length < 10) return { ok: false, error: 'reason' };
  try {
    await removeBehaviorNote({ sessionToken: token, clientId, reason: reason.trim() });
    return { ok: true };
  } catch (err) {
    reportActionError('booking.client.clearNote', err, { quietIfExpected: true });
    return {
      ok: false,
      error: (err as { field?: string }).field === 'reason' ? 'reason' : 'failed',
    };
  }
}
