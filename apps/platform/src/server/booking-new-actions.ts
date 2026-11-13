'use server';

import './access-config';
import { randomUUID } from 'node:crypto';
import { headers } from 'next/headers';
import { authorize, checkRolePermission } from '@ventora/access';
import {
  createAppointment,
  getBusinessHours,
  getClientCard,
  getFreeSlots,
  listServiceCategories,
  listServices,
  listStaff,
  listStaffServiceTerms,
  searchClients,
  type Client,
} from '@ventora/booking';
import { getSession } from '@ventora/identity';
import { getOrganizationTimeZone } from '@ventora/organizations';
import { localOf } from './booking-time';
import { reportActionError } from './report-error';

/* Lot B.6c — EasyBook · „Programare nouă” (BookingNew). The business and the person come only
   from the session; every call goes through the booking contracts, which start with authorize():
   booking:write to open the page and create (D-B4-6 = a: a member books only for themselves, and
   without „Oricine e liber”, B.5). The free times are local „HH:MM” of the business's time zone
   (C.0), each with the exact instant the contract computed, which createAppointment takes back:
   the screen never computes an instant itself. No Date objects reach the screen. */

export type NewServiceData = {
  id: string;
  name: string;
  category: string | null;
  durationMinutes: number;
  durationMaxMinutes: number | null;
  priceKind: 'fixed' | 'from' | 'range';
  priceMinor: number;
  priceMaxMinor: number | null;
  currency: 'RON' | 'EUR';
  staffIds: string[];
};
export type NewStaffData = { id: string; name: string; role: string };
export type NewTermsData = {
  staffId: string;
  serviceId: string;
  durationMinutes: number | null;
  durationMaxMinutes: number | null;
  price: { kind: 'fixed' | 'from' | 'range'; minor: number; maxMinor: number | null } | null;
};
export type NewClientData = { id: string; name: string; phone: string | null };

export type NewPageData = {
  services: NewServiceData[];
  staff: NewStaffData[];
  terms: NewTermsData[];
  /** The business's today („YYYY-MM-DD”) and the weekdays it is closed (1 = Monday … 7). */
  today: string;
  closedWeekdays: number[];
  /** „Clienți recenți”, plus the client the booking started from (first). */
  clients: NewClientData[];
  /** Started from the client's profile (`?client=`): the client, chosen. */
  fromClient: NewClientData | null;
  /** D-B4-6: 'own' = a member, only their own appointments; no „Oricine e liber”. */
  scope: 'all' | 'own';
  /** The member's own calendar entry, for 'own'. */
  myStaffId: string | null;
};

export type NewPage =
  | { kind: 'ok'; data: NewPageData }
  | { kind: 'signedOut' }
  | { kind: 'notEnabled' }
  | { kind: 'forbidden' };

const codeOf = (err: unknown) => (err as { code?: string } | null)?.code;
const reasonOf = (err: unknown) => (err as { message?: string } | null)?.message ?? '';

async function sessionToken(): Promise<string | null> {
  const session = await getSession(await headers());
  return session?.token ?? null;
}

const clientOf = (c: Client): NewClientData => ({ id: c.id, name: c.name, phone: c.phone });
const RECENT = 8;

/** The page: who may open it (booking:write), the catalog, the team and their terms. */
export async function readNewPage(params: { clientId?: string }): Promise<NewPage> {
  const token = await sessionToken();
  if (!token) return { kind: 'signedOut' };
  let ctx: Awaited<ReturnType<typeof authorize>>;
  try {
    ctx = await authorize({
      sessionToken: token,
      applicationId: 'booking',
      permission: 'booking:write',
    });
  } catch (err) {
    const code = codeOf(err);
    if (code === 'APP_NOT_ENABLED') return { kind: 'notEnabled' };
    if (code === 'NOT_AUTHENTICATED') return { kind: 'signedOut' };
    reportActionError('booking.new.read', err, { quietIfExpected: true });
    return { kind: 'forbidden' };
  }
  const all =
    ctx.role !== 'support' && (await checkRolePermission(ctx.role, 'booking', 'booking:admin'));
  const timeZone = await getOrganizationTimeZone({ organizationId: ctx.organizationId });
  const [services, categories, staff, terms, business, recent, card] = await Promise.all([
    listServices({ sessionToken: token }),
    listServiceCategories({ sessionToken: token }),
    listStaff({ sessionToken: token }),
    listStaffServiceTerms({ sessionToken: token }),
    getBusinessHours({ sessionToken: token }),
    searchClients({ sessionToken: token, limit: RECENT }),
    params.clientId
      ? getClientCard({ sessionToken: token, clientId: params.clientId }).catch(() => null)
      : Promise.resolve(null),
  ]);
  const order = new Map(categories.map((c, i) => [c.id, i]));
  const nameOf = new Map(categories.map((c) => [c.id, c.name]));
  const active = services
    .filter((s) => !s.archivedAt)
    .sort(
      (a, b) =>
        (order.get(a.categoryId ?? '') ?? 1e6) - (order.get(b.categoryId ?? '') ?? 1e6) ||
        a.sortOrder - b.sortOrder,
    );
  const fromClient =
    card && !card.client.archivedAt && !card.client.erasedAt
      ? { id: card.client.id, name: card.client.name, phone: card.client.phone }
      : null;
  const mine = staff.members.find((m) => m.userId === ctx.userId) ?? null;
  return {
    kind: 'ok',
    data: {
      services: active.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.categoryId ? (nameOf.get(s.categoryId) ?? null) : null,
        durationMinutes: s.durationMinutes,
        durationMaxMinutes: s.durationMaxMinutes,
        priceKind: s.priceKind,
        priceMinor: s.priceMinor,
        priceMaxMinor: s.priceMaxMinor,
        currency: s.currency,
        staffIds: s.doneBy.staffMemberIds,
      })),
      staff: staff.members.map((m) => ({ id: m.id, name: m.displayName, role: m.role })),
      terms: terms.map((x) => ({
        staffId: x.staffMemberId,
        serviceId: x.serviceId,
        durationMinutes: x.durationMinutes,
        durationMaxMinutes: x.durationMaxMinutes,
        price: x.price,
      })),
      today: localOf(new Date(), timeZone).date,
      closedWeekdays: business.filter((d) => !d.isOpen).map((d) => d.weekday),
      clients: [
        ...(fromClient ? [fromClient] : []),
        ...recent.map(clientOf).filter((c) => c.id !== fromClient?.id),
      ],
      fromClient,
      scope: all ? 'all' : 'own',
      myStaffId: mine?.id ?? null,
    },
  };
}

