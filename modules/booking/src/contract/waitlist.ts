import { authorize, checkRolePermission } from '@ventora/access';
import type { TenantContext } from '@ventora/access';
import type { AppointmentScope } from '../server/appointments';
import {
  acceptWaitlistOffer as acceptInOrg,
  addToWaitlistInOrg,
  declineWaitlistOffer as declineInOrg,
  findWaitlistMatchesInOrg,
  issueWaitlistOfferLinkInOrg,
  offerFreedClassSeatsAfter,
  getWaitlistOffer as offerInOrg,
  listWaitlistInOrg,
  offerWaitlistSlotInOrg,
  removeFromWaitlistInOrg,
  type PublicWaitlistOffer,
  type WaitlistEntry,
  type WaitlistEntryStatus,
  type WaitlistOffer,
  type WaitlistTimeKind,
} from '../server/waitlist';

/*
 * Lot B.9c — the contract of the waiting list (design BookingWaitlist, S126; plan
 * reports/2026-11-12_plan-booking-b9.md). The team (Hub): booking:read sees the list and the
 * matches, booking:write adds, removes and offers (a member offers only their own time, D-B4-6).
 * The client's page (/r/<slug>/w/<token>), without a session: the business comes only from the
 * slug, the offer from the token.
 *
 * Errors: InvalidInput (id, clientId, serviceId, staffMemberId, dateFrom, dateTo: order | too_long,
 * time.kind, time.fromMinute, time.toMinute, note, status, startsAt, validMinutes, channel);
 * Conflict (client_archived, service_archived, staff_member_removed, staff_not_for_service,
 * operation_reused, waitlist_entry_closed, waitlist_entry_not_waiting, client_no_email,
 * staff_not_wanted, slot_taken, offer_active, sms_not_available, offer_accepted, offer_closed,
 * offer_expired); ResourceNotFound; Forbidden.
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

export type AddToWaitlistParams = Session & {
  /** A UUID chosen by the caller; a retry with the same id returns the same entry. */
  id: string;
  clientId: string;
  serviceId: string;
  /** A member's id, or 'any' („Oricine e liber”). */
  staffMemberId: string | 'any';
  /** Local dates (YYYY-MM-DD), both included, at most 90 days apart. */
  dateFrom: string;
  dateTo: string;
  time: { kind: WaitlistTimeKind; fromMinute?: number; toMinute?: number };
  note?: string | null;
};
export type ListWaitlistParams = Session & { status?: WaitlistEntryStatus[] };
export type WaitlistEntryIdParams = Session & { entryId: string };
export type FindWaitlistMatchesParams = Session & { staffMemberId: string; startsAt: string };
export type OfferWaitlistSlotParams = Session & {
  entryId: string;
  staffMemberId: string;
  /** ISO 8601 with offset. */
  startsAt: string;
  validMinutes: 30 | 60 | 120;
  channel: 'email' | 'sms';
};
export type WaitlistOfferLinkParams = { slug: string; token: string };

/** „Adaugă pe listă”. */
export async function addToWaitlist(params: AddToWaitlistParams): Promise<WaitlistEntry> {
  const { ctx } = await write(params);
  return addToWaitlistInOrg(ctx, {
    id: params.id,
    clientId: params.clientId,
    serviceId: params.serviceId,
    staffMemberId: params.staffMemberId,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    time: params.time,
    note: params.note,
  });
}

/** „Listă de așteptare · 4”: by default the ones waiting or with an offer sent. */
export async function listWaitlist(
  params: ListWaitlistParams,
): Promise<{ items: WaitlistEntry[]; waiting: number }> {
  return listWaitlistInOrg(await auth(params, 'booking:read'), { status: params.status });
}

/** Off the list (an open offer is withdrawn; B.9d2: its class seat goes to the next one). */
export async function removeFromWaitlist(params: WaitlistEntryIdParams): Promise<WaitlistEntry> {
  const { ctx } = await write(params);
  const removed = await removeFromWaitlistInOrg(ctx, params.entryId);
  if (removed.classSessionId) {
    await offerFreedClassSeatsAfter(ctx.organizationId, removed.classSessionId);
  }
  return removed;
}

export type WaitlistOfferIdParams = Session & { offerId: string };

/**
 * B.9d2: the link of a pending offer, issued again (a new token, shown only here; the old link stops
 * working) — for the automatic offers of a class, which are made without a link, and for the e-mail
 * of B.13. booking:write; a member only for their own time.
 */
export async function issueWaitlistOfferLink(
  params: WaitlistOfferIdParams,
): Promise<{ offerId: string; token: string; expiresAt: Date }> {
  const { ctx, scope } = await write(params);
  return issueWaitlistOfferLinkInOrg(ctx, scope, params.offerId);
}

/** „S-a eliberat … la Ioana Pavel”: the matching clients, in the order they were added. */
export async function findWaitlistMatches(
  params: FindWaitlistMatchesParams,
): Promise<WaitlistEntry[]> {
  return findWaitlistMatchesInOrg(await auth(params, 'booking:read'), {
    staffMemberId: params.staffMemberId,
    startsAt: params.startsAt,
  });
}

/** „Oferă locul”: the offer and its link token (shown only here; the e-mail is B.13). */
export async function offerWaitlistSlot(
  params: OfferWaitlistSlotParams,
): Promise<{ offer: WaitlistOffer; token: string }> {
  const { ctx, scope } = await write(params);
  return offerWaitlistSlotInOrg(ctx, scope, {
    entryId: params.entryId,
    staffMemberId: params.staffMemberId,
    startsAt: params.startsAt,
    validMinutes: params.validMinutes,
    channel: params.channel,
  });
}

/** The client's page: „S-a eliberat un loc”. */
export function getWaitlistOffer(params: WaitlistOfferLinkParams): Promise<PublicWaitlistOffer> {
  return offerInOrg(params.slug, params.token);
}

/** „Iau locul”: the booking and its link (B.11b). */
export function acceptWaitlistOffer(
  params: WaitlistOfferLinkParams,
): Promise<{ appointmentId: string; number: number; startsAt: Date; manageToken: string }> {
  return acceptInOrg(params.slug, params.token);
}

/** „Nu mai am nevoie”. */
export function declineWaitlistOffer(params: WaitlistOfferLinkParams): Promise<void> {
  return declineInOrg(params.slug, params.token);
}
