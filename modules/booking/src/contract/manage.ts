import {
  cancelManagedBooking as cancelInOrg,
  confirmManagedMove as confirmInOrg,
  getManagedBooking as bookingInOrg,
  getManagedFreeSlots as slotsInOrg,
  startManagedMove as startInOrg,
  type ManagedBooking,
  type ManagedCancel,
  type ManagedChange,
  type ManagedMoveHold,
  type ManageState,
  type MoveRefusal,
} from '../server/manage';
import type { FreeSlots } from '../server/availability';

/*
 * Lot B.11b — the contract of the client's page for moving or cancelling a booking
 * (/r/<slug>/m/<token>), without a session: the business comes only from the slug, the booking
 * from the token. The route passes the caller's IP from the request, never from the body.
 * Errors: ResourceNotFound (slug; token unknown, malformed or revoked; hold); InvalidInput
 * (startsAt: invalid | same; from / to); Conflict (the state: too_late, cancelled, over,
 * online_closed; the move: moved_once, manual_confirmation; slot_taken, rate_limited,
 * hold_expired).
 */

/** „Programarea dumneavoastră”: the booking, the policy and what the client may do. */
export function getManagedBooking(params: {
  slug: string;
  token: string;
}): Promise<ManagedBooking> {
  return bookingInOrg(params.slug, params.token);
}

/** Other times for the same service and member (the booking's own time is free for it). */
export function getManagedFreeSlots(params: {
  slug: string;
  token: string;
  from: string;
  to: string;
}): Promise<FreeSlots> {
  return slotsInOrg(params.slug, params);
}

/** „Mută programarea”: the new time held 10 minutes; the old one stays until the confirmation. */
export function startManagedMove(params: {
  slug: string;
  token: string;
  startsAt: string;
  ip: string | null;
}): Promise<ManagedMoveHold> {
  return startInOrg(params.slug, params);
}

/** „Confirmă” the move; after the 10 minutes: hold_expired, the booking unchanged. */
export function confirmManagedMove(params: {
  slug: string;
  token: string;
  holdId: string;
}): Promise<ManagedChange> {
  return confirmInOrg(params.slug, params);
}

/** „Da, anulează programarea”; `late` when inside the free cancellation of the business. */
export function cancelManagedBooking(params: {
  slug: string;
  token: string;
}): Promise<ManagedCancel> {
  return cancelInOrg(params.slug, params);
}

export type {
  ManagedBooking,
  ManagedCancel,
  ManagedChange,
  ManagedMoveHold,
  ManageState,
  MoveRefusal,
};