export type NewSlotData = { time: string; available: boolean; startsAt: string };

/** The times of one local day for the service and the member (or „Oricine e liber”). */
export async function readNewSlots(params: {
  serviceId: string;
  staffId: string;
  date: string;
  durationMinutes?: number;
}): Promise<{ ok: true; slots: NewSlotData[] } | { ok: false }> {
  const token = await sessionToken();
  if (!token) return { ok: false };
  try {
    const free = await getFreeSlots({
      sessionToken: token,
      serviceId: params.serviceId,
      staffMemberId: params.staffId,
      from: params.date,
      to: params.date,
      durationMinutes: params.durationMinutes,
    });
    const day = free.days.find((d) => d.date === params.date);
    return {
      ok: true,
      slots: (day?.slots ?? []).map((s) => ({
        time: s.time,
        available: s.available,
        startsAt: s.startsAt.toISOString(),
      })),
    };
  } catch (err) {
    reportActionError('booking.new.slots', err, { quietIfExpected: true });
    return { ok: false };
  }
}

/** The client field: the matches of a query, or „Clienți recenți” without one. */
export async function searchNewClients(query: string): Promise<NewClientData[]> {
  const token = await sessionToken();
  if (!token) return [];
  try {
    const q = query.trim();
    const found = await searchClients({
      sessionToken: token,
      query: q || undefined,
      limit: RECENT,
    });
    return found.map(clientOf);
  } catch (err) {
    reportActionError('booking.new.clients', err, { quietIfExpected: true });
    return [];
  }
}

export type NewCreateInput = {
  /** Chosen once per form: a retry (double click, network) returns the same appointment. */
  id: string;
  serviceId: string;
  staffId: string;
  startsAt: string;
  durationMinutes?: number;
  clientId?: string;
  newClient?: { name: string; phone: string };
  note?: string;
};

/** A refusal the screen shows: a key of booking.new.err, or the overlap notice, or the limit. */
export type NewCreateError =
  | 'failed'
  | 'forbidden'
  | 'overlap'
  | 'anyTaken'
  | 'staffUnavailable'
  | 'notForService'
  | 'resource'
  | 'serviceArchived'
  | 'phoneTaken'
  | 'limit';

export type NewCreateResult = { ok: true; id: string } | { ok: false; error: NewCreateError };

/** „Programează”. */
export async function createNewAppointment(input: NewCreateInput): Promise<NewCreateResult> {
  const token = await sessionToken();
  if (!token) return { ok: false, error: 'forbidden' };
  try {
    const phone = input.newClient?.phone.trim();
    const saved = await createAppointment({
      sessionToken: token,
      id: input.id,
      serviceId: input.serviceId,
      staffMemberId: input.staffId,
      startsAt: input.startsAt,
      durationMinutes: input.durationMinutes,
      ...(input.newClient
        ? { client: { name: input.newClient.name.trim(), phone: phone ? phone : null } }
        : { clientId: input.clientId }),
      teamNote: input.note?.trim() ? input.note.trim() : null,
    });
    return { ok: true, id: saved.id };
  } catch (err) {
    reportActionError('booking.new.create', err, { quietIfExpected: true });
    return { ok: false, error: errorOf(err, input.staffId === 'any') };
  }
}

function errorOf(err: unknown, any: boolean): NewCreateError {
  const code = codeOf(err);
  if (code === 'QUOTA_EXCEEDED') return 'limit';
  if (code === 'FORBIDDEN') return 'forbidden';
  if (code !== 'CONFLICT') return 'failed';
  switch (reasonOf(err)) {
    case 'appointment_overlap':
      return any ? 'anyTaken' : 'overlap';
    case 'staff_unavailable':
    case 'staff_member_removed':
      return 'staffUnavailable';
    case 'staff_not_for_service':
    case 'service_unassigned':
      return 'notForService';
    case 'resource_unavailable':
      return 'resource';
    case 'service_archived':
      return 'serviceArchived';
    case 'client_phone_taken':
      return 'phoneTaken';
    default:
      return 'failed';
  }
}

/** A fresh id for a new form (the page asks for it once). */
export async function newAppointmentId(): Promise<string> {
  return randomUUID();
}
