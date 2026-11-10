import { authorize } from '@ventora/access';
import {
  findFirstFreeSlotInOrg,
  getFreeSlotsInOrg,
  type FirstFreeSlot,
  type FreeSlots,
} from '../server/availability';

/*
 * Lot B.5 — the public contract of the free slots (design BookingNew `SlotPicker` / „Oricine e
 * liber”, BookingCalendar and BookingStates „Primul loc liber”; plan
 * reports/2026-11-10_1115_plan-booking-b5.md, approved 10.11.2026). booking:read: whoever sees the
 * calendar sees where it is free. The team rules (D-B5-3 = a): from now on, no notice, every member
 * in the calendar, a duration between the service's minimum and maximum (S123-3). The online rules
 * (notice, bookable online, 30 days) are for the public page (B.11), from its own context.
 *
 * Errors: InvalidInput (from / to / durationMinutes); Conflict('staff_member_removed') for a member
 * out of the calendar or no longer eligible; ResourceNotFound for a service or member that does
 * not exist (or belongs to another business, T1); AppNotEnabled.
 */

type Session = { sessionToken: string };

const read = (params: Session) =>
  authorize({
    sessionToken: params.sessionToken,
    applicationId: 'booking',
    permission: 'booking:read',
  });

export type GetFreeSlotsParams = Session & {
  serviceId: string;
  /** A member's id, or 'any' („Oricine e liber”). */
  staffMemberId: string | 'any';
  /** Local dates (YYYY-MM-DD) in the business time zone, at most 7 days. */
  from: string;
  to: string;
  /** Between the service's minimum and maximum; by default the maximum (S123-3). */
  durationMinutes?: number;
};

export type FindFirstFreeSlotParams = Session & {
  serviceId: string;
  staffMemberId: string | 'any';
  /** Local date to search from; by default today. The search stops 62 days from today. */
  from?: string;
  durationMinutes?: number;
};

/** BookingNew: the start times of a service with a member or „Oricine e liber”, day by day. */
export async function getFreeSlots(params: GetFreeSlotsParams): Promise<FreeSlots> {
  return getFreeSlotsInOrg(await read(params), {
    serviceId: params.serviceId,
    staffMemberId: params.staffMemberId,
    from: params.from,
    to: params.to,
    durationMinutes: params.durationMinutes,
    mode: 'team',
  });
}

/** „Primul loc liber”: the next free start (date, time, member), or null within 62 days. */
export async function findFirstFreeSlot(
  params: FindFirstFreeSlotParams,
): Promise<FirstFreeSlot | null> {
  return findFirstFreeSlotInOrg(await read(params), {
    serviceId: params.serviceId,
    staffMemberId: params.staffMemberId,
    from: params.from,
    durationMinutes: params.durationMinutes,
    mode: 'team',
  });
}
